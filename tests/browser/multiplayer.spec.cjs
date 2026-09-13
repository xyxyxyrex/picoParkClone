const { test, expect } = require("@playwright/test");
test("real WebRTC room, equal teams, host authority and five-round winner", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext()),
  );
  const [host, client, teammate, opponent, observer] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const errors = [];
  await Promise.all(
    contexts.map((context, index) =>
      context.addInitScript(
        (name) => localStorage.setItem("username", name),
        `WebRTC Player ${index + 1}`,
      ),
    ),
  );
  if (!process.env.PARK_PUBLIC_SIGNALING)
    await Promise.all(
      contexts.map((context) =>
        context.addInitScript(
          () =>
            (window.PARK_PEER_OPTIONS = {
              host: "localhost",
              port: 9000,
              path: "/park",
              secure: false,
            }),
        ),
      ),
    );
  for (const p of [host, client, teammate, opponent, observer])
    p.on("pageerror", (e) => errors.push(e.message));
  try {
    await host.goto(baseURL + "/game?host=true&mode=versus");
    await host.waitForFunction(
      () => window.hostConnection?.roomJoinOnline,
      {},
      { timeout: 30000 },
    );
    await host.locator('#host [data-role="team1"]').click();
    await host.locator("#startGameButton").click();
    await expect(host.locator("#host #lobbyMessage")).toContainText("equal");
    const code = await host.locator("#roomCode").textContent();
    await client.goto(baseURL + "/game?join=" + code);
    await client.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
      {},
      { timeout: 30000 },
    );
    await client.locator('#join [data-role="team2"]').click();
    await host.waitForFunction(
      () =>
        hostConnection.getCounts().team2 === 1 &&
        hostConnection.connections.some((c) => c.player),
    );
    for (const [page, team] of [
      [teammate, "team1"],
      [opponent, "team2"],
    ]) {
      await page.goto(baseURL + "/game?join=" + code);
      await page.waitForFunction(
        () => window.clientConnection?.mainConn?.fullyConnected,
      );
      await page.locator('#join [data-role="' + team + '"]').click();
      await page.waitForFunction((t) => clientConnection.role === t, team);
    }
    await host.waitForFunction(
      () => hostConnection.connections.filter((c) => c.player).length === 3,
    );
    await host.locator("#startGameButton").click();
    await client.waitForFunction(
      () => window.versusSession?.games.team2?.running,
    );
    await host.waitForFunction(() => hostConnection.matchStarted);
    const hostId = await host.evaluate(
      () => mainGame.players.find((p) => p.isHostPlayer).body.id,
    );
    const guestId = await client.evaluate(
      () => clientConnection.mainPlayer.body.id,
    );
    expect(guestId).not.toBe(hostId);
    // A forged ID must never take control of the host player.
    await client.evaluate(
      (id) =>
        clientConnection.mainConn.send(
          JSON.stringify({ player: { id, keys: { arrowleft: true } } }),
        ),
      hostId,
    );
    expect(
      await host.evaluate(
        () => mainGame.players.find((p) => p.isHostPlayer).conn,
      ),
    ).toBeUndefined();
    expect(
      await client.evaluate(() => Object.keys(versusSession.games)),
    ).toEqual(["team2"]);
    expect(
      await host.evaluate(() => {
        const a = versusSession.games.team1,
          b = versusSession.games.team2;
        return (
          a.matter.engine !== b.matter.engine &&
          a.players.length === 2 &&
          b.players.length === 2 &&
          !Matter.Composite.allBodies(a.matter.engine.world).includes(
            b.players[0].body,
          )
        );
      }),
    ).toBe(true);
    const beforeResetVote = await host.evaluate(() => ({
      team1: versusSession.games.team1.revision,
      team2: versusSession.games.team2.revision,
    }));
    await expect(host.locator("#teamResetControl")).toBeVisible();
    await expect(teammate.locator("#teamResetControl")).toBeVisible();
    await host.locator("#startResetVote").click();
    await expect(host.locator("#resetVotePanel")).toBeVisible();
    await expect(teammate.locator("#resetVotePanel")).toBeVisible();
    await expect(opponent.locator("#resetVotePanel")).toBeHidden();
    const resetButtonBox = await host.locator("#startResetVote").boundingBox();
    const resetPanelBox = await host.locator("#resetVotePanel").boundingBox();
    expect(resetPanelBox.y).toBeGreaterThanOrEqual(
      resetButtonBox.y + resetButtonBox.height,
    );
    await host.locator("#resetVoteYes").click();
    await expect(host.locator("#resetVoteStatus")).toContainText("1 YES");
    await teammate.locator("#resetVoteYes").click();
    await expect(host.locator("#resetVoteQuestion")).toHaveText("LEVEL RESET");
    await host.waitForFunction(
      (revision) => versusSession.games.team1.revision > revision,
      beforeResetVote.team1,
    );
    expect(await host.evaluate(() => versusSession.games.team2.revision)).toBe(
      beforeResetVote.team2,
    );
    await expect(host.locator("#resetVotePanel")).toBeHidden();

    await client.locator("#startResetVote").click();
    await expect(client.locator("#resetVotePanel")).toBeVisible();
    await expect(opponent.locator("#resetVotePanel")).toBeVisible();
    await expect(teammate.locator("#resetVotePanel")).toBeHidden();
    await client.locator("#resetVoteNo").click();
    await opponent.locator("#resetVoteNo").click();
    await expect(client.locator("#resetVoteQuestion")).toHaveText("LEVEL KEPT");
    expect(await host.evaluate(() => versusSession.games.team2.revision)).toBe(
      beforeResetVote.team2,
    );
    // A locked exit must not advance; the key must actually unlock it first.
    await host.evaluate(() => {
      const g = versusSession.games.team1,
        d = g.doors.find((d) => d.checkpoint),
        p = g.players[0];
      Matter.Body.setPosition(p.body, { ...d.trigger.rect.position });
      Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
    });
    await host.waitForTimeout(350);
    expect(await host.evaluate(() => hostConnection.progress.team1)).toBe(1);
    for (let stage = 1; stage <= 5; stage++) {
      // Drive the actual checkpoint trigger; keep geometry-solving separate from networking assertions.
      await host.evaluate((stage) => {
        const d = versusSession.games.team1.doors.find(
          (d) =>
            d.checkpoint && d.team === "team1" && d.campaignStage === stage,
        );
        if (stage === 1) {
          const key = versusSession.games.team1.entities[0];
          key.pos = {
            x: d.trigger.rect.position.x,
            y: d.trigger.rect.position.y - 45,
          };
          key.vel = { x: 0, y: 0 };
        } else d.setOpen(true);
        for (const p of hostConnection.getTeamPlayers("team1").slice(0, 1)) {
          Matter.Body.setPosition(p.body, { ...d.trigger.rect.position });
          p.keys = {};
          Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
        }
      }, stage);
      await host.waitForTimeout(350);
      expect(await host.evaluate(() => hostConnection.progress.team1)).toBe(
        stage,
      );
      await host.evaluate(() => {
        const game = versusSession.games.team1;
        const door = game.doors.find(
          (candidate) =>
            candidate.checkpoint &&
            candidate.team === "team1" &&
            candidate.campaignStage === game.options.stage,
        );
        hostConnection
          .getTeamPlayers("team1")
          .filter((player) => !player.ready)
          .forEach((player) => {
            Matter.Body.setPosition(player.body, {
              ...door.trigger.rect.position,
            });
            player.keys = {};
            Matter.Body.setVelocity(player.body, { x: 0, y: 0 });
          });
      });
      if (stage < 5)
        await host.waitForFunction(
          (s) => hostConnection.progress.team1 === s + 1,
          stage,
          { timeout: 10000 },
        );
      if (stage === 1) {
        await observer.goto(baseURL + "/game?join=" + code);
        await observer.waitForFunction(
          () =>
            window.versusSession?.games.team1?.options.stage === 2 &&
            versusSession.games.team2?.running,
        );
        await expect(observer.locator(".team-world canvas")).toHaveCount(2);
        await expect(observer.locator("#teamWorlds")).toHaveCSS("gap", "4px");
        await observer.screenshot({ path: "observer-worlds.local.png" });
        await teammate.waitForFunction(
          () => window.versusSession?.games.team1?.options.stage === 2,
        );
      }
      expect(
        await host.evaluate(() => versusSession.games.team2.options.stage),
      ).toBe(1);
    }
    await expect(host.locator("#matchWinnerText")).toHaveText("TEAM 1 WINS!");
    await expect(client.locator("#matchWinnerText")).toHaveText("TEAM 1 WINS!");
    expect(await host.evaluate(() => hostConnection.progress.team2)).toBe(1);
    await expect(observer.locator("#matchWinnerText")).toHaveText(
      "TEAM 1 WINS!",
    );
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
