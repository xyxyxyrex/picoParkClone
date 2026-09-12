/* The editor uses the same Game, Matter physics, triggers and renderer as play. */
(() => {
  let current = 0,
    complete = false,
    initialized = false;
  const send = (data) => parent.postMessage(data, location.origin);
  function select(index) {
    current = index;
    mainGame.players.forEach((p) => p.updateKeys({}));
    send({ type: "park:player", player: current + 1 });
    document
      .querySelectorAll("#controls button")
      .forEach(
        (b, i) => (b.style.background = i === current ? "#f7eee7" : "#faf9f6"),
      );
  }
  addEventListener("message", async (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== parent ||
      e.data?.type !== "park:test" ||
      initialized
    )
      return;
    const data = e.data;
    ParkData.validateLevel(data.level);
    if (!Number.isInteger(data.players) || data.players < 1 || data.players > 6)
      return;
    initialized = true;
    await Promise.all(
      [mainAtlas, levelAtlas, laserAtlas].map((i) => i.decode()),
    );
    window.mainGame = new Game();
    mainGame.runTemp = true;
    levels.tempLevel = ParkData.runtime(data.level);
    for (let i = 0; i < data.players; i++) {
      mainGame.playerhandler.addPlayer({
        color: ["red", "orange", "yellow", "pink", "green", "purple"][i],
      });
      const button = document.createElement("button");
      button.textContent = `Player ${i + 1}`;
      button.onclick = () => select(i);
      document.getElementById("controls").append(button);
    }
    mainGame.renderer.levelTransistion = () => {
      if (complete) return;
      complete = true;
      mainGame.matter.engine.timing.timeScale = 0;
      send({ type: "park:complete" });
    };
    mainGame.testInit();
    mainGame.renderer.fadeValue = 0;
    mainGame.renderer.init();
    select(0);
    Matter.Events.on(mainGame.matter.engine, "beforeUpdate", () =>
      mainGame.players.forEach((p, i) =>
        p.updateKeys(i === current ? keys : {}),
      ),
    );
  });
  addEventListener("keydown", (e) => {
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Tab"].includes(
        e.key,
      )
    )
      e.preventDefault();
    if (e.key === "Escape") return send({ type: "park:stop" });
    if (!window.mainGame) return;
    if (e.key === "Tab") return select((current + 1) % mainGame.players.length);
    keys[e.key.toLowerCase()] = true;
  });
  addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
  addEventListener("blur", () => {
    keys = {};
  });
  send({ type: "park:ready" });
})();
