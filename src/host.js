class Host {
  constructor(game) {
    this.game = game;
    this.connections = [];
    this.id = crypto.randomUUID().slice(0, 8).toUpperCase();
    this.roomJoinOnline = false;
    this.opening = true;
    this.mode =
      window.urlData && urlData.mode === "versus" ? "versus" : "classic";
    this.username = (localStorage.getItem("username") || "Host").slice(0, 18);
    this.hostRole = this.mode === "versus" ? "observer" : "player";
    this.maxTeamPlayers = 6;
    this.snapshotSequence = 0;
    this.progress = { team1: 1, team2: 1 };
    this.finished = { team1: false, team2: false };
    this.matchWinner = null;
    this.matchStarted = false;
  }
  init() {
    this.peer = createParkPeer(this.id);
    this.peer.on("open", (id) => {
      this.roomJoinOnline = true;
      this.opening = false;
      this.joinConn = { selfId: id };
      setRoomCode(id);
      this.broadcastLobby();
    });
    this.peer.on("connection", (connection) => this.openConnection(connection));
  }
  broadcast(data) {
    this.connections.forEach((conn) => {
      if (conn.fullyConnected) conn.send(data);
    });
  }
  sendTo(conn, payload) {
    if (conn && conn.fullyConnected) conn.send(JSON.stringify(payload));
  }
  closeConnection(conn) {
    const i = this.connections.indexOf(conn);
    if (i >= 0) this.connections.splice(i, 1);
    if (conn.player) {
      conn.player.unload();
      conn.player = null;
    }
    if (this.matchStarted && conn.role !== "observer" && !this.matchWinner) {
      this.game.matter.engine.timing.timeScale = 0;
      if (window.versusSession) versusSession.pause();
      this.broadcast(JSON.stringify({ matchInterrupted: true }));
      if (window.showLobbyMessage)
        showLobbyMessage(
          "Match stopped: a player disconnected. Return to the lobby to form equal teams.",
          true,
        );
    }
    this.broadcastLobby();
  }
  openConnection(dataConnection) {
    if (this.connections.length >= 32) {
      dataConnection.close();
      return;
    }
    const connection = new ParkChannel(dataConnection, true);
    connection.role = this.mode === "versus" ? "observer" : "player";
    connection.clientUsername = "Player";
    connection.e.onData = (d) => {
      try {
        if (typeof d !== "string" || d.length > 8000) return;
        d = JSON.parse(d);
        if (!d || typeof d !== "object") return;
      } catch {
        return;
      }
      if (d.setUsername) {
        connection.clientUsername = String(d.setUsername || "Player").slice(
          0,
          18,
        );
        this.broadcastLobby();
      }
      if (d.requestRole) this.requestRole(connection, d.requestRole);
      if (d.readyForSnapshots) connection.readyForSnapshots = true;
      if (d.playerReady && connection.player?.body.id === d.playerReady)
        connection.playerReady = d.playerReady;
      if (d.ping) connection.sendLatest(JSON.stringify({ pong: d.ping }));
      if (d.input && connection.role !== "observer") {
        const input = d.input;
        if (
          !Number.isSafeInteger(input.sequence) ||
          input.sequence <= (connection.inputSequence || 0)
        )
          return;
        connection.inputSequence = input.sequence;
        connection.player = this.updateClientBody(
          { keys: input.keys },
          connection,
        );
        if (
          connection.player &&
          Number.isSafeInteger(input.jumpSequence) &&
          input.jumpSequence > (connection.jumpSequence || 0)
        ) {
          connection.player.pendingJump = true;
          connection.jumpSequence = input.jumpSequence;
        }
        connection.lastInputAt = performance.now();
      }
    };
    connection.e.onConnection = () => {
      const incoming = document.getElementById("incoming");
      if (incoming) incoming.textContent = "";
      this.sendTo(connection, {
        roomConfig: { mode: this.mode, maxTeamPlayers: this.maxTeamPlayers },
        lobbyState: this.getLobbyState(),
        campaign: window.parkCampaign || null,
        ...(this.matchStarted ? { startGame: true } : {}),
      });
    };
    connection.e.onClose = () => this.closeConnection(connection);
    this.connections.push(connection);
    return connection;
  }
  getCounts(excludeConn = null) {
    let team1 = 0,
      team2 = 0;
    this.connections.forEach((c) => {
      if (c === excludeConn) return;
      if (c.role === "team1") team1++;
      if (c.role === "team2") team2++;
    });
    if (this.hostRole === "team1") team1++;
    if (this.hostRole === "team2") team2++;
    return { team1, team2 };
  }
  canJoinRole(conn, role) {
    if (this.mode !== "versus") return role === "player";
    if (this.matchStarted) return false;
    if (role === "observer") return true;
    if (role !== "team1" && role !== "team2") return false;
    if (this.matchStarted) return false;
    const counts = this.getCounts(conn);
    const target = role === "team1" ? counts.team1 : counts.team2;
    const other = role === "team1" ? counts.team2 : counts.team1;
    if (target >= this.maxTeamPlayers) return false;
    return target <= other;
  }
  requestRole(conn, role) {
    if (!this.canJoinRole(conn, role)) {
      const counts = this.getCounts(conn);
      const full =
        (role === "team1" ? counts.team1 : counts.team2) >= this.maxTeamPlayers;
      this.sendTo(conn, {
        roleResult: {
          ok: false,
          role: conn.role,
          message: full
            ? `That team is full (${this.maxTeamPlayers}/${this.maxTeamPlayers}).`
            : this.matchStarted
              ? "The match has already started."
              : "Join the smaller team, or observe.",
        },
        lobbyState: this.getLobbyState(),
      });
      return;
    }
    const oldRole = conn.role;
    conn.role = role;
    if (role === "observer" && conn.player) {
      conn.player.setObserver && conn.player.setObserver(true);
      conn.player.unload();
      conn.player = null;
    }
    if (oldRole === "observer" && role !== "observer") conn.player = null;
    this.sendTo(conn, {
      roleResult: {
        ok: true,
        role,
        message:
          role === "observer"
            ? "Now observing."
            : `Joined ${role === "team1" ? "Team 1" : "Team 2"}.`,
      },
      lobbyState: this.getLobbyState(),
    });
    this.broadcastLobby();
  }
  requestHostRole(role) {
    if (this.mode !== "versus" || this.matchStarted) return false;
    const fake = { role: this.hostRole };
    const old = this.hostRole;
    this.hostRole = "observer";
    const allowed = role === "observer" || this.canJoinRole(fake, role);
    this.hostRole = allowed ? role : old;
    const hostPlayer = this.game.players.find((p) => p.isHostPlayer);
    if (hostPlayer) {
      hostPlayer.team = this.hostRole;
      hostPlayer.setObserver &&
        hostPlayer.setObserver(this.hostRole === "observer");
    }
    this.broadcastLobby();
    return allowed;
  }
  getLobbyState() {
    const members = [
      {
        id: "host",
        username: this.username,
        role: this.hostRole,
        isHost: true,
      },
    ];
    this.connections.forEach((c, i) =>
      members.push({
        id: c.selfId || `guest-${i}`,
        username: c.clientUsername || "Player",
        role: c.role,
        isHost: false,
      }),
    );
    return {
      mode: this.mode,
      members,
      counts: this.getCounts(),
      maxTeamPlayers: this.maxTeamPlayers,
      progress: { ...this.progress },
      finished: { ...this.finished },
      matchWinner: this.matchWinner,
      matchStarted: this.matchStarted,
    };
  }
  broadcastLobby() {
    const state = this.getLobbyState();
    if (window.renderLobbyState) renderLobbyState(state);
    this.broadcast(
      JSON.stringify({
        lobbyState: state,
        roomConfig: { mode: this.mode, maxTeamPlayers: this.maxTeamPlayers },
      }),
    );
  }
  updateClientBody(data, conn) {
    if (!data || !data.keys || typeof data.keys !== "object")
      return conn.player || null;
    let foundPlayer = conn.player;
    if (!foundPlayer) {
      foundPlayer = this.game.playerhandler.addPlayer({
        color: this.game.fetchColor(),
      });
      foundPlayer.onlinePlayer = true;
      conn.player = foundPlayer;
      this.sendTo(conn, { assignedPlayerId: foundPlayer.body.id });
    }
    const allowed = ["arrowleft", "arrowright", "arrowup", "arrowdown"];
    foundPlayer.keys = Object.fromEntries(
      allowed.map((k) => [k, data.keys[k] === true]),
    );
    conn.clientBody = foundPlayer;
    foundPlayer.conn = conn;
    foundPlayer.team = conn.role;
    foundPlayer.username = conn.clientUsername;
    foundPlayer.campaignStage = this.progress[conn.role] || 1;
    return foundPlayer;
  }
  getTeamPlayers(team) {
    return (
      window.versusSession
        ? versusSession.games[team].players
        : this.game.players
    ).filter((p) => !p.observer && !p.unloading && p.team === team);
  }
  clearTeamStageEffects(team) {
    const teamPlayers = this.getTeamPlayers(team);
    this.game.constraints = this.game.constraints.filter(
      (c) => !teamPlayers.includes(c.bodyA) && !teamPlayers.includes(c.bodyB),
    );
    teamPlayers.forEach((p) => p.removeShield());
  }
  applyCampaignStage(team, stage) {
    if (window.versusSession) {
      versusSession.load(team, stage);
      return;
    }
    if (!this.game.levelHandler.currentLevel.stageMeta) return;
    const meta =
      this.game.levelHandler.currentLevel.stageMeta[team] &&
      this.game.levelHandler.currentLevel.stageMeta[team][stage];
    const spawn =
      this.game.levelHandler.currentLevel.spawnByTeam &&
      this.game.levelHandler.currentLevel.spawnByTeam[team] &&
      this.game.levelHandler.currentLevel.spawnByTeam[team][stage];
    if (!meta || !spawn) return;
    const players = this.getTeamPlayers(team);
    this.clearTeamStageEffects(team);
    players.forEach((p, i) => {
      p.campaignStage = stage;
      p.dead = false;
      p.ready = false;
      p.body.isStatic = false;
      Matter.Body.setPosition(p.body, v(spawn.x * 50, spawn.y * 50 - i * 48));
      Matter.Body.setVelocity(p.body, v(0, 0));
    });
    players.forEach((p) => p.setScale(1));
    (meta.shields || []).forEach((s, i) => {
      if (players.length) players[i % players.length].hasShield[s] = true;
    });
    if (meta.bindPlayers && players.length > 1) this.game.bindPlayers(players);
    if (meta.shieldRule && players.length) {
      const bearer = players
        .slice()
        .sort((a, b) => String(a.body.id).localeCompare(String(b.body.id)))[0];
      bearer.hasShield[meta.shieldRule.direction || 4] = true;
    }
  }
  beginMatch() {
    this.matchStarted = true;
    this.matchWinner = null;
    this.progress = { team1: 1, team2: 1 };
    this.finished = { team1: false, team2: false };
    if (this.mode === "versus") {
      this.applyCampaignStage("team1", 1);
      this.applyCampaignStage("team2", 1);
      this.broadcast(JSON.stringify({ campaignState: this.getLobbyState() }));
    }
    this.broadcastLobby();
  }
  completeStage(team, stage) {
    if (this.mode !== "versus" || this.matchWinner || this.finished[team])
      return;
    if (stage !== this.progress[team]) return;
    if (stage >= 5) {
      this.finished[team] = true;
      this.matchWinner = team;
      if (window.versusSession) versusSession.pause();
      this.broadcastLobby();
      this.broadcast(
        JSON.stringify({
          matchWinner: team,
          campaignState: this.getLobbyState(),
        }),
      );
      return;
    }
    this.progress[team] = stage + 1;
    this.applyCampaignStage(team, stage + 1);
    this.broadcastLobby();
    this.broadcast(
      JSON.stringify({
        campaignAdvance: { team, stage: stage + 1 },
        campaignState: this.getLobbyState(),
      }),
    );
  }
  updateClients() {
    if (window.versusSession) {
      this.connections.forEach((c) => {
        if (c.player && performance.now() - (c.lastInputAt || 0) > 500)
          c.player.keys = {};
      });
      const worlds = versusSession.snapshot();
      this.connections
        .filter(
          (c) =>
            c.readyForSnapshots &&
            (c.role === "observer" ||
              (c.player && c.playerReady === c.player.body.id)),
        )
        .forEach((c) =>
          c.sendLatest(
            JSON.stringify({
              snapshotSequence: ++this.snapshotSequence,
              serverTime: performance.now(),
              worldState: this.getLobbyState(),
              teamWorlds:
                c.role === "observer" ? worlds : { [c.role]: worlds[c.role] },
            }),
          ),
        );
      return;
    }
    this.connections.forEach((c) => {
      if (c.player && performance.now() - (c.lastInputAt || 0) > 500)
        c.player.keys = {};
    });
    const payload = JSON.stringify({
      snapshotSequence: ++this.snapshotSequence,
      serverTime: performance.now(),
      levelRevision: this.game.levelHandler.revision || 0,
      levelName: this.game.levelHandler.currentLevel.name,
      playerData: this.getPlayersData(),
      syncData: this.game.syncHandler.getSyncData(),
    });
    this.connections.forEach((conn) => {
      if (
        conn.readyForSnapshots &&
        (conn.role === "observer" ||
          (conn.player && conn.playerReady === conn.player.body.id))
      )
        conn.sendLatest(payload);
    });
  }
  getPlayersData() {
    return this.game.players
      .filter((p) => !p.observer)
      .map((p) => this.getPlayerData(p));
  }
  getPlayerData(p) {
    return parsePlayerData(p);
  }
}
