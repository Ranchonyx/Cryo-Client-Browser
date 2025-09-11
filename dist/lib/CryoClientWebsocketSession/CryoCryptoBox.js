import { CryoBuffer } from "../Common/CryoBuffer/CryoBuffer.js";
async function import_key(data, usage) {
    return crypto.subtle.importKey("raw", data.buffer, { name: "AES-GCM" }, false, usage);
}
function make_algo(iv) {
    return {
        name: "AES-GCM",
        iv: iv.buffer,
    };
}
export class CryoCryptoBox {
    nonce = 0;
    enc_key_promise;
    dec_key_promise;
    constructor(encrypt_key, decryption_key) {
        this.enc_key_promise = import_key(encrypt_key, ["encrypt"]);
        this.dec_key_promise = import_key(decryption_key, ["decrypt"]);
    }
    create_iv() {
        const iv = CryoBuffer.alloc(12);
        iv.writeUInt32BE(this.nonce++, 8);
        return iv;
    }
    async encrypt(plain) {
        const iv = this.create_iv();
        const key = await this.enc_key_promise;
        const encrypted = await crypto.subtle.encrypt(make_algo(iv), key, plain.buffer);
        return CryoBuffer.concat([iv, new CryoBuffer(new Uint8Array(encrypted))]);
    }
    async decrypt(cipher) {
        const iv = cipher.subarray(0, 12);
        const key = await this.dec_key_promise;
        const data_with_tag = cipher.subarray(12);
        const decrypted = await crypto.subtle.decrypt(make_algo(iv), key, data_with_tag.buffer);
        return new CryoBuffer(new Uint8Array(decrypted));
    }
}
