import { DurableObject } from "cloudflare:workers";

const ROOM_PATTERN = /^[A-Z2-9]{4}$/;
const MAX_GUESTS = 32;
const MAX_MESSAGE_BYTES = 2_500_000;

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function roomFromRequest(request) {
  const room = new URL(request.url).searchParams.get("room") || "";
  return room.toUpperCase();
}

export class ParkRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = null;
    this.guests = new Map();
    this.nextGuest = 1;
    for (const socket of ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment?.role === "host") this.host = socket;
      if (attachment?.role === "guest" && attachment.id) {
        this.guests.set(attachment.id, socket);
        const match = /^g(\d+)$/.exec(attachment.id);
        if (match)
          this.nextGuest = Math.max(this.nextGuest, Number(match[1]) + 1);
      }
    }
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket upgrade", { status: 426 });

    const isHost = new URL(request.url).searchParams.get("host") === "1";
    if (isHost && this.host)
      return json({ error: "Room already has a host." }, 409);
    if (!isHost && !this.host)
      return json(
        { error: "Room not found. Check the code and try again." },
        404,
      );
    if (!isHost && this.guests.size >= MAX_GUESTS)
      return json({ error: "That room is full." }, 409);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const id = isHost ? "host" : `g${this.nextGuest++}`;
    const attachment = { role: isHost ? "host" : "guest", id };
    server.serializeAttachment(attachment);
    if (isHost) this.host = server;
    else this.guests.set(id, server);

    if (isHost) {
      server.send(
        JSON.stringify({
          t: "hosted",
          room: roomFromRequest(request),
          self: "host",
        }),
      );
    } else {
      server.send(
        JSON.stringify({
          t: "joined",
          room: roomFromRequest(request),
          self: id,
        }),
      );
      this.host?.send(JSON.stringify({ t: "peer-open", peer: id }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    const raw =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || payload.t !== "to") return;
    const sender = socket.deserializeAttachment();
    const target =
      sender?.role === "host" ? this.guests.get(payload.peer) : this.host;
    if (!target || target.readyState !== WebSocket.OPEN) return;
    if (payload.lossy && target.bufferedAmount > 64 * 1024) return;
    target.send(
      JSON.stringify({
        t: "from",
        ...(sender?.role === "guest" ? { peer: sender.id } : {}),
        d: payload.d,
      }),
    );
  }

  webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    if (attachment?.role === "host") {
      if (this.host === socket) this.host = null;
      for (const guest of this.guests.values()) {
        guest.send(JSON.stringify({ t: "host-gone" }));
        guest.close(4001, "host-gone");
      }
      this.guests.clear();
      return;
    }
    if (attachment?.id && this.guests.get(attachment.id) === socket) {
      this.guests.delete(attachment.id);
      this.host?.send(JSON.stringify({ t: "peer-close", peer: attachment.id }));
    }
  }

  webSocketError(socket) {
    this.webSocketClose(socket);
  }
}

export default {
  async fetch(request, env) {
    const room = roomFromRequest(request);
    if (!ROOM_PATTERN.test(room))
      return json({ error: "Invalid room code." }, 400);
    return env.ROOMS.getByName(`room:${room}`).fetch(request);
  },
};
