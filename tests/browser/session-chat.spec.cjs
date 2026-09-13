const { test, expect } = require("@playwright/test");

const RELAY_ORIGIN = process.env.PARK_RELAY_ORIGIN || "http://localhost:8789";

test("a direct invite asks for a name before connecting", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await hostContext.addInitScript(() =>
    localStorage.setItem("username", "Host"),
  );
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await host.goto(`${RELAY_ORIGIN}/game?host=true`);
    await host.waitForFunction(() => window.hostConnection?.roomJoinOnline);
    const code = (await host.locator("#roomCode").textContent()).trim();

    await guest.goto(`${RELAY_ORIGIN}/game?join=${code}`);
    await expect(guest.locator("#directJoinNameDialog")).toBeVisible();
    expect(await guest.evaluate(() => window.clientConnection)).toBeUndefined();
    await guest.locator("#directJoinName").fill("Jordan");
    await guest.locator("#directJoinNameForm button[type=submit]").click();
    await guest.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
    );
    await host.waitForFunction(
      () =>
        hostConnection.connections.length === 1 &&
        hostConnection.connections[0].clientUsername === "Jordan",
    );
    expect(await guest.evaluate(() => localStorage.getItem("username"))).toBe(
      "Jordan",
    );
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test("one cookie owns one player across tabs and reconnects with chat intact", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("username", "Avery"));
  const host = await context.newPage();
  const firstTab = await context.newPage();

  try {
    await host.goto(`${RELAY_ORIGIN}/game?host=true`);
    await host.waitForFunction(() => window.hostConnection?.roomJoinOnline);
    const code = (await host.locator("#roomCode").textContent()).trim();

    await firstTab.goto(`${RELAY_ORIGIN}/game?join=${code}`);
    await firstTab.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
    );
    await host.waitForFunction(
      () =>
        hostConnection.connections.length === 1 &&
        hostConnection.connections[0].player,
    );
    const originalPlayerId = await host.evaluate(
      () => hostConnection.connections[0].player.body.id,
    );
    expect(await firstTab.evaluate(() => document.cookie)).toContain(
      "tiny_park_session=",
    );

    const secondTab = await context.newPage();
    await secondTab.goto(`${RELAY_ORIGIN}/game?join=${code}`);
    await secondTab.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
    );
    await host.waitForFunction(
      (id) =>
        hostConnection.connections.length === 1 &&
        hostConnection.connections[0].player?.body.id === id,
      originalPlayerId,
    );
    await expect(firstTab.locator("#lobbyMessage").first()).toContainText(
      "continued in another tab",
    );

    await host.locator("#startGameButton").click();
    await secondTab.waitForFunction(() => window.mainGame?.running);
    await expect(secondTab.locator("#gameChat")).toBeVisible();

    await secondTab.keyboard.press("Enter");
    await secondTab.locator("#chatInput").fill("hello from chat");
    await secondTab.keyboard.press("Enter");
    await expect(host.locator("#chatMessages")).toContainText(
      "Avery: hello from chat",
    );
    await expect(secondTab.locator("#pingHud")).toContainText(/PING \d+ MS/);

    await secondTab.evaluate(() =>
      clientConnection.peer.socket.close(4000, "reconnect-test"),
    );
    await expect(host.locator("#chatMessages")).toContainText(
      "Avery has disconnected",
    );
    await host.waitForFunction(
      () => mainGame.matter.engine.timing.timeScale === 0,
    );
    await secondTab.waitForFunction(
      () => window.clientConnection?.mainConn?.fullyConnected,
      {},
      { timeout: 20000 },
    );
    await host.waitForFunction(
      (id) =>
        hostConnection.reconnectReservations.size === 0 &&
        hostConnection.connections.length === 1 &&
        hostConnection.connections[0].player?.body.id === id &&
        mainGame.matter.engine.timing.timeScale === 1,
      originalPlayerId,
      { timeout: 20000 },
    );
    await expect(host.locator("#chatMessages")).toContainText(
      "Avery has reconnected",
    );
    await secondTab.close();
  } finally {
    await context.close();
  }
});
