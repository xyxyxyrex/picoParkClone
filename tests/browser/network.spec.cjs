const { test, expect } = require("@playwright/test");
test("delayed, dropped, reordered movement does not rewind; stale input cannot stick", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    () =>
      (window.PARK_PEER_OPTIONS = {
        host: "localhost",
        port: 9000,
        path: "/park",
        secure: false,
      }),
  );
  const host = await ctx.newPage(),
    client = await ctx.newPage(),
    errors = [];
  for (const p of [host, client])
    p.on("pageerror", (e) => errors.push(e.message));
  try {
    await host.goto(baseURL + "/game?host=true&mode=versus");
    await host.waitForFunction(() => window.hostConnection?.roomJoinOnline);
    await host.locator('#host [data-role="team1"]').click();
    const code = await host.locator("#roomCode").textContent();
    await client.goto(baseURL + "/game?join=" + code);
    await client.waitForFunction(
      () => window.clientConnection?.mainConn?.motion?.readyState === "open",
    );
    await client.locator('#join [data-role="team2"]').click();
    await host.waitForFunction(() => hostConnection.connections[0]?.player);
    await host.locator("#startGameButton").click();
    await client.waitForFunction(
      () =>
        window.versusSession?.games.team2?.networkPlayback?.frames.length > 1,
    );
    await host.evaluate(() => {
      // Simulate a suspended render loop: host physics/network must use its Worker clock.
      window.requestAnimationFrame = () => 0;
      const c = hostConnection.connections[0],
        send = c.sendLatest.bind(c);
      c.sendLatest = (data) => {
        const d = JSON.parse(data);
        if (d.snapshotSequence) {
          if (window.dropSnapshots || d.snapshotSequence % 5 === 0)
            return false;
          setTimeout(() => send(data), d.snapshotSequence % 3 === 0 ? 180 : 70);
          return true;
        }
        return send(data);
      };
    });
    await client.evaluate(() => {
      const c = clientConnection.mainConn,
        send = c.sendLatest.bind(c);
      c.sendLatest = (data) => {
        const d = JSON.parse(data);
        if (d.input) {
          if (d.input.sequence % 7 === 0) return false;
          setTimeout(() => send(data), d.input.sequence % 3 === 0 ? 140 : 60);
          return true;
        }
        return send(data);
      };
      window.samples = [];
      window.initialX = clientConnection.mainPlayer.body.position.x;
      document.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") window.pressAt = performance.now();
      });
      window.sampleTimer = setInterval(() => {
        const x = clientConnection.mainPlayer.body.position.x;
        samples.push(x);
        if (window.pressAt && !window.firstMoveAt && x > initialX + 1)
          window.firstMoveAt = performance.now();
      }, 16);
    });
    const start = await client.evaluate(
      () => clientConnection.mainPlayer.body.position.x,
    );
    await client.keyboard.down("ArrowRight");
    // Snapshot keys must not become the source of outgoing controls.
    await client.evaluate(() => (clientConnection.mainPlayer.keys = {}));
    await client.waitForTimeout(1100);
    await client.keyboard.up("ArrowRight");
    await client.waitForTimeout(500);
    const stats = await client.evaluate(() => {
      clearInterval(sampleTimer);
      return {
        x: clientConnection.mainPlayer.body.position.x,
        responseMs: window.firstMoveAt - window.pressAt,
        backwards: Math.min(...samples.slice(1).map((x, i) => x - samples[i])),
        motionOrdered: clientConnection.mainConn.motion.ordered,
        maxRetransmits: clientConnection.mainConn.motion.maxRetransmits,
        runner: !!versusSession.games.team2.matter.runner,
      };
    });
    console.log(
      "Impaired-network input-to-display response (ms):",
      Math.round(stats.responseMs),
    );
    expect(stats.x - start).toBeGreaterThan(70);
    expect(stats.backwards).toBeGreaterThan(-0.5);
    expect(stats.motionOrdered).toBe(false);
    expect(stats.maxRetransmits).toBe(0);
    expect(stats.runner).toBe(false);
    await host.waitForFunction(
      () => hostConnection.connections[0].player.keys.arrowright === false,
    );
    await host.evaluate(() => (window.dropSnapshots = true));
    await client.waitForTimeout(800);
    const frozen = await client.evaluate(
      () => clientConnection.mainPlayer.body.position.x,
    );
    await client.waitForTimeout(200);
    expect(
      await client.evaluate(() => clientConnection.mainPlayer.body.position.x),
    ).toBeCloseTo(frozen, 4);
    await expect(client.locator(".team-world-label")).toHaveAttribute(
      "data-network",
      "Waiting for host connection...",
    );
    await host.evaluate(() => (window.dropSnapshots = false));
    await expect(client.locator(".team-world-label")).toHaveAttribute(
      "data-network",
      "",
    );
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("movement uses simulated time even when physics ticks run back-to-back", async ({
  page,
}) => {
  await page.goto("/test");
  const moved = await page.evaluate(() => {
    const g = new Game(),
      p = g.playerhandler.addPlayer({});
    g.renderer.levelBounds = { pos: v(), size: v(2000, 2000) };
    Matter.Body.setPosition(p.body, v(100, 100));
    p.keys.arrowright = true;
    g.initPhysics();
    Matter.Runner.stop(g.matter.runner);
    const start = p.body.position.x;
    for (let i = 0; i < 60; i++)
      Matter.Engine.update(g.matter.engine, 1000 / 60);
    return p.body.position.x - start;
  });
  expect(moved).toBeCloseTo(165, 1);
});

test("classic clients keep one level instance across repeated start announcements", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    () =>
      (window.PARK_PEER_OPTIONS = {
        host: "localhost",
        port: 9000,
        path: "/park",
        secure: false,
      }),
  );
  const host = await ctx.newPage(),
    client = await ctx.newPage(),
    errors = [];
  for (const p of [host, client])
    p.on("pageerror", (e) => errors.push(e.message));
  try {
    await host.goto(baseURL + "/game?host=true&mode=classic");
    await host.waitForFunction(() => window.hostConnection?.roomJoinOnline);
    await client.goto(
      baseURL + "/game?join=" + (await host.locator("#roomCode").textContent()),
    );
    await host.waitForFunction(() => hostConnection.connections[0]?.player);
    await host.locator("#startGameButton").click();
    await client.waitForFunction(
      () => window.mainGame?.networkPlayback?.frames.length > 1,
    );
    const revision = await client.evaluate(
      () => mainGame.levelHandler.revision,
    );
    await client.waitForTimeout(3200);
    expect(await client.evaluate(() => mainGame.levelHandler.revision)).toBe(
      revision,
    );
    expect(await client.evaluate(() => !!mainGame.matter.runner)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
