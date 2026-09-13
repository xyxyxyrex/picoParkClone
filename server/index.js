"use strict";
/*
 * Tiny Park relay server.
 *
 * One WebSocket per participant, one room per host. The relay forwards opaque
 * payloads; src/host.js remains the authority on gameplay. Run it behind TLS on
 * 443 (see server/README.md) so guests on locked-down corporate networks can
 * reach it -- that reachability, not tick rate, is why this replaces WebRTC.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { RoomRegistry, LIMITS } = require("./rooms.js");

const PORT = Number(process.env.PORT || 8787);
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : null;
/* Stop relaying disposable traffic to a socket that is already behind. */
const LOSSY_BACKPRESSURE_BYTES = 64 * 1024;
const HEARTBEAT_MS = 30000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

function createServer() {
  const rooms = new RoomRegistry();

  const httpServer = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, rooms: rooms.count }));
      return;
    }
    if (!STATIC_DIR) {
      response.writeHead(404).end("Not found");
      return;
    }
    const requested = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = requested === "/" ? "/index.html" : requested;
    const target = path.join(STATIC_DIR, path.normalize(relative));
    if (!target.startsWith(STATIC_DIR)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    /* Match Cloudflare Pages: /game resolves to game.html. */
    const candidates = path.extname(target)
      ? [target]
      : [target, `${target}.html`];
    const attempt = (index) => {
      if (index >= candidates.length) {
        response.writeHead(404).end("Not found");
        return;
      }
      fs.readFile(candidates[index], (error, body) => {
        if (error) return attempt(index + 1);
        response.writeHead(200, {
          "Content-Type":
            MIME[path.extname(candidates[index])] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(body);
      });
    };
    attempt(0);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const send = (socket, payload) => {
    if (socket.readyState !== socket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  };
  const fail = (socket, code, message) => {
    send(socket, { t: "error", code, message });
  };

  /* A host leaving ends the room; a guest leaving only notifies the host. */
  const teardown = (socket) => {
    if (socket.roomCode && socket.isHost) {
      const room = rooms.destroy(socket.roomCode);
      if (room)
        room.guests.forEach((guest) => {
          send(guest, { t: "host-gone" });
          guest.close(4001, "host-gone");
        });
    } else if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room && room.removeGuest(socket.guestId))
        send(room.host, { t: "peer-close", peer: socket.guestId });
    }
    socket.roomCode = null;
  };

  wss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.isHost = false;
    socket.roomCode = null;
    socket.guestId = null;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (raw, isBinary) => {
      if (isBinary || raw.length > LIMITS.maxMessageBytes) return;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;

      if (message.t === "host") {
        if (socket.roomCode) return;
        const room = rooms.create(socket);
        if (!room) return fail(socket, "no-capacity", "Server is full.");
        socket.isHost = true;
        socket.roomCode = room.code;
        send(socket, { t: "hosted", room: room.code, self: "host" });
        return;
      }

      if (message.t === "join") {
        if (socket.roomCode) return;
        const room = rooms.get(message.room);
        if (!room)
          return fail(
            socket,
            "no-room",
            "Room not found. Check the code and try again.",
          );
        const guestId = room.addGuest(socket);
        if (!guestId) return fail(socket, "room-full", "That room is full.");
        socket.roomCode = room.code;
        socket.guestId = guestId;
        send(socket, { t: "joined", room: room.code, self: guestId });
        send(room.host, { t: "peer-open", peer: guestId });
        return;
      }

      if (message.t === "to") {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        const target = socket.isHost
          ? room.guests.get(message.peer)
          : room.host;
        if (!target || target.readyState !== target.OPEN) return;
        if (message.lossy && target.bufferedAmount > LOSSY_BACKPRESSURE_BYTES)
          return;
        send(target, {
          t: "from",
          ...(socket.isHost ? {} : { peer: socket.guestId }),
          d: message.d,
        });
      }
    });

    socket.on("close", () => teardown(socket));
    socket.on("error", () => teardown(socket));
  });

  /* Corporate proxies silently drop idle sockets; surface that as a real close. */
  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return { httpServer, wss, rooms };
}

if (require.main === module) {
  const { httpServer } = createServer();
  httpServer.listen(PORT, () => {
    console.log(`Tiny Park relay listening on :${PORT} (ws path /ws)`);
    if (STATIC_DIR) console.log(`Serving static files from ${STATIC_DIR}`);
  });
}

module.exports = { createServer };
