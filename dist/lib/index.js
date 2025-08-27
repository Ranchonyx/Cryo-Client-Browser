"use strict";
var Cryo = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    cryo: () => cryo
  });

  // src/Common/AckTracker/AckTracker.ts
  var AckTracker = class {
    pending = /* @__PURE__ */ new Map();
    Track(ack, message) {
      this.pending.set(ack, message);
    }
    Confirm(ack) {
      const maybe_ack = this.pending.get(ack);
      if (!maybe_ack)
        return null;
      this.pending.delete(ack);
      return maybe_ack;
    }
    Has(ack) {
      return this.pending.has(ack);
    }
  };

  // src/Common/CryoBuffer/CryoBuffer.ts
  var CryoBuffer = class _CryoBuffer {
    constructor(buffer) {
      this.buffer = buffer;
      this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    view;
    static alloc(length) {
      return new _CryoBuffer(new Uint8Array(length));
    }
    static from(input, encoding) {
      if (encoding === "utf8")
        return new _CryoBuffer(new TextEncoder().encode(input));
      const data = new Uint8Array(input.length / 2);
      for (let i = 0; i < data.length; i++)
        data[i] = parseInt(input.substring(i * 2, i * 2 + 2), 16);
      return new _CryoBuffer(data);
    }
    writeUInt32BE(value, offset) {
      this.view.setUint32(offset, value);
    }
    writeUInt8(value, offset) {
      this.view.setUint8(offset, value);
    }
    readUInt32BE(offset) {
      return this.view.getUint32(offset);
    }
    readUInt8(offset) {
      return this.view.getUint8(offset);
    }
    write(text, offset = 0) {
      this.buffer.set(new TextEncoder().encode(text), offset);
    }
    set(buffer, offset) {
      this.buffer.set(buffer.buffer, offset);
    }
    toString(encoding) {
      if (encoding === "utf8")
        return new TextDecoder().decode(this.buffer);
      return [...this.buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    subarray(start, end) {
      return new _CryoBuffer(this.buffer.subarray(start, end));
    }
    copy(target, target_start = 0) {
      target.buffer.set(this.buffer, target_start);
    }
    get length() {
      return this.buffer.byteLength;
    }
  };

  // src/Common/CryoBinaryMessage/CryoBinaryMessageFormatterFactory.ts
  var CryoBufferUtil = class {
    static sidFromCryoBuffer(CryoBuffer2) {
      const uuidv4_p1 = CryoBuffer2.subarray(0, 4).toString("hex");
      const uuidv4_p2 = CryoBuffer2.subarray(4, 6).toString("hex");
      const uuidv4_p3 = CryoBuffer2.subarray(6, 8).toString("hex");
      const uuidv4_p4 = CryoBuffer2.subarray(8, 10).toString("hex");
      const uuidv4_p5 = CryoBuffer2.subarray(10, 16).toString("hex");
      return [uuidv4_p1, uuidv4_p2, uuidv4_p3, uuidv4_p4, uuidv4_p5].join("-");
    }
    static sidToCryoBuffer(sid) {
      return CryoBuffer.from(sid.replaceAll("-", ""), "hex");
    }
  };
  var AckMessageFormatter = class {
    Deserialize(value) {
      const sid = CryoBufferUtil.sidFromCryoBuffer(value);
      const ack = value.readUInt32BE(16);
      const type = value.readUInt8(20);
      if (type !== 1 /* ACK */)
        throw new Error("Attempt to deserialize a non-ack binary message!");
      return {
        sid,
        ack,
        type
      };
    }
    // noinspection JSUnusedLocalSymbols
    Serialize(sid, ack, payload = null) {
      const msg_buf = CryoBuffer.alloc(16 + 4 + 1);
      const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);
      sid_buf.copy(msg_buf, 0);
      msg_buf.writeUInt32BE(ack, 16);
      msg_buf.writeUInt8(1 /* ACK */, 20);
      return msg_buf;
    }
  };
  var PingPongMessageFormatter = class {
    Deserialize(value) {
      const sid = CryoBufferUtil.sidFromCryoBuffer(value);
      const ack = value.readUInt32BE(16);
      const type = value.readUInt8(20);
      const payload = value.subarray(21).toString("utf8");
      if (type !== 2 /* PING_PONG */)
        throw new Error("Attempt to deserialize a non-ping_pong binary message!");
      if (!(payload === "ping" || payload === "pong"))
        throw new Error(`Invalid payload ${payload} in ping_pong binary message!`);
      return {
        sid,
        ack,
        type,
        payload
      };
    }
    Serialize(sid, ack, payload) {
      const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + 4);
      const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);
      sid_buf.copy(msg_buf, 0);
      msg_buf.writeUInt32BE(ack, 16);
      msg_buf.writeUInt8(2 /* PING_PONG */, 20);
      msg_buf.write(payload, 21);
      return msg_buf;
    }
  };
  var UTF8DataMessageFormatter = class {
    Deserialize(value) {
      const sid = CryoBufferUtil.sidFromCryoBuffer(value);
      const ack = value.readUInt32BE(16);
      const type = value.readUInt8(20);
      const payload = value.subarray(21).toString("utf8");
      if (type !== 0 /* UTF8DATA */)
        throw new Error("Attempt to deserialize a non-data binary message!");
      return {
        sid,
        ack,
        type,
        payload
      };
    }
    Serialize(sid, ack, payload) {
      const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 4));
      const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);
      sid_buf.copy(msg_buf, 0);
      msg_buf.writeUInt32BE(ack, 16);
      msg_buf.writeUInt8(0 /* UTF8DATA */, 20);
      msg_buf.write(payload || "null", 21);
      return msg_buf;
    }
  };
  var BinaryDataMessageFormatter = class {
    Deserialize(value) {
      const sid = CryoBufferUtil.sidFromCryoBuffer(value);
      const ack = value.readUInt32BE(16);
      const type = value.readUInt8(20);
      const payload = value.subarray(21);
      if (type !== 4 /* BINARYDATA */)
        throw new Error("Attempt to deserialize a non-data binary message!");
      return {
        sid,
        ack,
        type,
        payload
      };
    }
    Serialize(sid, ack, payload) {
      const payload_length = payload ? payload.length : 4;
      const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + payload_length);
      const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);
      sid_buf.copy(msg_buf, 0);
      msg_buf.writeUInt32BE(ack, 16);
      msg_buf.writeUInt8(4 /* BINARYDATA */, 20);
      msg_buf.set(payload || CryoBuffer.from("null", "utf8"), 21);
      return msg_buf;
    }
  };
  var ErrorMessageFormatter = class {
    Deserialize(value) {
      const sid = CryoBufferUtil.sidFromCryoBuffer(value);
      const ack = value.readUInt32BE(16);
      const type = value.readUInt8(20);
      const payload = value.subarray(21).toString("utf8");
      if (type !== 3 /* ERROR */)
        throw new Error("Attempt to deserialize a non-error message!");
      return {
        sid,
        ack,
        type,
        payload
      };
    }
    Serialize(sid, ack, payload) {
      const msg_buf = CryoBuffer.alloc(16 + 4 + 1 + (payload?.length || 13));
      const sid_buf = CryoBufferUtil.sidToCryoBuffer(sid);
      sid_buf.copy(msg_buf, 0);
      msg_buf.writeUInt32BE(ack, 16);
      msg_buf.writeUInt8(3 /* ERROR */, 20);
      msg_buf.write(payload || "unknown_error", 21);
      return msg_buf;
    }
  };
  var CryoBinaryMessageFormatterFactory = class {
    static GetFormatter(type) {
      switch (type) {
        case "utf8data":
        case 0 /* UTF8DATA */:
          return new UTF8DataMessageFormatter();
        case "error":
        case 3 /* ERROR */:
          return new ErrorMessageFormatter();
        case "ack":
        case 1 /* ACK */:
          return new AckMessageFormatter();
        case "ping_pong":
        case 2 /* PING_PONG */:
          return new PingPongMessageFormatter();
        case "binarydata":
        case 4 /* BINARYDATA */:
          return new BinaryDataMessageFormatter();
        default:
          throw new Error(`Binary message format for type '${type}' is not supported!`);
      }
    }
    static GetType(message) {
      const type = message.readUInt8(20);
      if (type > 3 /* ERROR */)
        throw new Error(`Unable to decode type from message ${message}. MAX_TYPE = 3, got ${type} !`);
      return type;
    }
    static GetAck(message) {
      return message.readUInt32BE(16);
    }
    static GetSid(message) {
      return CryoBufferUtil.sidFromCryoBuffer(message);
    }
    static GetPayload(message, encoding) {
      return message.subarray(21).toString(encoding);
    }
  };

  // src/Common/CryoFrameInspector/CryoFrameInspector.ts
  var typeToStringMap = {
    0: "utf8data",
    1: "ack",
    2: "ping/pong",
    3: "error",
    4: "binarydata"
  };
  var CryoFrameInspector = class {
    static Inspect(message, encoding = "utf8") {
      const sid = CryoBinaryMessageFormatterFactory.GetSid(message);
      const ack = CryoBinaryMessageFormatterFactory.GetAck(message);
      const type = CryoBinaryMessageFormatterFactory.GetType(message);
      const type_str = typeToStringMap[type] || "unknown";
      const payload = CryoBinaryMessageFormatterFactory.GetPayload(message, encoding);
      return `[${sid},${ack},${type_str},[${payload}]]`;
    }
  };

  // src/Common/Util/CreateDebugLogger.ts
  function CreateDebugLogger(section) {
    if (localStorage.getItem("CRYO_DEBUG")?.includes(section)) {
      return (msg, ...params) => {
        const err = new Error();
        const stack = err.stack?.split("\n");
        const caller_line = stack?.[2] ?? "unknown";
        const method_cleaned = caller_line.trim().replace(/^at\s+/, "");
        const method = method_cleaned.substring(0, method_cleaned.indexOf("(") - 1);
        const position = method_cleaned.substring(method_cleaned.lastIndexOf(":") - 2, method_cleaned.length - 1);
        console.info(`${section.padEnd(24, " ")}${(/* @__PURE__ */ new Date()).toISOString().padEnd(32, " ")} ${method.padEnd(64, " ")} ${position.padEnd(8, " ")} ${msg}`, ...params);
      };
    }
    return () => {
    };
  }

  // src/Common/Util/Guard.ts
  var GuardError = class _GuardError extends Error {
    constructor(pMessage) {
      super(pMessage);
      Object.setPrototypeOf(this, _GuardError.prototype);
    }
  };
  var Guard = class _Guard {
    //wenn "param" === null, throw with "message"
    static AgainstNull(param, message) {
      if (param === null)
        throw new GuardError(message ? message : `Assertion failed, "param" (${param}) was null!`);
    }
    //Wenn "param" === "undefined", throw with "message"
    static AgainstUndefined(param, message) {
      if (param === void 0)
        throw new GuardError(message ? message : `Assertion failed, "param" (${param}) was undefined!`);
    }
    //Wenn "param" === "null" or "param" === "undefined", throw with "message"
    static AgainstNullish(param, message) {
      _Guard.AgainstUndefined(param, message);
      _Guard.AgainstNull(param, message);
    }
    //Typ von "param" als Typ "T" interpretieren
    static CastAs(param) {
      _Guard.AgainstNullish(param);
    }
    //Typ von "param" als Typ "T" interpretieren und "param" und "expr" gegen "null" und "undefined" guarden
    static CastAssert(param, expr, message) {
      _Guard.AgainstNullish(param, message);
      _Guard.AgainstNullish(expr, message);
      if (!expr)
        throw new GuardError(`Parameter assertion failed in CastAssert!`);
    }
  };

  // src/Common/CryoEventEmitter/CryoEventEmitter.ts
  var CryoEventEmitter = class {
    target = new EventTarget();
    on(type, listener) {
      Guard.CastAs(type);
      this.target.addEventListener(type, (e) => {
        listener(e.detail);
      });
    }
    emit(type, payload) {
      Guard.CastAs(type);
      this.target.dispatchEvent(new CustomEvent(type, { detail: payload }));
    }
  };

  // src/CryoClientWebsocketSession/CryoClientWebsocketSession.ts
  var CryoClientWebsocketSession = class _CryoClientWebsocketSession extends CryoEventEmitter {
    constructor(host, sid, socket, timeout, bearer, log = CreateDebugLogger("CRYO_CLIENT_SESSION")) {
      super();
      this.host = host;
      this.sid = sid;
      this.socket = socket;
      this.timeout = timeout;
      this.bearer = bearer;
      this.log = log;
      this.AttachListenersToSocket(socket);
      setTimeout(() => this.emit("connected", void 0), 0);
    }
    messages_pending_server_ack = /* @__PURE__ */ new Map();
    server_ack_tracker = new AckTracker();
    current_ack = 0;
    ping_pong_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("ping_pong");
    ack_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("ack");
    error_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("error");
    utf8_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("utf8data");
    binary_formatter = CryoBinaryMessageFormatterFactory.GetFormatter("binarydata");
    /*
    * Handle an outgoing binary message
    * */
    HandleOutgoingBinaryMessage(message) {
      const message_ack = CryoBinaryMessageFormatterFactory.GetAck(message);
      this.server_ack_tracker.Track(message_ack, {
        timestamp: Date.now(),
        message
      });
      if (!this.socket)
        return;
      this.socket.send(message.buffer);
      this.log(`Sent ${CryoFrameInspector.Inspect(message)} to server.`);
    }
    /*
    * Respond to PONG frames with PING and vice versa
    * */
    HandlePingPongMessage(message) {
      const decodedPingPongMessage = this.ping_pong_formatter.Deserialize(message);
      const ping_pongMessage = this.ping_pong_formatter.Serialize(this.sid, decodedPingPongMessage.ack, decodedPingPongMessage.payload === "pong" ? "ping" : "pong");
      this.HandleOutgoingBinaryMessage(ping_pongMessage);
    }
    /*
    * Handling of binary error messages from the server, currently just log it
    * */
    HandleErrorMessage(message) {
      const decodedErrorMessage = this.error_formatter.Deserialize(message);
      this.log(decodedErrorMessage.payload);
    }
    /*
    * Locally ACK the pending message if it matches the server's ACK
    * */
    async HandleAckMessage(message) {
      const decodedAckMessage = this.ack_formatter.Deserialize(message);
      const ack_id = decodedAckMessage.ack;
      const found_message = this.server_ack_tracker.Confirm(ack_id);
      if (!found_message) {
        this.log(`Got unknown ack_id ${ack_id} from server.`);
        return;
      }
      this.messages_pending_server_ack.delete(ack_id);
      this.log(`Got ACK ${ack_id} from server.`);
    }
    /*
    * Extract payload from the binary message and emit the message event with the utf8 payload
    * */
    HandleUTF8DataMessage(message) {
      const decodedDataMessage = this.utf8_formatter.Deserialize(message);
      const payload = decodedDataMessage.payload;
      const sender_sid = decodedDataMessage.sid;
      const encodedAckMessage = this.ack_formatter.Serialize(this.sid, decodedDataMessage.ack);
      this.HandleOutgoingBinaryMessage(encodedAckMessage);
      this.emit("message-utf8", payload);
    }
    /*
    * Extract payload from the binary message and emit the message event with the binary payload
    * */
    HandleBinaryDataMessage(message) {
      const decodedDataMessage = this.binary_formatter.Deserialize(message);
      const payload = decodedDataMessage.payload;
      const sender_sid = decodedDataMessage.sid;
      const encodedAckMessage = this.ack_formatter.Serialize(this.sid, decodedDataMessage.ack);
      this.HandleOutgoingBinaryMessage(encodedAckMessage);
      this.emit("message-binary", payload);
    }
    /*
    * Handle incoming binary messages
    * */
    async HandleIncomingBinaryMessage(message) {
      const message_type = CryoBinaryMessageFormatterFactory.GetType(message);
      this.log(`Received ${CryoFrameInspector.Inspect(message)} from server.`);
      switch (message_type) {
        case 2 /* PING_PONG */:
          this.HandlePingPongMessage(message);
          return;
        case 3 /* ERROR */:
          this.HandleErrorMessage(message);
          return;
        case 1 /* ACK */:
          await this.HandleAckMessage(message);
          return;
        case 0 /* UTF8DATA */:
          this.HandleUTF8DataMessage(message);
          return;
        case 4 /* BINARYDATA */:
          this.HandleBinaryDataMessage(message);
          return;
        default:
          throw new Error(`Handle binary message type ${message_type}!`);
      }
    }
    async HandleError(err) {
      this.log(`${err.name} Exception in CryoSocket: ${err.message}`);
      this.socket.close(1e3, `CryoSocket ${this.sid} was closed due to an error.`);
    }
    TranslateCloseCode(code) {
      switch (code) {
        case 1e3:
          return "Connection closed normally.";
        case 1006:
          return "Connection closed abnormally.";
        default:
          return "Unspecified cause for connection closure.";
      }
    }
    async HandleClose(code, reason) {
      this.log(`CryoSocket was closed, code '${code}' (${this.TranslateCloseCode(code)}), reason '${reason.toString("utf8")}' .`);
      if (code !== 1e3) {
        let current_attempt = 0;
        this.log(`Abnormal termination of Websocket connection, attempting to reconnect...`);
        this.socket = null;
        this.emit("disconnected", void 0);
        while (current_attempt < 5) {
          try {
            this.socket = await _CryoClientWebsocketSession.ConstructSocket(this.host, this.timeout, this.bearer, this.sid);
            this.AttachListenersToSocket(this.socket);
            this.emit("reconnected", void 0);
            return;
          } catch (ex) {
            if (ex instanceof Error) {
              const errorCode = ex.cause?.error?.code;
              console.warn(`Unable to reconnect to '${this.host}'. Error code: '${errorCode}'. Retry attempt ${++current_attempt} / 5 ...`);
              await new Promise((resolve) => setTimeout(resolve, 5e3));
            }
          }
        }
        console.warn(`Gave up on reconnecting to '${this.host}'.`);
        return;
      }
      if (this.socket)
        this.socket.close();
      this.emit("closed", [code, reason.toString("utf8")]);
    }
    AttachListenersToSocket(socket) {
      socket.addEventListener("message", async (message_event) => {
        const raw_data = message_event.data;
        if (raw_data instanceof ArrayBuffer) {
          await this.HandleIncomingBinaryMessage(new CryoBuffer(new Uint8Array(raw_data)));
        } else {
          this.log("Received text message instead of binary!");
        }
      });
      socket.addEventListener("error", async (error_event) => {
        await this.HandleError(new Error("Unspecified WebSocket error!"));
      });
      socket.addEventListener("close", async (close_event) => {
        await this.HandleClose(close_event.code, new CryoBuffer(new TextEncoder().encode(close_event.reason)));
      });
    }
    static async ConstructSocket(host, timeout, bearer, sid) {
      const full_host_url = new URL(host);
      full_host_url.searchParams.set("authorization", `Bearer ${bearer}`);
      full_host_url.searchParams.set("x-cryo-sid", sid);
      const sck = new WebSocket(full_host_url);
      sck.binaryType = "arraybuffer";
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (sck.readyState !== WebSocket.OPEN)
            reject(new Error(`Connection timeout of ${timeout} ms reached!`));
        }, timeout);
        sck.addEventListener("open", () => {
          resolve(sck);
        });
        sck.addEventListener("error", (err) => {
          reject(new Error(`Error during session initialisation!`, { cause: err }));
        });
      });
    }
    static async Connect(host, bearer, timeout = 5e3) {
      const sid = crypto.randomUUID();
      const socket = await _CryoClientWebsocketSession.ConstructSocket(host, timeout, bearer, sid);
      return new _CryoClientWebsocketSession(host, sid, socket, timeout, bearer);
    }
    /*
    * Send an utf8 message to the server
    * */
    SendUTF8(message) {
      const new_ack_id = this.current_ack++;
      const formatted_message = CryoBinaryMessageFormatterFactory.GetFormatter("utf8data").Serialize(this.sid, new_ack_id, message);
      this.HandleOutgoingBinaryMessage(formatted_message);
    }
    /*
    * Send a binary message to the server
    * */
    SendBinary(message) {
      const new_ack_id = this.current_ack++;
      const formatted_message = CryoBinaryMessageFormatterFactory.GetFormatter("binarydata").Serialize(this.sid, new_ack_id, message);
      this.HandleOutgoingBinaryMessage(formatted_message);
    }
    get session_id() {
      return this.sid;
    }
    Destroy() {
      this.socket.close();
    }
  };

  // src/index.ts
  async function cryo(host, bearer, timeout = 5e3) {
    return CryoClientWebsocketSession.Connect(host, bearer, timeout);
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=index.js.map
