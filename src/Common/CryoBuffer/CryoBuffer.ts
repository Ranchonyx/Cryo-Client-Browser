export class CryoBuffer {
    private view: DataView;

    public constructor(public buffer: Uint8Array) {
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    public static alloc(length: number): CryoBuffer {
        return new CryoBuffer(new Uint8Array(length));
    }

    public static from(input: string, encoding: "utf8" | "hex"): CryoBuffer {
        if (encoding === "utf8")
            return new CryoBuffer(new TextEncoder().encode(input));

        const data = new Uint8Array(input.length / 2);
        for (let i = 0; i < data.length; i++)
            data[i] = parseInt(input.substring(i * 2, i * 2 + 2), 16);

        return new CryoBuffer(data);
    }

    public writeUInt32BE(value: number, offset: number): void {
        this.view.setUint32(offset, value);
    }

    public writeUInt8(value: number, offset: number): void {
        this.view.setUint8(offset, value);
    }

    public readUInt32BE(offset: number): number {
        return this.view.getUint32(offset);
    }

    public readUInt8(offset: number): number {
        return this.view.getUint8(offset);
    }

    public write(text: string, offset: number = 0): void {
        this.buffer.set(new TextEncoder().encode(text), offset);
    }

    public set(buffer: CryoBuffer, offset: number): void {
        this.buffer.set(buffer.buffer, offset);
    }

    public toString(encoding: "utf8" | "hex"): string {
        if (encoding === "utf8")
            return new TextDecoder().decode(this.buffer);

        return [...this.buffer]
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    public subarray(start: number, end?: number):  CryoBuffer {
        return new CryoBuffer(this.buffer.subarray(start, end));
    }

    public copy(target: CryoBuffer, target_start = 0): void {
        target.buffer.set(this.buffer, target_start);
    }

    public get length(): number {
        return this.buffer.byteLength;
    }
}
