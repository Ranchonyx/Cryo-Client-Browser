import CryoFrameFormatter from "../Common/CryoBinaryMessage/CryoFrameFormatter.js";
import { CryoBuffer } from "../Common/CryoBuffer/CryoBuffer.js";
export var HandshakeState;
(function (HandshakeState) {
    HandshakeState[HandshakeState["INITIAL"] = 0] = "INITIAL";
    HandshakeState[HandshakeState["WAIT_SERVER_HELLO"] = 1] = "WAIT_SERVER_HELLO";
    HandshakeState[HandshakeState["WAIT_SERVER_DONE"] = 2] = "WAIT_SERVER_DONE";
    HandshakeState[HandshakeState["SECURE"] = 3] = "SECURE";
})(HandshakeState || (HandshakeState = {}));
export class CryoHandshakeEngine {
    sid;
    send_plain;
    formatter;
    next_ack;
    events;
    ECDH_ALGO = { name: "ECDH", namedCurve: "P-256" };
    handshake_state = HandshakeState.INITIAL;
    ecdh = null;
    receive_key = null;
    transmit_key = null;
    constructor(sid, send_plain, formatter, next_ack, events) {
        this.sid = sid;
        this.send_plain = send_plain;
        this.formatter = formatter;
        this.next_ack = next_ack;
        this.events = events;
        this.init_keys();
    }
    async init_keys() {
        try {
            this.ecdh = await crypto.subtle.generateKey(this.ECDH_ALGO, true, ["deriveBits"]);
            this.handshake_state = HandshakeState.WAIT_SERVER_HELLO;
        }
        catch (ex) {
            this.events.onFailure(`Failed to generate ECDH keys: ${ex}`);
        }
    }
    async on_server_hello(frame) {
        if (this.handshake_state !== HandshakeState.WAIT_SERVER_HELLO) {
            this.events.onFailure(`CLIENT_HELLO received while in state ${this.handshake_state}`);
            return;
        }
        const decoded = CryoFrameFormatter
            .GetFormatter("server_hello")
            .Deserialize(frame);
        const server_pub_key = await crypto.subtle.importKey("raw", decoded.payload.buffer, this.ECDH_ALGO, false, []);
        if (!this.ecdh?.privateKey) {
            this.events.onFailure("Local ECDH private key not initialised.");
            return;
        }
        const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: server_pub_key }, this.ecdh.privateKey, 256);
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
    async on_server_handshake_done(frame) {
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
        this.events.onSecure({ receive_key: this.receive_key, transmit_key: this.transmit_key });
        this.handshake_state = HandshakeState.SECURE;
    }
    get is_secure() {
        return this.handshake_state === HandshakeState.SECURE;
    }
    get state() {
        return this.handshake_state;
    }
}
