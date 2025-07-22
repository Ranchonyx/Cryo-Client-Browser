import {CryoBuffer} from "../../Common/CryoBuffer/CryoBuffer.js";

export interface ICryoClientWebsocketSessionEvents {
    "message-utf8": string;
    "message-binary": CryoBuffer;
    "closed": [number, string];
    "connected": undefined;
    "disconnected": undefined;
    "reconnected": undefined;
}

export type PendingBinaryMessage = {
    timestamp: number;
    message: CryoBuffer;
    payload?: string | CryoBuffer;
}
