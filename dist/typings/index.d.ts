import {EventEmitter} from "node:events";
import {CryoBuffer} from "../../src/Common/CryoBuffer/CryoBuffer";

export interface ICryoClientWebsocketSessionEvents {
    "message-utf8": string;
    "message-binary": CryoBuffer;
    "closed": [number, string];
    "connected": undefined;
    "disconnected": undefined;
    "reconnected": undefined;
}

export interface CryoClientWebsocketSession {
    on<U extends keyof ICryoClientWebsocketSessionEvents>(event: U, listener: (payload: ICryoClientWebsocketSessionEvents[U]) => void): this;
}

export declare class CryoClientWebsocketSession extends EventEmitter implements CryoClientWebsocketSession {
    public SendUTF8(message: string): void;
    public SendBinary(message: Buffer): void;
    public Destroy(): void;
}

/**
 * Create a Cryo client and connect it to a Cryo server
 * @param host - Where the Cryo server is located
 * @param bearer - Your Cryo authentication token
 * @param timeout - How long to wait until disconnecting
 * */
export declare function cryo(host: string, bearer: string, timeout?: number): Promise<CryoClientWebsocketSession>;
