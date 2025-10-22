import {ICryoClientWebsocketSessionEvents, PendingBinaryMessage} from "./types/CryoClientWebsocketSession.js";
import {AckTracker} from "../Common/AckTracker/AckTracker.js";
import CryoFrameFormatter, {BinaryMessageType} from "../Common/CryoBinaryMessage/CryoFrameFormatter.js";
import {CryoFrameInspector} from "../Common/CryoFrameInspector/CryoFrameInspector.js";
import {CreateDebugLogger, DebugLoggerFunction} from "../Common/Util/CreateDebugLogger.js";
import {CryoBuffer} from "../Common/CryoBuffer/CryoBuffer.js";
import {CryoEventEmitter} from "../Common/CryoEventEmitter/CryoEventEmitter.js";
import {CryoCryptoBox} from "./CryoCryptoBox.js";
import {CryoHandshakeEngine, HandshakeEvents} from "./CryoHandshakeEngine.js";
import {CryoFrameRouter} from "./CryoFrameRouter.js";

type UUID = `${string}-${string}-${string}-${string}-${string}`;

enum CloseCode {
    CLOSE_GRACEFUL = 4000,
    CLOSE_CLIENT_ERROR = 4001,
    CLOSE_SERVER_ERROR = 4002,
    CLOSE_CALE_MISMATCH = 4010,
    CLOSE_CALE_HANDSHAKE = 4011
}

type Buffer = CryoBuffer;

function once<T extends keyof WebSocketEventMap>(socket: WebSocket, type: T, handler: (ev: WebSocketEventMap[T]) => void) {
    const wrapper = (ev: WebSocketEventMap[T]) => {
        socket.removeEventListener(type, wrapper);
        handler(ev);
    };
    socket.addEventListener(type, wrapper);
}

/*
* Cryo Websocket session layer. Handles Binary formatting and ACKs and whatnot
* */
export class CryoClientWebsocketSession extends CryoEventEmitter<ICryoClientWebsocketSessionEvents> implements CryoClientWebsocketSession {
    private messages_pending_server_ack = new Map<number, PendingBinaryMessage>();
    private server_ack_tracker: AckTracker = new AckTracker();
    private current_ack = 0;

    private readonly ping_pong_formatter = CryoFrameFormatter.GetFormatter("ping_pong");
    private readonly ack_formatter = CryoFrameFormatter.GetFormatter("ack");
    private readonly error_formatter = CryoFrameFormatter.GetFormatter("error");
    private readonly utf8_formatter = CryoFrameFormatter.GetFormatter("utf8data");
    private readonly binary_formatter = CryoFrameFormatter.GetFormatter("binarydata");

    private crypto: CryoCryptoBox | null = null;
    private handshake: CryoHandshakeEngine | null = null;
    private router: CryoFrameRouter;

    private constructor(private host: string, private sid: UUID, private socket: WebSocket, private timeout: number, private bearer: string, private use_cale: boolean, private log: DebugLoggerFunction = CreateDebugLogger("CRYO_CLIENT_SESSION")) {
        super();
        if (use_cale) {
            const handshake_events: HandshakeEvents = {
                onSecure: ({transmit_key, receive_key}) => {
                    this.crypto = new CryoCryptoBox(transmit_key, receive_key);
                    this.log("Channel secured.");
                    this.emit("connected", undefined); // only emit once we’re secure
                },
                onFailure: (reason: string) => {
                    this.log(`Handshake failure: ${reason}`);
                    this.Destroy(CloseCode.CLOSE_CALE_HANDSHAKE, "Failure during CALE handshake.");
                }
            };

            this.handshake = new CryoHandshakeEngine(
                this.sid,
                async (buf) => this.socket.send(buf.buffer), // raw plaintext send
                CryoFrameFormatter,
                () => this.current_ack++,
                handshake_events,
            );

            this.router = new CryoFrameRouter(
                CryoFrameFormatter,
                () => this.handshake!.is_secure,
                async (b) => this.crypto!.decrypt(b),
                {
                    on_ping_pong: async (b) => this.HandlePingPongMessage(b),
                    on_ack: async (b) => this.HandleAckMessage(b),
                    on_error: async (b) => this.HandleErrorMessage(b),
                    on_utf8: async (b) => this.HandleUTF8DataMessage(b),
                    on_binary: async (b) => this.HandleBinaryDataMessage(b),

                    on_server_hello: async (b) => this.handshake!.on_server_hello(b),
                    on_handshake_done: async (b) => this.handshake!.on_server_handshake_done(b)
                }
            );
        } else {
            this.log("CALE disabled, running in unencrypted mode.");
            this.router = new CryoFrameRouter(
                CryoFrameFormatter,
                () => false,
                async (b) => b,
                {
                    on_ping_pong: async (b) => this.HandlePingPongMessage(b),
                    on_ack: async (b) => this.HandleAckMessage(b),
                    on_error: async (b) => this.HandleErrorMessage(b),
                    on_utf8: async (b) => this.HandleUTF8DataMessage(b),
                    on_binary: async (b) => this.HandleBinaryDataMessage(b),
                    on_server_hello: async (_b) => this.Destroy(CloseCode.CLOSE_CALE_MISMATCH, "CALE Mismatch. The server excepts CALE encryption, which is currently disabled.")
                }
            );

            setTimeout(() => this.emit("connected", undefined));
        }


        this.AttachListenersToSocket(socket);
    }

    private AttachListenersToSocket(socket: WebSocket) {
        if (this.use_cale) {
            once(socket, "message", (msg: MessageEvent) => {
                //If the first read frame IS NOT SERVER_HELLO, fail and die in an explosion.
                if (!(msg.data instanceof ArrayBuffer))
                    return;

                const raw = new CryoBuffer(new Uint8Array(msg.data));
                const type = CryoFrameFormatter.GetType(raw);

                if (type !== BinaryMessageType.SERVER_HELLO) {
                    this.log(`CALE mismatch: expected SERVER_HELLO, got ${type}`);
                    this.Destroy(CloseCode.CLOSE_CALE_MISMATCH, "CALE mismatch: The server has disabled CALE.");
                    return;
                }

                this.router.do_route(raw).then(() => {
                    socket.addEventListener("message", async (msg: MessageEvent) => {
                        if (msg.data instanceof ArrayBuffer)
                            await this.router.do_route(new CryoBuffer(new Uint8Array(msg.data)));
                    });
                })
            });
        } else {
            socket.addEventListener("message", async (msg: MessageEvent) => {
                if (msg.data instanceof ArrayBuffer)
                    await this.router.do_route(new CryoBuffer(new Uint8Array(msg.data)));
            });
        }

        socket.addEventListener("error", async (error_event) => {
            await this.HandleError(new Error("Unspecified WebSocket error!", {cause: error_event}));
        });

        socket.addEventListener("close", async (close_event) => {
            await this.HandleClose(close_event.code, new CryoBuffer((new TextEncoder().encode(close_event.reason))));
        });
    }

    private static async ConstructSocket(host: string, timeout: number, bearer: string, sid: string): Promise<WebSocket> {
        const full_host_url = new URL(host);
        full_host_url.searchParams.set("authorization", `Bearer ${bearer}`);
        full_host_url.searchParams.set("x-cryo-sid", sid);
        const sck = new WebSocket(full_host_url);
        sck.binaryType = "arraybuffer";

        return new Promise<WebSocket>((resolve, reject) => {
            setTimeout(() => {
                if (sck.readyState !== WebSocket.OPEN)
                    reject(new Error(`Connection timeout of ${timeout} ms reached!`));
            }, timeout)
            sck.addEventListener("open", () => {
                resolve(sck);
            })
            sck.addEventListener("error", (err) => {
                reject(new Error(`Error during session initialisation!`, {cause: err}));
            });
        })
    }

    public static async Connect(host: string, bearer: string, use_cale: boolean = true, timeout: number = 5000): Promise<CryoClientWebsocketSession> {
        const sid: UUID = crypto.randomUUID();

        const socket = await CryoClientWebsocketSession.ConstructSocket(host, timeout, bearer, sid);
        return new CryoClientWebsocketSession(host, sid, socket, timeout, bearer, use_cale);
    }

    /*
    * Handle an outgoing binary message
    * */
    private async HandleOutgoingBinaryMessage(outgoing_message: CryoBuffer): Promise<void> {
        if (this.socket.readyState === WebSocket.CLOSING || this.socket.readyState === WebSocket.CLOSED)
            return;

        //Create a pending message with a new ack number and queue it for acknowledgement by the server
        const type = CryoFrameFormatter.GetType(outgoing_message);
        if (type === BinaryMessageType.UTF8DATA || type === BinaryMessageType.BINARYDATA) {
            const message_ack = CryoFrameFormatter.GetAck(outgoing_message);
            this.server_ack_tracker.Track(message_ack, {
                timestamp: Date.now(),
                message: outgoing_message
            });
        }

        //Send the message buffer to the server
        if (!this.socket)
            return;

        let message = outgoing_message;
        if (this.use_cale && this.secure) {
            message = await this.crypto!.encrypt(outgoing_message);
        }

        try {
            this.socket.send(message.buffer);
        } catch (ex) {
            if (ex instanceof Error)
                this.HandleError(ex).then(r => null);
        }

        this.log(`Sent ${CryoFrameInspector.Inspect(outgoing_message)} to server.`);


    }

    /*
    * Respond to PONG frames with PING and vice versa
    * */
    private async HandlePingPongMessage(message: CryoBuffer): Promise<void> {
        const decodedPingPongMessage = this.ping_pong_formatter
            .Deserialize(message);

        const ping_pongMessage = this.ping_pong_formatter
            .Serialize(this.sid, decodedPingPongMessage.ack, decodedPingPongMessage.payload === "pong" ? "ping" : "pong");

        await this.HandleOutgoingBinaryMessage(ping_pongMessage);
    }

    /*
    * Handling of binary error messages from the server, currently just log it
    * */
    private async HandleErrorMessage(message: CryoBuffer): Promise<void> {
        const decodedErrorMessage = this.error_formatter
            .Deserialize(message);

        this.log(decodedErrorMessage.payload);
    }

    /*
    * Locally ACK the pending message if it matches the server's ACK
    * */
    private async HandleAckMessage(message: Buffer): Promise<void> {
        const decodedAckMessage = this.ack_formatter
            .Deserialize(message);
        const ack_id = decodedAckMessage.ack;

        const found_message = this.server_ack_tracker.Confirm(ack_id);

        if (!found_message) {
            this.log(`Got unknown ack_id ${ack_id} from server.`);
            return;
        }

        this.messages_pending_server_ack.delete(ack_id);
        this.log(`Got ACK ${ack_id} from server.`);
    }

    /*
    * Extract payload from the binary message and emit the message event with the utf8 payload
    * */
    private async HandleUTF8DataMessage(message: Buffer): Promise<void> {
        const decodedDataMessage = this.utf8_formatter
            .Deserialize(message);

        const payload = decodedDataMessage.payload;

        const encodedAckMessage = this.ack_formatter
            .Serialize(this.sid, decodedDataMessage.ack);

        await this.HandleOutgoingBinaryMessage(encodedAckMessage);
        this.emit("message-utf8", payload);
    }

    /*
    * Extract payload from the binary message and emit the message event with the binary payload
    * */
    private async HandleBinaryDataMessage(message: Buffer): Promise<void> {
        const decodedDataMessage = this.binary_formatter
            .Deserialize(message);

        const payload = decodedDataMessage.payload;

        const encodedAckMessage = this.ack_formatter
            .Serialize(this.sid, decodedDataMessage.ack);

        await this.HandleOutgoingBinaryMessage(encodedAckMessage);
        this.emit("message-binary", payload);
    }

    private async HandleError(err: Error) {
        this.log(`${err.name} Exception in CryoSocket: ${err.message}`);
        this.socket.close(CloseCode.CLOSE_SERVER_ERROR, `CryoSocket ${this.sid} was closed due to an error.`);
    }

    private TranslateCloseCode(code: number): string {
        switch (code as CloseCode) {
            case CloseCode.CLOSE_GRACEFUL:
                return "Connection closed normally.";
            case CloseCode.CLOSE_CLIENT_ERROR:
                return "Connection closed due to a client error.";
            case CloseCode.CLOSE_SERVER_ERROR:
                return "Connection closed due to a server error.";
            case CloseCode.CLOSE_CALE_MISMATCH:
                return "Connection closed due to a mismatch in client/server CALE configuration.";
            case CloseCode.CLOSE_CALE_HANDSHAKE:
                return "Connection closed due to an error in the CALE handshake.";
            default:
                return "Unspecified cause for connection closure."
        }
    }

    private async HandleClose(code: number, reason: Buffer) {
        console.warn(`Websocket was closed. Code=${code} (${this.TranslateCloseCode(code)}), reason=${reason.toString("utf8")}.`);

        if (code !== CloseCode.CLOSE_SERVER_ERROR)
            return;

        let current_attempt = 0;
        let back_off_delay = 5000;

        //If the connection was not normally closed, try to reconnect
        console.error(`Abnormal termination of Websocket connection, attempting to reconnect...`);
        ///@ts-expect-error
        this.socket = null;

        this.emit("disconnected", undefined)
        while (current_attempt < 5) {
            try {
                this.socket = await CryoClientWebsocketSession.ConstructSocket(this.host, this.timeout, this.bearer, this.sid);
                this.AttachListenersToSocket(this.socket);

                this.emit("reconnected", undefined);
                return;
            } catch (ex) {
                if (ex instanceof Error) {
                    ///@ts-expect-error
                    const errorCode = ex.cause?.error?.code as string;
                    console.warn(`Unable to reconnect to '${this.host}'. Error code: '${errorCode}'. Retry attempt in ${back_off_delay} ms. Attempt ${current_attempt++} / 5`);
                    await new Promise((resolve) => setTimeout(resolve, back_off_delay));
                    back_off_delay += current_attempt * 1000;
                }
            }
        }

        console.error(`Gave up on reconnecting to '${this.host}'`);

        if (this.socket)
            this.socket.close();

        this.emit("closed", [code, reason.toString("utf8")]);
    }

    /*
    * Send an utf8 message to the server
    * */
    public async SendUTF8(message: string): Promise<void> {
        const new_ack_id = this.current_ack++;

        const formatted_message = CryoFrameFormatter
            .GetFormatter("utf8data")
            .Serialize(this.sid, new_ack_id, message);

        await this.HandleOutgoingBinaryMessage(formatted_message);
    }

    /*
    * Send a binary message to the server
    * */
    public async SendBinary(message: CryoBuffer): Promise<void> {
        const new_ack_id = this.current_ack++;

        const formatted_message = CryoFrameFormatter
            .GetFormatter("binarydata")
            .Serialize(this.sid, new_ack_id, message);

        await this.HandleOutgoingBinaryMessage(formatted_message);
    }

    public Close(): void {
        this.Destroy(CloseCode.CLOSE_GRACEFUL, "Client finished.");
    }

    public get secure(): boolean {
        return this.use_cale && this.crypto !== null;
    }

    public get session_id(): UUID {
        return this.sid;
    }

    public Destroy(code: number = 1000, message: string = "") {
        this.log(`Teardown of session. Code=${code}, reason=${message}`);
        this.socket.close(code, message);
    }
}
