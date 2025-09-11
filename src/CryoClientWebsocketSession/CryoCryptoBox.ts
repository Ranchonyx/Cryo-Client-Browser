import {CryoBuffer} from "../Common/CryoBuffer/CryoBuffer.js";

type Buffer = CryoBuffer;

async function import_key(data: Buffer, usage: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        data.buffer,
        {name: "AES-GCM"},
        false,
        usage
    );
}

function make_algo(iv: Buffer): AesGcmParams {
    return {
        name: "AES-GCM",
        iv: iv.buffer,

    }
}

export class CryoCryptoBox {
    private nonce = 0;

    private readonly enc_key_promise: Promise<CryptoKey>;
    private readonly dec_key_promise: Promise<CryptoKey>;

    public constructor(encrypt_key: Buffer, decryption_key: Buffer) {
        this.enc_key_promise = import_key(encrypt_key, ["encrypt"]);
        this.dec_key_promise = import_key(decryption_key, ["decrypt"]);
    }

    private create_iv(): Buffer {
        const iv = CryoBuffer.alloc(12);
        iv.writeUInt32BE(this.nonce++, 8);
        return iv;
    }

    public async encrypt(plain: Buffer): Promise<Buffer> {
        const iv = this.create_iv();
        const key = await this.enc_key_promise;
        const encrypted = await crypto.subtle.encrypt(make_algo(iv), key, plain.buffer);

        return CryoBuffer.concat([iv, new CryoBuffer(new Uint8Array(encrypted))]);
    }

    public async decrypt(cipher: Buffer): Promise<CryoBuffer> {
        const iv = cipher.subarray(0, 12);
        const key = await this.dec_key_promise;
        const data_with_tag = cipher.subarray(12);

        const decrypted = await crypto.subtle.decrypt(make_algo(iv), key, data_with_tag.buffer);

        return new CryoBuffer(new Uint8Array(decrypted));
    }
}