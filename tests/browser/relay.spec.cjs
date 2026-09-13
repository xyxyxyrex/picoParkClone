const { test, expect } = require("@playwright/test");

/*
 * The relay path is what an office network actually gets: one WebSocket per
 * participant to a server on a normal port, no ICE, no NAT traversal. These
 * exercise it against the real server from server/index.js.
 */
const RELAY_ORIGIN = process.env.PARK_RELAY_ORIGIN || "http://localhost:8789";

async function namedContext(browser, name) {
  const context = await browser.newContext();
  await context.addInitScript(
    (value) => localStorage.setItem("username", value),
    name,
  );
  return context;
}

test("a full 2v2 versus match runs over the WebSocket relay", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      namedContext(browser, `Relay Player ${index + 1}`),
    ),
  );
  const [host, teammate, opponentA, opponentB] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const errors = [];
  for (const page of [host, teammate, opponentA, opponentB])
    page.on("pageerror", (e) => errors.push(e.message));

  try {
    await host.goto(RELAY_ORIGIN + "/game?host=true&mode=versus");
    await host.waitForFunction(
      () => window.hostConnection?.roomJoinOnline,
      {},
      {
        timeout: 30000,
      },
    );
    /* The relay, not the browser, issues the code guests will be told aloud. */
    const code = (await host.locator("#roomCode").textContent()).trim();
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    expect(
      await host.evaluate(() => window.clientConnection === undefined),
    ).toBe(true);
    expect(
      await host.evaluate(() => hostConnection.peer instanceof ParkWsPeer),
    ).toBe(true);

    await host.locator('#host [data-role="team1"]').click();
    /* Balancing only accepts the smaller-or-equal team, so the order matters. */
    for (const [page, role] of [
      [opponentA, "team2"],
      [teammate, "team1"],
      [opponentB, "team2"],
    ]) {
      await page.goto(`${RELAY_ORIGIN}/game?join=${code}`);
      await page.waitForFunction(
        () => window.clientConnection?.mainConn?.fullyConnected,
        {},
        { timeout: 30000 },
      );
      await page.locator(`#join [data-role="${role}"]`).click();
      await page.waitForFunction(
        (want) => clientConnection.role === want,
        role,
        { timeout: 15000 },
      );
    }

    await host.waitForFunction(
      () => {
        const counts = hostConnection.getCounts();
        return counts.team1 === 2 && counts.team2 === 2;
      },
      {},
      { timeout: 20000 },
    );
    await host.waitForFunction(
      () =>
        hostConnection.connections.filter((c) => c.role !== "observer")
          .length === 3 &&
        hostConnection.connections
          .filter((c) => c.role !== "observer")
          .every((c) => c.player),
      {},
      { timeout: 25000 },
    );

    await host.locator("#startGameButton").click();
    await host.waitForFunction(
      () => !!window.versusSession,
      {},
      {
        timeout: 20000,
      },
    );

    /* Snapshots must reach a guest and drive its interpolation buffer. */
    for (const page of [teammate, opponentA])
      await page.waitForFunction(
        () =>
          Object.values(window.versusSession?.games || {}).some(
            (g) => g.networkPlayback?.frames.length > 1,
          ),
        {},
        { timeout: 30000 },
      );

    /* Guest input must reach the host and move that guest's own body. */
    const before = await host.evaluate(() => {
      const conn = hostConnection.connections.find((c) => c.role === "team2");
      return { id: conn.player.body.id, x: conn.player.body.position.x };
    });
    await opponentA.bringToFront();
    await opponentA.keyboard.down("ArrowRight");
    await host.waitForFunction(
      (b) => {
        const p = versusSession.games.team2.players.find(
          (p) => p.body.id === b.id,
        );
        return p && p.body.position.x > b.x + 20;
      },
      before,
      { timeout: 15000 },
    );
    await opponentA.keyboard.up("ArrowRight");

    /* The exit waits for the whole team, then advances once the last player enters. */
    await host.evaluate(() => {
      const game = versusSession.games.team1;
      const door = game.doors.find((candidate) => candidate.checkpoint);
      door.setOpen(true);
      const first = hostConnection.getTeamPlayers("team1")[0];
      Matter.Body.setPosition(first.body, { ...door.trigger.rect.position });
      Matter.Body.setVelocity(first.body, { x: 0, y: 0 });
    });
    await host.waitForFunction(() =>
      hostConnection.getTeamPlayers("team1").some((player) => player.ready),
    );
    await host.waitForTimeout(350);
    expect(await host.evaluate(() => hostConnection.progress.team1)).toBe(1);
    await host.evaluate(() => {
      const game = versusSession.games.team1;
      const door = game.doors.find((candidate) => candidate.checkpoint);
      hostConnection
        .getTeamPlayers("team1")
        .filter((player) => !player.ready)
        .forEach((player) => {
          Matter.Body.setPosition(player.body, {
            ...door.trigger.rect.position,
          });
          Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
        });
    });
    await host.waitForFunction(() => hostConnection.progress.team1 === 2);

    expect(
      await host.evaluate(() => clientConnection?.recentPing ?? null),
    ).toBe(null);
    expect(
      await opponentA.waitForFunction(
        () => clientConnection.recentPing > 0,
        {},
        { timeout: 10000 },
      ),
    ).toBeTruthy();
  } finally {
    expect(errors, errors.join("\n")).toEqual([]);
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("a wrong room code reports itself instead of hanging", async ({
  browser,
}) => {
  const ctx = await namedContext(browser, "Wrong Room Player");
  const page = await ctx.newPage();
  await page.goto(RELAY_ORIGIN + "/game?join=ZZZZ");
  await expect(page.locator("#join #lobbyMessage")).toContainText(
    "Room not found",
    { timeout: 15000 },
  );
  await ctx.close();
});

test("guests are told when the host leaves rather than freezing silently", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const hostContext = await namedContext(browser, "Host");
  const guestContext = await namedContext(browser, "Guest");
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto(RELAY_ORIGIN + "/game?host=true&mode=versus");
  await host.waitForFunction(
    () => window.hostConnection?.roomJoinOnline,
    {},
    {
      timeout: 30000,
    },
  );
  const code = (await host.locator("#roomCode").textContent()).trim();
  await guest.goto(`${RELAY_ORIGIN}/game?join=${code}`);
  await guest.waitForFunction(
    () => window.clientConnection?.mainConn?.fullyConnected,
    {},
    { timeout: 30000 },
  );
  await host.close();
  await expect(guest.locator("#join #lobbyMessage")).toContainText(
    "Disconnected from host",
    { timeout: 20000 },
  );
  await Promise.all([hostContext.close(), guestContext.close()]);
});

test("the Hold The Line gate latches open instead of needing a player parked on it", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const hostContext = await namedContext(browser, "Host");
  const guestContext = await namedContext(browser, "Guest");
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  for (const page of [host, guest])
    page.on("pageerror", (e) => errors.push(e.message));

  try {
    await host.goto(RELAY_ORIGIN + "/game?host=true&mode=versus");
    await host.waitForFunction(
      () => window.hostConnection?.roomJoinOnline,
      {},
      {
        timeout: 30000,
      },
    );
    const code = (await host.locator("#roomCode").textContent()).trim();
    await host.locator('#host [data-role="team1"]').click();
    await guest.goto(`${RELAY_ORIGIN}/game?join=${code}`);
    await guest.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
      {},
      { timeout: 30000 },
    );
    await guest.locator('#join [data-role="team2"]').click();
    await host.waitForFunction(
      () =>
        hostConnection.connections.some((c) => c.role === "team2" && c.player),
      {},
      { timeout: 25000 },
    );
    await host.locator("#startGameButton").click();
    await host.waitForFunction(
      () => !!window.versusSession,
      {},
      { timeout: 20000 },
    );

    /*
     * beginMatch() lands on a timer after startGame and resets every team to
     * stage 1, so wait for it before jumping ahead or it clobbers the jump.
     */
    await host.waitForFunction(
      () =>
        hostConnection.matchStarted &&
        versusSession.games.team1.levelHandler.currentLevel.name === "level1",
      {},
      { timeout: 20000 },
    );
    /* Jump straight to the switch stage rather than playing three rounds first. */
    await host.evaluate(() => versusSession.load("team1", 4));
    await host.waitForFunction(
      () => versusSession.games.team1.doors.some((d) => d.gate),
      {},
      { timeout: 15000 },
    );

    const layout = await host.evaluate(() => {
      const game = versusSession.games.team1;
      return {
        gateOpen: game.doors.find((d) => d.gate).open,
        switches: game.buttons.length,
        players: game.players.filter((p) => !p.observer).length,
      };
    });
    expect(layout.gateOpen).toBe(false);
    expect(layout.switches).toBe(layout.players);

    /* Stand every player on a switch at the same moment. */
    await host.evaluate(() => {
      const game = versusSession.games.team1;
      const active = game.players.filter((p) => !p.observer);
      game.buttons.forEach((button, i) => {
        const player = active[i % active.length];
        Matter.Body.setPosition(player.body, {
          x: button.pos.x * 50,
          y: button.pos.y * 50,
        });
        Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
      });
    });
    await host.waitForFunction(
      () => versusSession.games.team1.doors.find((d) => d.gate).open === true,
      {},
      { timeout: 15000 },
    );

    /* Walk everyone off the plates: the gate must not close behind them. */
    await host.evaluate(() => {
      const game = versusSession.games.team1;
      game.players
        .filter((p) => !p.observer)
        .forEach((p, i) =>
          Matter.Body.setPosition(p.body, { x: 100 + i * 60, y: 100 }),
        );
    });
    await host.waitForTimeout(1500);
    const after = await host.evaluate(() => {
      const gate = versusSession.games.team1.doors.find((d) => d.gate);
      return {
        open: gate.open,
        latch: gate.latch,
        pressed: gate._pressedSwitches.size,
      };
    });
    expect(after.latch).toBe(true);
    expect(after.pressed).toBe(0);
    expect(after.open).toBe(true);
  } finally {
    expect(errors, errors.join("\n")).toEqual([]);
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
