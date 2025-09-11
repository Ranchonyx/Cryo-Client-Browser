import CryoFrameFormatter from "../Common/CryoBinaryMessage/CryoFrameFormatter.js";
import {CryoBuffer} from "../Common/CryoBuffer/CryoBuffer.js";

type Buffer = CryoBuffer;

export enum HandshakeState {
    INITIAL = 0,
    WAIT_SERVER_HELLO = 1,
    WAIT_SERVER_DONE = 2,
    SECURE = 3
}

type CryptoKeys = { receive_key: Buffer, transmit_key: Buffer };
type UUID = `${string}-${string}-${string}-${string}-${string}`;

export interface HandshakeEvents {
    onSecure: (keys: CryptoKeys) => void;
    onFailure: (reason: string) => void;
}

export class CryoHandshakeEngine {
    private readonly ECDH_ALGO: EcKeyGenParams = {name: "ECDH", namedCurve: "P-256"};
    private handshake_state: HandshakeState = HandshakeState.INITIAL;
    private ecdh: CryptoKeyPair | null = null;
    private receive_key: Buffer | null = null;
    private transmit_key: Buffer | null = null;

    public constructor(
        private readonly sid: UUID,
        private send_plain: (buf: Buffer) => Promise<void>,
        private formatter: typeof CryoFrameFormatter,
        private next_ack: () => number,
        private events: HandshakeEvents
    ) {
        this.init_keys();
    }

    private async init_keys() {
        try {
            this.ecdh = await crypto.subtle.generateKey(
                this.ECDH_ALGO,
                true,
                ["deriveBits"]
            );
            this.handshake_state = HandshakeState.WAIT_SERVER_HELLO;
        } catch (ex) {
            this.events.onFailure(`Failed to generate ECDH keys: ${ex}`);
        }
    }

    public async on_server_hello(frame: Buffer): Promise<void> {
        if (this.handshake_state !== HandshakeState.WAIT_SERVER_HELLO) {
            this.events.onFailure(`CLIENT_HELLO received while in state ${this.handshake_state}`);
            return;
        }

        const decoded = CryoFrameFormatter
            .GetFormatter("server_hello")
            .Deserialize(frame);

        const server_pub_key = await crypto.subtle.importKey("raw", decoded.payload.buffer, this.ECDH_ALGO, false, []);

        if(!this.ecdh?.privateKey) {
            this.events.onFailure("Local ECDH private key not initialised.");
            return;
        }

        const secret = await crypto.subtle.deriveBits({name: "ECDH", public: server_pub_key}, this.ecdh.privateKey, 256);
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", secret));

        this.transmit_key = new CryoBuffer(hash.subarray(16, 32));
        this.receive_key = new CryoBuffer(hash.subarray(0, 16));

        const my_pub_key = new CryoBuffer(new Uint8Array(await crypto.subtle.exportKey("raw", this.ecdh.publicKey)));

        const ack = this.next_ack();

        const client_hello = this.formatter
            .GetFormatter("client_hello")
            .Serialize(this.sid, ack, my_pub_key);

        await this.send_plain(client_hello);
        this.handshake_state = HandshakeState.WAIT_SERVER_DONE;
    }

    /*
    *         if (this.handshake_state !== HandshakeState.WAIT_SERVER_DONE) {
            this.events.onFailure(`HANDSHAKE_DONE received while in state ${this.state}`);
            return;
        }
        console.error("CLIENT GOT SERVER HANDSHAKE!")
        const decoded = CryoFrameFormatter
            .GetFormatter("handshake_done")
            .Deserialize(frame);

        const done = CryoFrameFormatter
            .GetFormatter("handshake_done")
            .Serialize(this.sid, decoded.ack, null);
        await this.send_plain(done);

        this.events.onSecure({receive_key: this.receive_key, transmit_key: this.transmit_key});
        //Client got our SERVER_HELLO and finished on its side
        this.handshake_state = HandshakeState.SECURE;

    * */
    public async on_server_handshake_done(frame: Buffer): Promise<void> {
        if (this.handshake_state !== HandshakeState.WAIT_SERVER_DONE) {
            this.events.onFailure(`HANDSHAKE_DONE received while in state ${this.state}`);
            return;
        }

        //Client got our SERVER_HELLO and finished on its side
        //Now we'll send our handshake_done frame
        const decoded = CryoFrameFormatter
            .GetFormatter("handshake_done")
            .Deserialize(frame);

        const done = CryoFrameFormatter
            .GetFormatter("handshake_done")
            .Serialize(this.sid, decoded.ack, null);
        await this.send_plain(done);

        this.events.onSecure({receive_key: this.receive_key!, transmit_key: this.transmit_key!});
        this.handshake_state = HandshakeState.SECURE;
    }

    public get is_secure(): boolean {
        return this.handshake_state === HandshakeState.SECURE;
    }

    public get state(): HandshakeState {
        return this.handshake_state;
    }
}