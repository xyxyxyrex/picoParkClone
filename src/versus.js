/* A room coordinates the race; each team owns a separate physics world. */
class VersusSession {
  constructor() {
    this.games = {};
    this.role = window.hostConnection
      ? hostConnection.hostRole
      : clientConnection.role;
    this.counts = window.hostConnection
      ? hostConnection.getCounts()
      : clientConnection.lastLobbyState.counts;
    const root = document.createElement("div");
    root.id = "teamWorlds";
    root.className = this.role === "observer" ? "observing" : "playing";
    document.body.append(root);
    document.getElementById("c").style.display = "none";
    document.getElementById("menu").style.display = "none";
    // Versus retries are team decisions handled by the reset-vote control.
    document.getElementById("restartWrap").style.display = "none";
    mainGame.running = true;
    const roster = mainGame.players.slice();
    for (const team of ["team1", "team2"]) {
      if (
        window.clientConnection &&
        this.role !== "observer" &&
        this.role !== team
      )
        continue;
      const pane = document.createElement("section");
      pane.className = "team-world";
      pane.dataset.team = team;
      const label = document.createElement("div");
      label.className = "team-world-label";
      label.setAttribute("aria-live", "polite");
      const canvas = document.createElement("canvas");
      canvas.setAttribute(
        "aria-label",
        `${team === "team1" ? "Team 1" : "Team 2"} game`,
      );
      pane.append(canvas, label);
      root.append(pane);
      if (this.role !== "observer" && this.role !== team) pane.hidden = true;
      const game = new Game({
        canvas,
        team,
        stage: 1,
        playerCount: this.counts[team],
      });
      game.worldLabel = label;
      game.revision = 0;
      this.games[team] = game;
      if (window.hostConnection) {
        roster
          .filter((p) => !p.observer && p.team === team)
          .forEach((old) => {
            const player = game.playerhandler.addPlayer({
              bodyOptions: { id: old.body.id },
              color: old.color,
              keys: old.keys,
              controls: old.controls,
            });
            Object.assign(player, {
              team,
              username: old.username,
              isHostPlayer: old.isHostPlayer,
              onlinePlayer: old.onlinePlayer,
              campaignStage: 1,
              conn: old.conn,
            });
            if (old.conn) {
              old.conn.player = player;
              old.conn.clientBody = player;
            }
            mainGame.players[mainGame.players.indexOf(old)] = player;
          });
        game.testInit();
        this.label(game);
        game.revision = 1;
      }
      if (!pane.hidden && window.hostConnection) {
        game.renderer.fadeValue = 0;
        game.renderer.init();
      }
    }
    window.addEventListener("pagehide", () => this.pause());
  }
  label(game) {
    /* Runs on every snapshot, so only touch the DOM when the text changes. */
    const bearer = shieldBearerOf(game.players);
    const hint = bearer
      ? `${bearer.username || "A teammate"} carries the shield - stay behind them`
      : "Every teammate must enter the unlocked exit";
    const text = `TEAM ${game.options.team === "team1" ? 1 : 2}  /  LEVEL ${game.options.stage} OF 5  |  ${hint}`;
    if (game.worldLabel.textContent !== text)
      game.worldLabel.textContent = text;
  }
  load(team, stage) {
    const game = this.games[team];
    if (!game) return;
    game.options.stage = stage;
    game.revision++;
    game.players.forEach((p) => {
      p.campaignStage = stage;
      p.constraintVel = v();
      p.setScale(1);
      p.ready = false;
      p.dead = false;
    });
    game.levelHandler.setLevel("level" + stage);
    this.label(game);
  }
  restart() {
    if (!window.hostConnection) return;
    for (const team of Object.keys(this.games)) {
      if (this.role === "observer" || this.role === team)
        this.load(team, hostConnection.progress[team]);
    }
  }
  snapshot() {
    return Object.fromEntries(
      Object.entries(this.games).map(([team, g]) => [
        team,
        {
          stage: g.options.stage,
          revision: g.revision,
          players: g.players.filter((p) => !p.unloading).map(parsePlayerData),
          sync: g.syncHandler.getSyncData(),
        },
      ]),
    );
  }
  receive(worlds, serverTime) {
    for (const [team, data] of Object.entries(worlds)) {
      const game = this.games[team];
      if (!game || data.revision < game.revision) continue;
      // Create the roster before loading so ropes and player-count mechanics match the host.
      for (const info of data.players) {
        let player = game.players.find((p) => p.body.id === info.id);
        if (!player) {
          player = game.playerhandler.addPlayer({
            bodyOptions: { id: info.id },
            color: info.color,
          });
          player.team = team;
          player.onlinePlayer = true;
          if (info.id === clientConnection.mainPlayer.body.id) {
            player.onlinePlayer = false;
            clientConnection.mainPlayer = player;
            mainGame.players = [player];
          }
        }
        if (Number.isInteger(info.tetherIndex))
          player.tetherIndex = info.tetherIndex;
      }
      if (!game.running) {
        game.options.stage = data.stage;
        game.testInit();
        game.renderer.fadeValue = 0;
        game.renderer.init();
      } else if (data.revision !== game.revision) this.load(team, data.stage);
      game.revision = data.revision;
      this.label(game);
      game.networkPlayback ||= new ParkPlayback(game);
      game.networkPlayback.push(
        { players: data.players, sync: data.sync },
        serverTime,
      );
    }
  }
  pause() {
    Object.values(this.games).forEach((g) => {
      g.matter.engine.timing.timeScale = 0;
    });
  }
}
