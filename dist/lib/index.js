import { CryoClientWebsocketSession } from "./CryoClientWebsocketSession/CryoClientWebsocketSession.js";
/**
 * Create a Cryo client
 * @param host - The server to connect to
 * @param bearer - The Bearer token for the server to validate
 * @param use_cale - If cALE (application layer encryption) should be enabled
 * @param timeout - How long to wait until the client stops establishing a connection
 * */
export async function cryo(host, bearer, use_cale, timeout = 5000) {
    return CryoClientWebsocketSession.Connect(host, bearer, use_cale, timeout);
}
