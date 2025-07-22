import {CryoClientWebsocketSession} from "./CryoClientWebsocketSession/CryoClientWebsocketSession.js";

/**
 * Create a Cryo client and connect it to a Cryo server
 * @param host - Where the Cryo server is located
 * @param bearer - Your Cryo authentication token
 * @param timeout - How long to wait until disconnecting
 * */
export async function cryo(host: string, bearer: string, timeout: number = 5000) {
    return CryoClientWebsocketSession.Connect(host, bearer, timeout)
}
