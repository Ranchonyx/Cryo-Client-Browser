import {CryoBuffer} from "../CryoBuffer/CryoBuffer.js";

type UUID = `${string}-${string}-${string}-${string}-${string}`;

export enum BinaryMessageType {
    UTF8DATA,
    ACK,
    PING_PONG,
    ERROR,
    BINARYDATA
}

type BinaryMessage<T, U extends BinaryMessageType> = {
    sid: UUID;
    type: U;
} & T;

type AckMessage = BinaryMessage<{
    ack: number;
}, BinaryMessageType.ACK>;

type PingMessage = BinaryMessage<{
    ack: number;
    payload: "ping" | "pong";
}, BinaryMessageType.PING_PONG>;

type UTF8DataMessage = BinaryMessage<{
    ack: number;
    payload: string;
}, BinaryMessageType.UTF8DATA>;

type BinaryDataMessage = BinaryMessage<{
    ack: number;
    payload: CryoBuffer;
}, BinaryMessageType.BINARYDATA>;

type ErrorMessage = BinaryMessage<{
    ack: number;
    payload: "invalid_operation" | "session_expired" | "error";
}, BinaryMessageType.ERROR>;

type CryoAllBinaryMessage = AckMessage | PingMessage | UTF8DataMessage | ErrorMessage | BinaryDataMessage;

interface CryoBinaryMessageFormatter<T extends CryoAllBinaryMessage> {
    Deserialize(value: CryoBuffer): T;

    Serialize(sid: UUID, ack: number, payload: string | CryoBuffer | null): CryoBuffer;
}

class CryoBufferUtil {
    public static sidFromCryoBuffer(CryoBuffer: CryoBuffer): UUID {
        const uuidv4_p1 = CryoBuffer.subarray(0, 4).toString("hex");
        const uuidv4_p2 = CryoBuffer.subarray(4, 6).toString("hex");
        const uuidv4_p3 = CryoBuffer.subarray(6, 8).toString("hex");
        const uuidv4_p4 = CryoBuffer.subarray(8, 10).toString("hex");
        const uuidv4_p5 = CryoBuffer.subarray(10, 16).toString("hex");

        return [uuidv4_p1, uuidv4_p2, uuidv4_p3, uuidv4_p4, uuidv4_p5].join("-") as UUID;
    }

    public static sidToCryoBuffer(sid: UUID): CryoBuffer {
        return CryoBuffer.from(sid.replaceAll("-", ""), 'hex');
    }
}

class AckMessageFormatter implements CryoBinaryMessageFormatter<AckMessage> {
    public Deserialize(value: CryoBuffer): AckMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        if (type !== BinaryMessageType.ACK)
            throw new Error("Attempt to deserialize a non-ack binary message!");

        return {
            sid,
            ack,
            type
        }
    }

    // noinspection JSUnusedLocalSymbols
    public Serialize(sid: UUID, ack: number, payload: string | CryoBuffer | null = null): CryoBuffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.ACK, 20);
        return msg_buf;
    }
}

class PingPongMessageFormatter implements CryoBinaryMessageFormatter<PingMessage> {
    public Deserialize(value: CryoBuffer): PingMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21).toString("utf8");
        if (type !== BinaryMessageType.PING_PONG)
            throw new Error("Attempt to deserialize a non-ping_pong binary message!");

        if (!(payload === "ping" || payload === "pong"))
            throw new Error(`Invalid payload ${payload} in ping_pong binary message!`);

        return {
            sid,
            ack,
            type,
            payload
        }
    }

    public Serialize(sid: UUID, ack: number, payload: "ping" | "pong"): CryoBuffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + 4);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.PING_PONG, 20);
        msg_buf.write(payload, 21);

        return msg_buf;
    }
}

class UTF8DataMessageFormatter implements CryoBinaryMessageFormatter<UTF8DataMessage> {
    public Deserialize(value: CryoBuffer): UTF8DataMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21).toString("utf8");

        if (type !== BinaryMessageType.UTF8DATA)
            throw new Error("Attempt to deserialize a non-data binary message!");

        return {
            sid,
            ack,
            type,
            payload
        }
    }

    public Serialize(sid: UUID, ack: number, payload: string | null): CryoBuffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 4));
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.UTF8DATA, 20);
        msg_buf.write(payload || "null", 21);

        return msg_buf;
    }
}

class BinaryDataMessageFormatter implements CryoBinaryMessageFormatter<BinaryDataMessage> {
    public Deserialize(value: CryoBuffer): BinaryDataMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21);

        if (type !== BinaryMessageType.BINARYDATA)
            throw new Error("Attempt to deserialize a non-data binary message!");

        return {
            sid,
            ack,
            type,
            payload
        }
    }

    public Serialize(sid: UUID, ack: number, payload: CryoBuffer | null): CryoBuffer {
        const payload_length = payload ? payload.length : 4;
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + payload_length);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.UTF8DATA, 20);
        msg_buf.set(payload || CryoBuffer.from("null", "utf8"), 21);

        return msg_buf;
    }
}

class ErrorMessageFormatter implements CryoBinaryMessageFormatter<ErrorMessage> {
    public Deserialize(value: CryoBuffer): ErrorMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21).toString("utf8") as ErrorMessage["payload"];

        if (type !== BinaryMessageType.ERROR)
            throw new Error("Attempt to deserialize a non-error message!");

        return {
            sid,
            ack,
            type,
            payload
        }
    }

    public Serialize(sid: UUID, ack: number, payload: ErrorMessage["payload"] | null): CryoBuffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 13));
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.ERROR, 20);
        msg_buf.write(payload || "unknown_error", 21);

        return msg_buf;
    }
}

export default class CryoBinaryMessageFormatterFactory {
    public static GetFormatter(type: "utf8data"): UTF8DataMessageFormatter;
    public static GetFormatter(type: BinaryMessageType.UTF8DATA): UTF8DataMessageFormatter;

    public static GetFormatter(type: "ping_pong"): PingPongMessageFormatter;
    public static GetFormatter(type: BinaryMessageType.PING_PONG): PingPongMessageFormatter;

    public static GetFormatter(type: "ack"): AckMessageFormatter;
    public static GetFormatter(type: BinaryMessageType.ACK): AckMessageFormatter;

    public static GetFormatter(type: "error"): ErrorMessageFormatter;
    public static GetFormatter(type: BinaryMessageType.ERROR): ErrorMessageFormatter;

    public static GetFormatter(type: "binarydata"): BinaryDataMessageFormatter;
    public static GetFormatter(type: BinaryMessageType.BINARYDATA): BinaryDataMessageFormatter;

    public static GetFormatter(type: "utf8data" | "ping_pong" | "ack" | "error" | "binarydata"): CryoBinaryMessageFormatter<any>;
    public static GetFormatter(type: BinaryMessageType.UTF8DATA | BinaryMessageType.PING_PONG | BinaryMessageType.ACK | BinaryMessageType.ERROR | BinaryMessageType.BINARYDATA): CryoBinaryMessageFormatter<any>;
    public static GetFormatter(type: string | BinaryMessageType): CryoBinaryMessageFormatter<CryoAllBinaryMessage> {
        switch (type) {
            case "data":
            case BinaryMessageType.UTF8DATA:
                return new UTF8DataMessageFormatter();
            case "error":
            case BinaryMessageType.ERROR:
                return new ErrorMessageFormatter();
            case "ack":
            case BinaryMessageType.ACK:
                return new AckMessageFormatter();
            case "ping_pong":
            case BinaryMessageType.PING_PONG:
                return new PingPongMessageFormatter();
            case "binarydata":
            case BinaryMessageType.BINARYDATA:
                return new BinaryDataMessageFormatter();
            default:
                throw new Error(`Binary message format for type '${type}' is not supported!`)
        }
    }

    public static GetType(message: CryoBuffer): BinaryMessageType {
        const type = message.readUInt8(20);
        if (type > BinaryMessageType.ERROR)
            throw new Error(`Unable to decode type from message ${message}. MAX_TYPE = 3, got ${type} !`);

        return type;
    }

    public static GetAck(message: CryoBuffer): number {
        return message.readUInt32BE(16);
    }

    public static GetSid(message: CryoBuffer): UUID {
        return CryoBufferUtil.sidFromCryoBuffer(message);
    }

    public static GetPayload(message: CryoBuffer, encoding: "utf8" | "hex"): string {
        return message.subarray(21).toString(encoding);
    }
}
