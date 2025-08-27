import {ICryoClientWebsocketSessionEvents, PendingBinaryMessage} from "./types/CryoClientWebsocketSession.js";
import {AckTracker} from "../Common/AckTracker/AckTracker.js";
import CryoBinaryMessageFormatterFactory, {
    BinaryMessageType
} from "../Common/CryoBinaryMessage/CryoBinaryMessageFormatterFactory.js";
import {CryoFrameInspector} from "../Common/CryoFrameInspector/CryoFrameInspector.js";

type UUID = `${string}-${string}-${string}-${string}-${string}`;

import {CreateDebugLogger, DebugLoggerFunction} from "../Common/Util/CreateDebugLogger.js";
import {CryoBuffer} from "../Common/CryoBuffer/CryoBuffer.js";
import {CryoEventEmitter} from "../Common/CryoEventEmitter/CryoEventEmitter.js";

/*
* Cryo Websocket session layer. Handles Binary formatting and ACKs and whatnot
* */
export class CryoClientWebsocketSession extends CryoEventEmitter<ICryoClientWebsocketSessionEvents> implements CryoClientWebsocketSession {
    private messages_pending_server_ack = new Map<number, PendingBinaryMessage>();
    private server_ack_tracker: AckTracker = new AckTracker();
    private current_ack = 0;

    private readonly ping_pong_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("ping_pong");
    private readonly ack_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("ack");
    private readonly error_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("error");
    private readonly utf8_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("utf8data");
    private readonly binary_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("binarydata");

    /*
    * Handle an outgoing binary message
    * */
    private HandleOutgoingBinaryMessage(message: CryoBuffer): void {
        //Create a pending message with a new ack number and queue it for acknowledgement by the server
        const message_ack = CryoBinaryMessageFormatterFactory.GetAck(message);
        this.server_ack_tracker.Track(message_ack, {
            timestamp: Date.now(),
            message
        });

        //Send the message buffer to the server
        if (!this.socket)
            return;

        this.socket.send(message.buffer);

        this.log(`Sent ${CryoFrameInspector.Inspect(message)} to server.`);
    }

    /*
    * Respond to PONG frames with PING and vice versa
    * */
    private HandlePingPongMessage(message: CryoBuffer): void {
        const decodedPingPongMessage = this.ping_pong_formatter
            .Deserialize(message);

        const ping_pongMessage = this.ping_pong_formatter
            .Serialize(this.sid, decodedPingPongMessage.ack, decodedPingPongMessage.payload === "pong" ? "ping" : "pong");

        this.HandleOutgoingBinaryMessage(ping_pongMessage);
    }

    /*
    * Handling of binary error messages from the server, currently just log it
    * */
    private HandleErrorMessage(message: CryoBuffer): void {
        const decodedErrorMessage = this.error_formatter
            .Deserialize(message);

        this.log(decodedErrorMessage.payload);
    }

    /*
    * Locally ACK the pending message if it matches the server's ACK
    * */
    private async HandleAckMessage(message: CryoBuffer): Promise<void> {
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
    private HandleUTF8DataMessage(message: CryoBuffer): void {
        const decodedDataMessage = this.utf8_formatter
            .Deserialize(message);

        const payload = decodedDataMessage.payload;
        const sender_sid = decodedDataMessage.sid;

        const encodedAckMessage = this.ack_formatter
            .Serialize(this.sid, decodedDataMessage.ack);

        this.HandleOutgoingBinaryMessage(encodedAckMessage);
        this.emit("message-utf8", payload);
    }

    /*
    * Extract payload from the binary message and emit the message event with the binary payload
    * */
    private HandleBinaryDataMessage(message: CryoBuffer): void {
        const decodedDataMessage = this.binary_formatter
            .Deserialize(message);

        const payload = decodedDataMessage.payload;
        const sender_sid = decodedDataMessage.sid;

        const encodedAckMessage = this.ack_formatter
            .Serialize(this.sid, decodedDataMessage.ack);

        this.HandleOutgoingBinaryMessage(encodedAckMessage);
        this.emit("message-binary", payload);
    }

    /*
    * Handle incoming binary messages
    * */
    private async HandleIncomingBinaryMessage(message: CryoBuffer): Promise<void> {
        const message_type = CryoBinaryMessageFormatterFactory.GetType(message);
        this.log(`Received ${CryoFrameInspector.Inspect(message)} from server.`);

        switch (message_type) {
            case BinaryMessageType.PING_PONG:
                this.HandlePingPongMessage(message);
                return;
            case BinaryMessageType.ERROR:
                this.HandleErrorMessage(message);
                return;
            case BinaryMessageType.ACK:
                await this.HandleAckMessage(message);
                return;
            case BinaryMessageType.UTF8DATA:
                this.HandleUTF8DataMessage(message);
                return;
            case BinaryMessageType.BINARYDATA:
                this.HandleBinaryDataMessage(message);
                return;
            default:
                throw new Error(`Handle binary message type ${message_type}!`);
        }
    }

    private async HandleError(err: Error) {
        this.log(`${err.name} Exception in CryoSocket: ${err.message}`);
        this.socket.close(1000, `CryoSocket ${this.sid} was closed due to an error.`);
    }

    private TranslateCloseCode(code: number): string {
        switch (code) {
            case 1000:
                return "Connection closed normally.";
            case 1006:
                return "Connection closed abnormally."
            default:
                return "Unspecified cause for connection closure."
        }
    }

    private async HandleClose(code: number, reason: CryoBuffer) {
        this.log(`CryoSocket was closed, code '${code}' (${this.TranslateCloseCode(code)}), reason '${reason.toString("utf8")}' .`);

        if (code !== 1000) {
            let current_attempt = 0;
            //If the connection was not normally closed, try to reconnect
            this.log(`Abnormal termination of Websocket connection, attempting to reconnect...`);
            ///@ts-expect-error
            this.socket = null;

            this.emit("disconnected", undefined);
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
                        console.warn(`Unable to reconnect to '${this.host}'. Error code: '${errorCode}'. Retry attempt ${++current_attempt} / 5 ...`);
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                }
            }

            console.warn(`Gave up on reconnecting to '${this.host}'.`)
            return;
        }

        if (this.socket)
            this.socket.close();

        this.emit("closed", [code, reason.toString("utf8")]);
    }

    private constructor(private host: string, private sid: UUID, private socket: WebSocket, private timeout: number, private bearer: string, private log: DebugLoggerFunction = CreateDebugLogger("CRYO_CLIENT_SESSION")) {
        super();

        this.AttachListenersToSocket(socket);

        setTimeout(() => this.emit("connected", undefined), 0);
    }

    private AttachListenersToSocket(socket: WebSocket) {
        socket.addEventListener("message", async (message_event: MessageEvent) => {
            const raw_data = message_event.data;

            if (raw_data instanceof ArrayBuffer) {
                await this.HandleIncomingBinaryMessage(new CryoBuffer(new Uint8Array(raw_data)));
            } else {
                this.log("Received text message instead of binary!");
            }
        });

        socket.addEventListener("error", async (error_event) => {
            await this.HandleError(new Error("Unspecified WebSocket error!"));
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
                /*
                                sck.("error");
                */
                resolve(sck);
            })
            sck.addEventListener("error", (err) => {
                reject(new Error(`Error during session initialisation!`, {cause: err}));
            });
        })
    }

    public static async Connect(host: string, bearer: string, timeout: number = 5000): Promise<CryoClientWebsocketSession> {
        const sid: UUID = crypto.randomUUID();

        const socket = await CryoClientWebsocketSession.ConstructSocket(host, timeout, bearer, sid);
        return new CryoClientWebsocketSession(host, sid, socket, timeout, bearer);
    }

    /*
    * Send an utf8 message to the server
    * */
    public SendUTF8(message: string): void {
        const new_ack_id = this.current_ack++;

        const formatted_message = CryoBinaryMessageFormatterFactory
            .GetFormatter("utf8data")
            .Serialize(this.sid, new_ack_id, message);

        this.HandleOutgoingBinaryMessage(formatted_message);
    }

    /*
    * Send a binary message to the server
    * */
    public SendBinary(message: CryoBuffer): void {
        const new_ack_id = this.current_ack++;

        const formatted_message = CryoBinaryMessageFormatterFactory
            .GetFormatter("binarydata")
            .Serialize(this.sid, new_ack_id, message);

        this.HandleOutgoingBinaryMessage(formatted_message);
    }

    public get session_id(): UUID {
        return this.sid;
    }

    public Destroy() {
        this.socket.close();
    }
}
