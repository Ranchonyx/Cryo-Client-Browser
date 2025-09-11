import {CryoBuffer} from "../CryoBuffer/CryoBuffer.js";
import Guard from "../Util/Guard.js";

type UUID = `${string}-${string}-${string}-${string}-${string}`;
type Buffer = CryoBuffer;


export enum BinaryMessageType {
    ACK = 0,
    ERROR = 1,
    PING_PONG = 2,
    UTF8DATA = 3,
    BINARYDATA = 4,
    SERVER_HELLO = 5,
    CLIENT_HELLO = 6,
    HANDSHAKE_DONE = 7
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
    payload: Buffer;
}, BinaryMessageType.BINARYDATA>;

type ErrorMessage = BinaryMessage<{
    ack: number;
    payload: "invalid_operation" | "session_expired" | "error";
}, BinaryMessageType.ERROR>;

type ServerHelloMessage = BinaryMessage<{
    ack: number;
    payload: Buffer;
}, BinaryMessageType.SERVER_HELLO>

type ClientHelloMessage = BinaryMessage<{
    ack: number;
    payload: Buffer;
}, BinaryMessageType.CLIENT_HELLO>

type HandshakeDoneMessage = BinaryMessage<{
    ack: number;
    payload: string | null;
}, BinaryMessageType.HANDSHAKE_DONE>


type CryoAllBinaryMessage =
    AckMessage
    | PingMessage
    | UTF8DataMessage
    | ErrorMessage
    | BinaryDataMessage
    | ServerHelloMessage
    | ClientHelloMessage
    | HandshakeDoneMessage;

interface CryoBinaryFrameFormatter<T extends CryoAllBinaryMessage> {
    Deserialize(value: Buffer): T;

    Serialize(sid: UUID, ack: number, payload: string | Buffer | null): Buffer;
}

class CryoBufferUtil {
    public static sidFromCryoBuffer(buffer: Buffer): UUID {
        const uuidv4_p1 = buffer.subarray(0, 4).toString("hex");
        const uuidv4_p2 = buffer.subarray(4, 6).toString("hex");
        const uuidv4_p3 = buffer.subarray(6, 8).toString("hex");
        const uuidv4_p4 = buffer.subarray(8, 10).toString("hex");
        const uuidv4_p5 = buffer.subarray(10, 16).toString("hex");

        return [uuidv4_p1, uuidv4_p2, uuidv4_p3, uuidv4_p4, uuidv4_p5].join("-") as UUID;
    }

    public static sidToCryoBuffer(sid: UUID): Buffer {
        return CryoBuffer.from(sid.replaceAll("-", ""), 'hex');
    }
}

class AckFrameFormatter implements CryoBinaryFrameFormatter<AckMessage> {
    public Deserialize(value: Buffer): AckMessage {
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
    public Serialize(sid: UUID, ack: number, payload: string | Buffer | null = null): Buffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.ACK, 20);
        return msg_buf;
    }
}

class PingPongFrameFormatter implements CryoBinaryFrameFormatter<PingMessage> {
    public Deserialize(value: Buffer): PingMessage {
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

    public Serialize(sid: UUID, ack: number, payload: "ping" | "pong"): Buffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + 4);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.PING_PONG, 20);
        msg_buf.write(payload, 21);

        return msg_buf;
    }
}

class UTF8FrameFormatter implements CryoBinaryFrameFormatter<UTF8DataMessage> {
    public Deserialize(value: Buffer): UTF8DataMessage {
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

    public Serialize(sid: UUID, ack: number, payload: string | null): Buffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 4));
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.UTF8DATA, 20);
        msg_buf.write(payload || "null", 21);

        return msg_buf;
    }
}

class BinaryFrameFormatter implements CryoBinaryFrameFormatter<BinaryDataMessage> {
    public Deserialize(value: Buffer): BinaryDataMessage {
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

    public Serialize(sid: UUID, ack: number, payload: Buffer | null): Buffer {
        const payload_length = payload ? payload.length : 4;
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + payload_length);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.BINARYDATA, 20);
        msg_buf.set(payload || CryoBuffer.from("null", "utf8"), 21);

        return msg_buf;
    }
}

class ErrorFrameFormatter implements CryoBinaryFrameFormatter<ErrorMessage> {
    public Deserialize(value: Buffer): ErrorMessage {
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

    public Serialize(sid: UUID, ack: number, payload: ErrorMessage["payload"] | null): Buffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 13));
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.ERROR, 20);
        msg_buf.write(payload || "unknown_error", 21);

        return msg_buf;
    }
}


class ServerHelloFrameFormatter implements CryoBinaryFrameFormatter<ServerHelloMessage> {
    public Deserialize(value: Buffer): ServerHelloMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21);

        if (type !== BinaryMessageType.SERVER_HELLO)
            throw new Error("Attempt to deserialize a non-server_hello message!");

        return {
            sid,
            ack,
            type,
            payload
        }

    }

    public Serialize(sid: UUID, ack: number, payload: Buffer | null): Buffer {
        Guard.CastAssert<Buffer>(payload, payload !== null, "payload was null!");
        if (payload.length !== 65)
            throw new Error("Payload in ServerHelloMessage must be exactly 65 bytes!");

        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + 65);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.SERVER_HELLO, 20);
        msg_buf.set(payload, 21);

        return msg_buf;
    }
}

class ClientHelloFrameFormatter implements CryoBinaryFrameFormatter<ClientHelloMessage> {
    public Deserialize(value: Buffer): ClientHelloMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21);

        if (type !== BinaryMessageType.CLIENT_HELLO)
            throw new Error("Attempt to deserialize a non-client_hello message!");

        return {
            sid,
            ack,
            type,
            payload
        }

    }

    public Serialize(sid: UUID, ack: number, payload: Buffer | null): Buffer {
        Guard.CastAssert<Buffer>(payload, payload !== null, "payload was null!");
        if (payload.length !== 65)
            throw new Error("Payload in ClientHelloMessage must be exactly 65 bytes!");

        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + 65);
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.CLIENT_HELLO, 20);
        msg_buf.set(payload, 21);

        return msg_buf;
    }
}

class HandshakeDoneFrameFormatter implements CryoBinaryFrameFormatter<HandshakeDoneMessage> {
    public Deserialize(value: Buffer): HandshakeDoneMessage {
        const sid = CryoBufferUtil.sidFromCryoBuffer(value);
        const ack = value.readUInt32BE(16);
        const type = value.readUInt8(20);
        const payload = value.subarray(21).toString("utf8");

        if (type !== BinaryMessageType.HANDSHAKE_DONE)
            throw new Error("Attempt to deserialize a non-handshake_done message!");

        return {
            sid,
            ack,
            type,
            payload
        }
    }

    public Serialize(sid: UUID, ack: number, payload: string | null): Buffer {
        const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 4));
        const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);

        sid_buf.copy(msg_buf, 0);
        msg_buf.writeUInt32BE(ack, 16);
        msg_buf.writeUInt8(BinaryMessageType.HANDSHAKE_DONE, 20);
        msg_buf.write(payload || "null", 21);

        return msg_buf;
    }
}

export default class CryoFrameFormatter {
    public static GetFormatter(type: "utf8data"): UTF8FrameFormatter;
    public static GetFormatter(type: BinaryMessageType.UTF8DATA): UTF8FrameFormatter;

    public static GetFormatter(type: "ping_pong"): PingPongFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.PING_PONG): PingPongFrameFormatter;

    public static GetFormatter(type: "ack"): AckFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.ACK): AckFrameFormatter;

    public static GetFormatter(type: "error"): ErrorFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.ERROR): ErrorFrameFormatter;

    public static GetFormatter(type: "binarydata"): BinaryFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.BINARYDATA): BinaryFrameFormatter;

    public static GetFormatter(type: "server_hello"): ServerHelloFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.SERVER_HELLO): ServerHelloFrameFormatter;

    public static GetFormatter(type: "client_hello"): ClientHelloFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.CLIENT_HELLO): ClientHelloFrameFormatter;

    public static GetFormatter(type: "handshake_done"): HandshakeDoneFrameFormatter;
    public static GetFormatter(type: BinaryMessageType.HANDSHAKE_DONE): HandshakeDoneFrameFormatter;

    public static GetFormatter(type: "utf8data" | "ping_pong" | "ack" | "error" | "binarydata" | "server_hello" | "client_hello" | "handshake_done"): CryoBinaryFrameFormatter<any>;
    public static GetFormatter(type:
                                   BinaryMessageType.UTF8DATA |
                                   BinaryMessageType.PING_PONG |
                                   BinaryMessageType.ACK |
                                   BinaryMessageType.ERROR |
                                   BinaryMessageType.BINARYDATA |
                                   BinaryMessageType.SERVER_HELLO |
                                   BinaryMessageType.CLIENT_HELLO |
                                   BinaryMessageType.HANDSHAKE_DONE): CryoBinaryFrameFormatter<any>;
    public static GetFormatter(type: string | BinaryMessageType): CryoBinaryFrameFormatter<CryoAllBinaryMessage> {
        switch (type) {
            case "utf8data":
            case BinaryMessageType.UTF8DATA:
                return new UTF8FrameFormatter();
            case "error":
            case BinaryMessageType.ERROR:
                return new ErrorFrameFormatter();
            case "ack":
            case BinaryMessageType.ACK:
                return new AckFrameFormatter();
            case "ping_pong":
            case BinaryMessageType.PING_PONG:
                return new PingPongFrameFormatter();
            case "binarydata":
            case BinaryMessageType.BINARYDATA:
                return new BinaryFrameFormatter();
            case BinaryMessageType.SERVER_HELLO:
            case "server_hello":
                return new ServerHelloFrameFormatter();
            case BinaryMessageType.CLIENT_HELLO:
            case "client_hello":
                return new ClientHelloFrameFormatter();
            case BinaryMessageType.HANDSHAKE_DONE:
            case "handshake_done":
                return new HandshakeDoneFrameFormatter();
            default:
                throw new Error(`Binary message format for type '${type}' is not supported!`)
        }
    }

    public static GetType(message: Buffer): BinaryMessageType {
        const type = message.readUInt8(20);
        if (type > BinaryMessageType.HANDSHAKE_DONE)
            throw new Error(`Unable to decode type from message ${message}. MAX_TYPE = 7, got ${type} !`);

        return type;
    }

    public static GetAck(message: Buffer): number {
        return message.readUInt32BE(16);
    }

    public static GetSid(message: Buffer): UUID {
        return CryoBufferUtil.sidFromCryoBuffer(message);
    }

    public static GetPayload(message: Buffer, encoding: "utf8" | "hex"): string {
        return message.subarray(21).toString(encoding);
    }
}
