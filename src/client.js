class Client {
  constructor(game, player) {
    this.game = game;
    this.mainPlayer = player;
    this.roomConn = null;
    this.mainConn = null;
    this.recentPing = 0;
    this.username = (localStorage.getItem("username") || "Player").slice(0, 18);
    this.role = "player";
    this.mode = "classic";
    this.maxTeamPlayers = 6;
    this.lastLobbyState = null;
    this.resumeId = String(this.mainPlayer?.body?.id || "");
    this.sessionId = parkSessionId();
    this.inputTimer = null;
    this.matchReadySent = false;
  }
  init(roomId) {
    this.peer = parkJoinRoom(roomId, (channel) => {
      this.mainConn = channel;
      this.mainConn.e.onData = (data) => this.processData(data);
      this.mainConn.e.onConnection = () => {
        this.matchReadySent = false;
        this.mainConn.send(
          JSON.stringify({
            setUsername: {
              name: this.username,
              playerId: this.resumeId,
              sessionId: this.sessionId,
            },
          }),
        );
        if (
          (this.role === "team1" || this.role === "team2") &&
          !this.lastLobbyState?.matchStarted
        )
          this.mainConn.send(JSON.stringify({ requestRole: this.role }));
      };
      this.mainConn.e.onClose = () => {
        if (window.versusSession) versusSession.pause();
        this.game.matter.engine.timing.timeScale = 0;
        window.parkChat?.notice(
          this.sessionReplaced
            ? "This game session continued in another tab."
            : "Connection lost. Reconnecting...",
          true,
        );
      };
    });
    // Key events remain immediate, while this pump keeps held keys flowing at
    // a predictable cadence even when the browser does not emit repeats.
    clearInterval(this.inputTimer);
    this.inputTimer = setInterval(() => this.updateHost(), 50);
    window.addEventListener("pagehide", () => clearInterval(this.inputTimer), {
      once: true,
    });
  }
  processData(d, rd) {
    try {
      d = JSON.parse(d);
      if (!d || typeof d !== "object") return;
    } catch {
      return;
    }
    if (d.pong) this.recentPing = Math.round(performance.now() - d.pong);
    if (d.sessionReplaced) {
      this.sessionReplaced = true;
      if (window.showLobbyMessage)
        showLobbyMessage("This game session continued in another tab.", true);
      window.parkChat?.notice(
        "This game session continued in another tab.",
        true,
      );
      this.peer?.destroy();
      return;
    }
    if (d.chatMessage) window.parkChat?.receive(d.chatMessage);
    if (d.resetVote) window.parkResetVote?.receive(d.resetVote);
    if (d.presence) {
      const action =
        d.presence.type === "reconnected"
          ? "has reconnected"
          : "has disconnected";
      window.parkChat?.system(`${d.presence.username || "A player"} ${action}`);
    }
    if (d.matchPaused) {
      this.game.matter.engine.timing.timeScale = 0;
      if (window.versusSession) versusSession.pause();
    }
    if (d.matchResumed) {
      this.game.matter.engine.timing.timeScale = 1;
      if (window.versusSession)
        Object.values(versusSession.games).forEach(
          (game) => (game.matter.engine.timing.timeScale = 1),
        );
    }
    if (d.snapshotSequence) {
      if (d.snapshotSequence <= (this.lastSnapshot || 0)) return;
      this.lastSnapshot = d.snapshotSequence;
    }
    if (d.assignedPlayerId) {
      this.mainPlayer.body.id = d.assignedPlayerId;
      this.resumeId = String(d.assignedPlayerId);
      this.mainConn.send(JSON.stringify({ playerReady: d.assignedPlayerId }));
    }
    if ("campaign" in d) {
      try {
        window.parkCampaign = d.campaign
          ? ParkData.validate(d.campaign, true)
          : null;
        this.mainConn.send(
          JSON.stringify({ campaignReady: true, readyForSnapshots: true }),
        );
      } catch {
        return;
      }
    }
    if (d.matchInterrupted) {
      if (window.versusSession) versusSession.pause();
      this.game.matter.engine.timing.timeScale = 0;
      showLobbyMessage(
        "Match stopped: a player disconnected. Return to the lobby.",
        true,
      );
    }
    if (d.roomConfig) {
      this.mode = d.roomConfig.mode || "classic";
      this.maxTeamPlayers = d.roomConfig.maxTeamPlayers || 6;
      if (this.mode === "versus" && this.role === "player") {
        this.role = "observer";
        if (this.mainPlayer.setObserver) this.mainPlayer.setObserver(true);
      }
      if (this.mode === "classic") {
        this.role = "player";
        if (this.mainPlayer.setObserver) this.mainPlayer.setObserver(false);
      }
      if (window.setGameModeUI) setGameModeUI(this.mode);
    }
    if (d.lobbyState) {
      this.lastLobbyState = d.lobbyState;
      if (window.renderLobbyState) renderLobbyState(d.lobbyState);
      this.ensureMatchStarted();
    }
    if (d.campaignState) {
      this.lastLobbyState = d.campaignState;
      if (window.renderLobbyState) renderLobbyState(d.campaignState);
      this.ensureMatchStarted();
    }
    if (d.roleResult) {
      this.role = d.roleResult.role || this.role;
      this.mainPlayer.team = this.role;
      if (this.mainPlayer.setObserver)
        this.mainPlayer.setObserver(this.role === "observer");
      if (window.showLobbyMessage)
        showLobbyMessage(
          d.roleResult.message ||
            (d.roleResult.ok
              ? `Joined ${this.role}.`
              : "Role change rejected."),
          !d.roleResult.ok,
        );
      if (d.roleResult.reconnected) {
        this.game.matter.engine.timing.timeScale = 1;
        if (window.versusSession)
          Object.values(versusSession.games).forEach(
            (game) => (game.matter.engine.timing.timeScale = 1),
          );
      }
      this.ensureMatchStarted();
    }
    if (d.teamWorlds) {
      if (!window.versusSession) {
        if (!d.worldState) return;
        this.mode = "versus";
        this.lastLobbyState = d.worldState;
        if (this.role === "player") this.role = "observer";
        this.ensureMatchStarted();
      }
      if (!window.versusSession) return;
      versusSession.receive(d.teamWorlds, d.serverTime);
    }
    if (d.playerData) {
      if (!this.game.running) this.updateHostPlayers(d.playerData);
      else {
        if (
          d.levelName &&
          d.levelName !== this.game.levelHandler.currentLevel.name
        ) {
          if (this.pendingLevelName === d.levelName) return;
          try {
            this.game.levelHandler.setLevel(d.levelName);
            this.levelRevision = d.levelRevision || 0;
            this.game.networkPlayback?.clear();
          } catch {
            return;
          }
        }
        if (d.levelName !== this.game.levelHandler.currentLevel.name) return;
        if (d.levelRevision > (this.levelRevision || 0)) {
          this.levelRevision = d.levelRevision;
          this.game.networkPlayback?.clear();
        }
        if (d.levelRevision === this.levelRevision) {
          this.game.networkPlayback ||= new ParkPlayback(this.game);
          this.updateHostPlayers(d.playerData, false);
          this.game.networkPlayback.push(
            { players: d.playerData, sync: d.syncData },
            d.serverTime,
          );
        }
      }
    }
    if (d.setColor) this.mainPlayer.color = d.setColor;
    if (d.startGame) {
      this.matchStartRequested = true;
      this.ensureMatchStarted();
    }
    if (d.setLevel) {
      const target = d.setLevel;
      this.pendingLevelName = target;
      this.game.renderer.levelTransistion(target).finally(() => {
        if (this.pendingLevelName === target) this.pendingLevelName = null;
      });
    }
    if (
      d.restartLevel &&
      this.game.running &&
      this.game.levelHandler.currentLevel.name
    )
      this.game.levelHandler.setLevel(this.game.levelHandler.currentLevel.name);
    if (d.campaignAdvance && window.showLobbyMessage)
      showLobbyMessage(
        `${d.campaignAdvance.team === "team1" ? "Team 1" : "Team 2"} reached Level ${d.campaignAdvance.stage}.`,
      );
    if (d.matchWinner) {
      if (window.versusSession) versusSession.pause();
      const label = d.matchWinner === "team1" ? "TEAM 1" : "TEAM 2";
      if (window.showMatchWinner) showMatchWinner(label);
      else if (window.showLobbyMessage)
        showLobbyMessage(`${label} HAS WON THE GAME!`);
    }
  }
  requestRole(role) {
    if (this.mainConn && this.mainConn.fullyConnected)
      this.mainConn.send(JSON.stringify({ requestRole: role }));
  }
  ensureMatchStarted() {
    const started =
      this.matchStartRequested || this.lastLobbyState?.matchStarted;
    if (!started || !window.startGame) return false;
    try {
      startGame();
    } catch {
      return false;
    }
    const ready =
      this.mode === "versus" ? !!window.versusSession : !!this.game.running;
    if (ready && !this.matchReadySent && this.mainConn?.fullyConnected) {
      this.matchReadySent = true;
      this.mainConn.send(JSON.stringify({ matchReady: true }));
    }
    return ready;
  }
  sendChat(text) {
    if (this.mainConn?.fullyConnected)
      this.mainConn.send(JSON.stringify({ chat: { text } }));
  }
  requestResetVote(action, choice) {
    if (this.mainConn?.fullyConnected)
      this.mainConn.send(JSON.stringify({ resetVote: { action, choice } }));
  }
  updateKey() {
    this.updateHost();
  }
  updateHost() {
    if (!this.mainConn?.fullyConnected) return;
    const now = performance.now();
    if (now - (this.lastPing || 0) > 1000) {
      this.lastPing = now;
      this.mainConn.sendLatest(JSON.stringify({ ping: now }));
    }
    if (this.role === "observer") return;
    this.inputSequence = (this.inputSequence || 0) + 1;
    const controls = this.mainPlayer.controls;
    const inputKeys = Object.fromEntries(
      ["arrowleft", "arrowright", "arrowup", "arrowdown"].map((key, i) => [
        key,
        keys[controls[i]] === true,
      ]),
    );
    this.mainConn.sendLatest(
      JSON.stringify({
        input: {
          sequence: this.inputSequence,
          jumpSequence: this.jumpSequence || 0,
          keys: inputKeys,
        },
      }),
    );
  }
  updateHostPlayers(players, apply = true) {
    const findPlayerById = (id) =>
      this.game.players.find((player) => player.body.id == id);
    const incomingIds = new Set(players.map((p) => p.id));
    players.forEach((player) => {
      let foundPlayer = findPlayerById(player.id);
      if (foundPlayer == undefined) {
        foundPlayer = mainGame.playerhandler.addPlayer({
          bodyOptions: { id: player.id },
        });
        foundPlayer.onlinePlayer = true;
      }
      if (apply) this.setPlayer(foundPlayer, player);
    });
    this.game.players.forEach((p) => {
      if (p.onlinePlayer && !incomingIds.has(p.body.id)) p.unload();
    });
  }
  setPlayer(body, data) {
    setPlayerWithData(body, data);
  }
}
