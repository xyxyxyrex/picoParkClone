/* One bidirectional WebRTC data channel per guest. The room host owns simulation. */
function createParkPeer(id) {
  const peer = new Peer(id || undefined, {
    debug: 1,
    ...(window.PARK_PEER_OPTIONS || {}),
  });
  let retry = 0,
    timer;
  peer.on("open", () => {
    retry = 0;
    clearTimeout(timer);
  });
  peer.on("disconnected", () => {
    if (peer.destroyed || retry >= 5) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        if (!peer.destroyed && peer.disconnected) peer.reconnect();
      },
      Math.min(30000, 2000 * 2 ** retry++),
    );
  });
  peer.on("error", (error) => {
    const message =
      error.type === "peer-unavailable"
        ? "Room not found. Check the code and try again."
        : "Room connection unavailable. Please retry shortly.";
    if (window.showLobbyMessage) showLobbyMessage(message, true);
  });
  addEventListener(
    "pagehide",
    () => {
      clearTimeout(timer);
      peer.destroy();
    },
    { once: true },
  );
  return peer;
}
class ParkChannel {
  constructor(connection, acceptMotion = false) {
    this.connection = connection;
    this.selfId = connection.peer;
    this.fullyConnected = false;
    this.e = { onConnection: () => {}, onData: () => {}, onClose: () => {} };
    const attachMotion = (channel) => {
      if (channel.label !== "park-motion-v1") return;
      this.motion = channel;
      channel.onmessage = (event) => {
        if (typeof event.data === "string" && event.data.length < 250000)
          this.e.onData(event.data);
      };
    };
    const pc = connection.peerConnection;
    if (acceptMotion && pc) {
      const original = pc.ondatachannel;
      pc.ondatachannel = (event) => {
        if (event.channel.label === "park-motion-v1")
          attachMotion(event.channel);
        else original?.call(pc, event);
      };
    }
    connection.on("open", () => {
      this.fullyConnected = true;
      if (!acceptMotion)
        attachMotion(
          connection.peerConnection.createDataChannel("park-motion-v1", {
            ordered: false,
            maxRetransmits: 0,
          }),
        );
      this.e.onConnection();
    });
    connection.on("data", (data) => {
      if (typeof data === "string" && data.length < 4000000)
        this.e.onData(data);
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.fullyConnected = false;
      this.e.onClose();
    };
    connection.on("close", close);
    connection.on("error", close);
  }
  send(data) {
    if (
      this.fullyConnected &&
      this.connection.open &&
      (this.connection.dataChannel?.bufferedAmount || 0) < 1000000
    )
      this.connection.send(data);
  }
  sendLatest(data) {
    if (
      this.motion?.readyState === "open" &&
      this.motion.bufferedAmount < 16384
    ) {
      try {
        this.motion.send(data);
        return true;
      } catch {
        this.sendFailures = (this.sendFailures || 0) + 1;
      }
    }
    return false;
  }
  terminate() {
    this.connection.close();
  }
}

function parsePlayerData(player) {
  return {
    position: player.body.position,
    velocity: player.body.velocity,
    id: player.body.id,
    direction: player.direction,
    keys: player.keys,
    frame: player.frame,
    color: player.color,
    scale: player.scale,
    ready: player.ready,
    shields: player.hasShield,
    dead: player.dead,
    team: player.team || null,
    username: player.username || "Player",
    campaignStage: player.campaignStage || 1,
    observer: !!player.observer,
  };
}

function setPlayerWithData(player, data, updatePhysics = true) {
  if (updatePhysics && data.position) {
    Matter.Body.setPosition(player.body, data.position);
    player.direction = data.direction;
  }
  if (!window.hostConnection && player !== window.clientConnection?.mainPlayer)
    player.updateKeys(data.keys || {});
  player.color = data.color;
  player.frame = data.frame;
  player.ready = data.ready;
  player.hasShield = data.shields || player.hasShield;
  player.dead = data.dead;
  player.team = data.team || null;
  player.username = data.username || player.username || "Player";
  player.campaignStage = data.campaignStage || 1;
  if (player.setObserver) player.setObserver(!!data.observer);
  player.setScale(data.scale || 1);
}
