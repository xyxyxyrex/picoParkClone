const test = require("node:test");
const assert = require("node:assert");
const WebSocket = require("ws");
const { createServer } = require("../server/index.js");
const { CODE_ALPHABET, randomCode } = require("../server/rooms.js");

function listen() {
  const { httpServer, wss } = createServer();
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () =>
      resolve({
        url: `ws://127.0.0.1:${httpServer.address().port}/ws`,
        close: () =>
          new Promise((done) => {
            wss.close();
            httpServer.close(done);
          }),
      }),
    );
  });
}

/* Collect messages so a test can await the next one matching a predicate. */
function open(url) {
  const socket = new WebSocket(url);
  socket.inbox = [];
  socket.waiters = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    socket.inbox.push(message);
    socket.waiters = socket.waiters.filter((w) => {
      if (!w.match(message)) return true;
      w.resolve(message);
      return false;
    });
  });
  socket.next = (match) =>
    new Promise((resolve, reject) => {
      const hit = socket.inbox.find(match);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error("timeout")), 3000);
      socket.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  socket.ready = new Promise((resolve) => socket.on("open", resolve));
  socket.tx = (payload) => socket.send(JSON.stringify(payload));
  return socket;
}

const byType = (t) => (m) => m.t === t;

test("room codes avoid characters that are misread when spoken aloud", () => {
  assert.ok(!/[IO01]/.test(CODE_ALPHABET));
  for (let i = 0; i < 200; i++) assert.match(randomCode(), /^[A-Z2-9]{4}$/);
});

test("host and guest exchange addressed payloads through the relay", async () => {
  const server = await listen();
  const host = open(server.url);
  await host.ready;
  host.tx({ t: "host" });
  const hosted = await host.next(byType("hosted"));
  assert.match(hosted.room, /^[A-Z2-9]{4}$/);

  const guest = open(server.url);
  await guest.ready;
  guest.tx({ t: "join", room: hosted.room });
  const joined = await guest.next(byType("joined"));
  const peerOpen = await host.next(byType("peer-open"));
  assert.equal(peerOpen.peer, joined.self);

  guest.tx({ t: "to", d: JSON.stringify({ setUsername: "Ada" }) });
  const fromGuest = await host.next(byType("from"));
  assert.equal(fromGuest.peer, joined.self);
  assert.equal(JSON.parse(fromGuest.d).setUsername, "Ada");

  host.tx({
    t: "to",
    peer: joined.self,
    d: JSON.stringify({ startGame: true }),
  });
  const fromHost = await guest.next(byType("from"));
  assert.equal(JSON.parse(fromHost.d).startGame, true);

  host.close();
  guest.close();
  await server.close();
});

test("a guest is never delivered another guest's traffic", async () => {
  const server = await listen();
  const host = open(server.url);
  await host.ready;
  host.tx({ t: "host" });
  const { room } = await host.next(byType("hosted"));

  const a = open(server.url),
    b = open(server.url);
  await Promise.all([a.ready, b.ready]);
  a.tx({ t: "join", room });
  const aId = (await a.next(byType("joined"))).self;
  b.tx({ t: "join", room });
  await b.next(byType("joined"));

  host.tx({ t: "to", peer: aId, d: "for-a" });
  await a.next((m) => m.t === "from" && m.d === "for-a");
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(b.inbox.filter(byType("from")).length, 0);

  host.close();
  a.close();
  b.close();
  await server.close();
});

test("a guest leaving notifies the host but leaves the room standing", async () => {
  const server = await listen();
  const host = open(server.url);
  await host.ready;
  host.tx({ t: "host" });
  const { room } = await host.next(byType("hosted"));
  const guest = open(server.url);
  await guest.ready;
  guest.tx({ t: "join", room });
  const guestId = (await guest.next(byType("joined"))).self;
  await host.next(byType("peer-open"));

  guest.close();
  const closed = await host.next(byType("peer-close"));
  assert.equal(closed.peer, guestId);

  const late = open(server.url);
  await late.ready;
  late.tx({ t: "join", room });
  await late.next(byType("joined"));

  host.close();
  late.close();
  await server.close();
});

test("a host leaving closes the room and tells the guests why", async () => {
  const server = await listen();
  const host = open(server.url);
  await host.ready;
  host.tx({ t: "host" });
  const { room } = await host.next(byType("hosted"));
  const guest = open(server.url);
  await guest.ready;
  guest.tx({ t: "join", room });
  await guest.next(byType("joined"));

  host.close();
  await guest.next(byType("host-gone"));

  const late = open(server.url);
  await late.ready;
  late.tx({ t: "join", room });
  const error = await late.next(byType("error"));
  assert.equal(error.code, "no-room");

  guest.close();
  late.close();
  await server.close();
});

test("an unknown room code is reported rather than silently dropped", async () => {
  const server = await listen();
  const guest = open(server.url);
  await guest.ready;
  guest.tx({ t: "join", room: "ZZZZ" });
  const error = await guest.next(byType("error"));
  assert.equal(error.code, "no-room");
  assert.match(error.message, /Room not found/);
  guest.close();
  await server.close();
});
