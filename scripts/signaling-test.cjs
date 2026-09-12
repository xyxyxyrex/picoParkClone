// Local signaling only; gameplay data still travels over real WebRTC channels.
require("peer").PeerServer({ port: 9000, path: "/park", host: "127.0.0.1" });
