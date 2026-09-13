/*
 * WebSocket transport.
 *
 * Presents the same surface as ParkChannel so host.js / client.js do not care
 * which transport is underneath. A single TCP socket carries both classes of
 * traffic: send() always enqueues, sendLatest() drops under backpressure so a
 * slow guest gets a skipped snapshot instead of an ever-growing queue.
 */
(function () {
  const DEFAULT_PATH = "/ws";
  // Keep lossy traffic (inputs and snapshots) from sitting in a long socket
  // queue. Dropping an old frame is preferable to rendering it late.
  const LOSSY_BUFFER_LIMIT = 8192;
  const RELIABLE_BUFFER_LIMIT = 1000000;

  const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function randomRoomCode() {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return [...values]
      .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
      .join("");
  }

  function relayUrl(peer) {
    const configured = window.PARK_RELAY_URL || null;
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(
      configured || `${scheme}//${location.host}${DEFAULT_PATH}`,
    );
    if (peer.joinCode) url.searchParams.set("room", peer.joinCode);
    if (peer.mode === "host") url.searchParams.set("host", "1");
    return url.toString();
  }

  class ParkWsChannel {
    /* `peer` owns the live socket, which survives reconnects the channel does not. */
    constructor(peer, peerId) {
      this.peer = peer;
      this.peerId = peerId || null;
      this.selfId = peerId || null;
      this.fullyConnected = false;
      this.closed = false;
      this.e = { onConnection: () => {}, onData: () => {}, onClose: () => {} };
    }
    /* Diagnostics and tests probe `motion` to confirm a usable data path. */
    get motion() {
      return this.peer.socket;
    }
    _open() {
      if (this.fullyConnected || this.closed) return;
      this.fullyConnected = true;
      this.e.onConnection();
    }
    _deliver(payload) {
      if (typeof payload === "string" && payload.length < 4000000)
        this.e.onData(payload);
    }
    _close() {
      if (this.closed) return;
      this.closed = true;
      this.fullyConnected = false;
      this.e.onClose();
    }
    _write(data, lossy) {
      const socket = this.peer.socket;
      if (this.closed || socket?.readyState !== WebSocket.OPEN) return false;
      const limit = lossy ? LOSSY_BUFFER_LIMIT : RELIABLE_BUFFER_LIMIT;
      if (socket.bufferedAmount > limit) return false;
      socket.send(
        JSON.stringify({
          t: "to",
          ...(this.peerId ? { peer: this.peerId } : {}),
          ...(lossy ? { lossy: 1 } : {}),
          d: data,
        }),
      );
      return true;
    }
    send(data) {
      if (this.fullyConnected) this._write(data, false);
    }
    sendLatest(data) {
      return this.fullyConnected ? this._write(data, true) : false;
    }
    terminate() {
      this._close();
    }
  }

  /*
   * Mimics the slice of the PeerJS Peer API that host.js / client.js use, so the
   * transport can be swapped without touching their connection lifecycles.
   */
  class ParkWsPeer {
    constructor() {
      this.handlers = {};
      this.channels = new Map();
      this.destroyed = false;
      this.disconnected = false;
      this.socket = null;
      this.id = null;
      this.mode = null;
      this.joinCode = null;
      this.guestChannel = null;
      this.retry = 0;
      this.timer = null;
      addEventListener("pagehide", () => this.destroy(), { once: true });
    }
    on(event, handler) {
      (this.handlers[event] ||= []).push(handler);
      return this;
    }
    emit(event, ...args) {
      (this.handlers[event] || []).forEach((handler) => handler(...args));
    }
    _connect() {
      let socket;
      try {
        socket = new WebSocket(relayUrl(this));
      } catch {
        this.emit("error", { type: "server-error" });
        return;
      }
      this.socket = socket;
      socket.onopen = () => {
        this.disconnected = false;
        this.retry = 0;
        socket.send(
          JSON.stringify(
            this.mode === "host"
              ? { t: "host" }
              : { t: "join", room: this.joinCode },
          ),
        );
      };
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        this._receive(message);
      };
      socket.onclose = () => {
        /* A Pages/DO HTTP rejection happens before WebSocket open, so there is
         * no relay error frame to decode. Surface that as the same room error
         * the Node relay sends after upgrading the socket. */
        if (this.mode === "join" && !this.id && this.retry === 0) {
          this.destroyed = true;
          this._closeAll();
          return this.emit("error", {
            type: "peer-unavailable",
            message: "Room not found. Check the code and try again.",
          });
        }
        this._dropped();
      };
      socket.onerror = () => {};
    }
    _receive(message) {
      switch (message.t) {
        case "hosted":
          this.id = message.room;
          this.emit("open", message.room);
          return;
        case "joined":
          this.id = message.self;
          this.guestChannel._open();
          this.emit("open", message.self);
          return;
        case "peer-open": {
          const channel = new ParkWsChannel(this, message.peer);
          this.channels.set(message.peer, channel);
          this.emit("connection", channel);
          channel._open();
          return;
        }
        case "peer-close": {
          const channel = this.channels.get(message.peer);
          this.channels.delete(message.peer);
          channel?._close();
          return;
        }
        case "from":
          (message.peer
            ? this.channels.get(message.peer)
            : this.guestChannel
          )?._deliver(message.d);
          return;
        case "host-gone":
          this.destroyed = true;
          this.guestChannel?._close();
          return;
        case "error":
          this.emit("error", {
            type:
              message.code === "no-room" ? "peer-unavailable" : "server-error",
            message: message.message,
          });
      }
    }
    _closeAll() {
      this.channels.forEach((channel) => channel._close());
      this.guestChannel?._close();
    }
    _dropped() {
      if (this.destroyed) return this._closeAll();
      this.disconnected = true;
      // The old socket is no longer a usable channel. Mark it closed so the
      // reconnect path creates a fresh channel and runs its handshake again.
      this.guestChannel?._close();
      this.channels.forEach((channel) => channel._close());
      this.channels.clear();
      this.emit("disconnected");
      if (this.retry >= 5) return this._closeAll();
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => {
          if (this.destroyed) return;
          if (this.mode === "join") {
            this.guestChannel = new ParkWsChannel(this, null);
            this.emit("reconnected", this.guestChannel);
          }
          this._connect();
        },
        Math.min(30000, 1000 * 2 ** this.retry++),
      );
    }
    host(preferredId) {
      this.mode = "host";
      this.joinCode = /^[A-Z2-9]{4}$/.test(String(preferredId || ""))
        ? String(preferredId).toUpperCase()
        : randomRoomCode();
      this._connect();
      return this;
    }
    connect(code) {
      this.mode = "join";
      this.joinCode = String(code || "").toUpperCase();
      this.guestChannel = new ParkWsChannel(this, null);
      this._connect();
      return this.guestChannel;
    }
    destroy() {
      this.destroyed = true;
      clearTimeout(this.timer);
      try {
        this.socket?.close();
      } catch {}
    }
  }

  window.ParkWsPeer = ParkWsPeer;
  window.ParkWsChannel = ParkWsChannel;
})();
