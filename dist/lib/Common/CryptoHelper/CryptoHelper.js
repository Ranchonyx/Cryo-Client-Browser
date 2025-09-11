import { CreateDebugLogger } from "../Util/CreateDebugLogger.js";
import { CryoBuffer } from "../CryoBuffer/CryoBuffer.js";
export class PerSessionCryptoHelper {
    send_key;
    recv_key;
    log;
    nonce = 0;
    /*
        private nonce_rx = 0;
    */
    constructor(send_key, recv_key, log = CreateDebugLogger("CRYO_CRYPTO")) {
        this.send_key = send_key;
        this.recv_key = recv_key;
        this.log = log;
    }
    createIV() {
        const iv = new Uint8Array(12);
        new DataView(iv.buffer).setUint32(8, this.nonce++);
        return iv;
    }
    async encrypt(plain) {
        this.log(`[ENCRYPT]\nlen=${plain.length}\nnonce=${this.nonce}\nfirst16=${new CryoBuffer(plain.subarray(0, 16)).toString("hex")}`);
        const iv = this.createIV();
        const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, this.send_key, plain);
        const result = new Uint8Array(iv.byteLength + cipher.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(cipher), iv.byteLength);
        this.log(`[ENCRYPT-OUT]\nlen=${plain.length}\niv=${new CryoBuffer(iv).toString("hex")}`);
        return result;
    }
    async decrypt(cipher) {
        const iv = cipher.subarray(0, 12);
        const data = cipher.subarray(12);
        this.log(`[DECRYPT]\nlen=${cipher.length}\niv=${iv.toString("hex")}\ndata.length=${data.length}`);
        const decipher = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: iv.buffer,
            tagLength: 128
        }, this.recv_key, data.buffer);
        this.log(`[DECRYPT-OUT]\nlen=${decipher.byteLength}\nfirst16=${new CryoBuffer(new Uint8Array(decipher).subarray(0, 16)).toString("hex")}`);
        return new Uint8Array(decipher);
    }
}
