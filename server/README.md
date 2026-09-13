# Tiny Park relay

A WebSocket relay that replaces PeerJS/WebRTC for room connectivity.

## Why this exists

The game is host-authoritative: one browser simulates, everyone else renders
interpolated snapshots. That part is unchanged. What changed is how the packets
get there.

WebRTC needs NAT traversal. Nothing in this repo ever configured
`PARK_PEER_OPTIONS` in production, so live rooms used PeerJS defaults: the public
`0.peerjs.com` signaling server, Google's public STUN, and PeerJS's shared free
TURN. On a corporate network — UDP egress filtered, symmetric NAT, everything
through a proxy — a share of guests never connect at all, and the only feedback
is _"Room connection unavailable."_

A relay on `wss://…:443` is indistinguishable from ordinary HTTPS traffic to a
corporate firewall. That reachability is the point; tick rate is secondary.

## Running it

```sh
npm run relay                 # relay only, port 8787
npm run relay:dev             # relay + the built site from ./dist
PORT=8080 STATIC_DIR=./dist node server/index.js
```

The `npm run relay:dev` helper sets these variables portably on Windows and Unix.
For the meeting, deploy the Cloudflare Worker in `relay-worker/` with
`npm run realtime:deploy`; Pages routes `/ws` to its room Durable Objects
through `functions/ws.js`. The Node relay remains available as a laptop or VPS
fallback.

`GET /healthz` returns `{ok, rooms}`. WebSocket endpoint is `/ws`.

## Pointing the game at it

`game.html` sets `window.PARK_RELAY_URL`. Leave it `null` when the Pages Function
serves both the page and the relay — the client derives `wss://<host>/ws`. Set it
explicitly only when using the Node fallback on another host:

```js
window.PARK_RELAY_URL = "wss://park-relay.example.com/ws";
```

Transport selection lives in `parkTransport()` in `src/multiplayer.js`: the relay
is the default, and PeerJS is used only when `window.PARK_PEER_OPTIONS` is set or
`window.PARK_TRANSPORT === "peerjs"`. The existing WebRTC tests rely on that.

## Deploying it

This is a plain Node `ws` server with no host-specific APIs, so it runs anywhere
Node runs: a VPS, a container, Fly / Render / Railway, or just a laptop on the
office network for the duration of an event. Two rules matter more than the
choice of host.

**Serve it over TLS on 443.** A custom port is the single thing most likely to be
blocked on the network you are trying to reach, and the page cannot open a `ws://`
socket from an `https://` origin anyway. Terminate TLS in front of Node and proxy
the upgrade.

**Put it near the players.** The relay adds a hop that direct P2P did not have —
host → relay → guest. On a nearby host that is tens of milliseconds and worth the
reliability; a relay on another continent is worse than what it replaced.

Caddy handles the certificate on its own:

```caddy
park.example.com {
    reverse_proxy localhost:8787
}
```

nginx needs the upgrade headers spelled out, and a read timeout longer than the
30s heartbeat:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
```

To keep it running on a plain host, as a systemd unit:

```ini
[Unit]
Description=Tiny Park relay
After=network.target

[Service]
WorkingDirectory=/srv/tiny-park
Environment=PORT=8787
Environment=STATIC_DIR=/srv/tiny-park/dist
ExecStart=/usr/bin/node server/index.js
Restart=always
User=tinypark

[Install]
WantedBy=multi-user.target
```

### The one host that needs a different server

Cloudflare Pages, which this repo currently deploys to (`wrangler.jsonc`), cannot
host this file: Workers have no long-lived Node process to hold sockets open. The
equivalent there is a **Durable Object** — one instance per room, using the
WebSocket Hibernation API, with rooms in the object's own state instead of the
`RoomRegistry` map.

That is a different `server/`, not a different game. The wire protocol below, the
client transport in `src/net-ws.js`, and everything in `src/host.js` and
`src/client.js` stay exactly as they are. Only the process that accepts the socket
and forwards `{t:"to"}` changes.

## Protocol

Client to relay:

| message                      | sent by | meaning                                                          |
| ---------------------------- | ------- | ---------------------------------------------------------------- |
| `{t:"host"}`                 | host    | claim a room; the relay picks the code                           |
| `{t:"join", room}`           | guest   | join by code                                                     |
| `{t:"to", peer?, d, lossy?}` | both    | forward `d`; hosts address a `peer`, guests always mean the host |

Relay to client:

| message                              | meaning                                |
| ------------------------------------ | -------------------------------------- |
| `{t:"hosted", room, self}`           | room created                           |
| `{t:"joined", room, self}`           | join accepted, `self` is your guest id |
| `{t:"peer-open"/"peer-close", peer}` | membership change, to the host         |
| `{t:"from", peer?, d}`               | a forwarded payload                    |
| `{t:"host-gone"}`                    | the host left; the room is gone        |
| `{t:"error", code, message}`         | `no-room`, `room-full`, `no-capacity`  |

`lossy: 1` marks disposable traffic (input, snapshots). The relay drops it rather
than queueing when the destination socket is already behind, which is what the
old unreliable WebRTC data channel gave us for free. `send()` never sets it. The
relay accepts up to 2.5 MB per framed message so a valid 2 MB published campaign
can cross the setup handshake.

Payloads in `d` are opaque strings: the relay makes no gameplay decisions, and
`src/host.js` stays the sole authority. The envelope is _addressed_ rather than
broadcast for a reason — moving simulation into this process later means the
relay stops forwarding and starts deciding, without the wire format or the
clients changing.

## Known limits

- The host is still a single point of failure. If the host's browser closes or
  suspends, the room ends. Designate a machine that stays awake and plugged in.
- A reconnecting guest is issued a **new** relay identity. During an active
  match the client also sends its assigned player id; the host reserves that
  body for 15 seconds and restores the same team and position when the browser
  returns. A timeout still interrupts the match so the remaining players do
  not wait forever for a missing teammate.
- Room codes are four characters from a 32-symbol alphabet with `I`, `O`, `0` and
  `1` removed, because the code gets read aloud across a room.
- `/api/levels` (campaign publishing) is a Cloudflare Pages function backed by D1
  and is **not** part of this server. Serving the static site from the VPS without
  it means `game.html` falls back to the built-in campaign and shows "Live levels
  unavailable" — which is handled, but it does mean edited levels won't load.
