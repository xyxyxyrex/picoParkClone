const { test, expect } = require("@playwright/test");
async function cell(page, x, y) {
  const b = await page.locator("#editorCanvas").boundingBox(),
    c = await page.evaluate(() => parkStudio.camera());
  return {
    x: b.x + c.x + (x + 0.5) * c.scale,
    y: b.y + c.y + (y + 0.5) * c.scale,
  };
}
async function clickCell(page, x, y) {
  const p = await cell(page, x, y);
  await page.mouse.click(p.x, p.y);
}
test("place, pan without painting, block popup, rotate, move, undo and persist variants", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/lvl");
  await expect(page.locator("#levelName")).toHaveValue("Stack School");
  await page.locator('[data-type="block"]').click();
  await page.locator("#objectW").fill("2");
  await page.locator("#objectW").press("Tab");
  await clickCell(page, 4, 5);
  const count = await page.evaluate(
    () => parkStudio.snapshot().variants[2][0].objects.length,
  );
  const before = await page.evaluate(() => parkStudio.camera());
  const p = await cell(page, 4, 4);
  await page.keyboard.down("Space");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 70, p.y + 30);
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect((await page.evaluate(() => parkStudio.camera())).x).toBeCloseTo(
    before.x + 70,
  );
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.length,
    ),
  ).toBe(count);
  await clickCell(page, 4, 5);
  await expect(page.locator("#objectMenu")).toBeVisible();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.at(-1).h,
    ),
  ).toBe(2);
  await clickCell(page, 4, 5);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await clickCell(page, 6, 4);
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.at(-1).x,
    ),
  ).toBe(6);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.at(-1).x,
    ),
  ).toBe(4);
  await page.locator("#teamSize").selectOption("6");
  await expect(page.locator("#levelW")).toHaveValue("34");
  await page.locator('[data-round="3"]').click();
  await expect(page.locator("#levelName")).toHaveValue("Hold The Line");
  await page.locator("#teamSize").selectOption("2");
  await page.locator('[data-round="0"]').click();
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.length,
    ),
  ).toBe(count);
  await page.reload();
  expect(
    await page.evaluate(
      () => parkStudio.snapshot().variants[2][0].objects.length,
    ),
  ).toBe(count);
  expect(errors).toEqual([]);
});
test("embedded play uses real physics, switches players, completes and restores draft", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/lvl");
  const draft = await page.evaluate(() => parkStudio.snapshot());
  await page.locator("#play").click();
  const frame = page.frameLocator("#testFrame");
  await expect(frame.getByRole("button", { name: "Player 2" })).toBeVisible();
  const f = page.frames().find((f) => /\/test$/.test(f.url()));
  await expect.poll(() => f.evaluate(() => mainGame.running)).toBe(true);
  const x = await f.evaluate(() => mainGame.players[0].body.position.x);
  await page.locator("#testFrame").focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(350);
  await page.keyboard.up("ArrowRight");
  expect(
    await f.evaluate(() => mainGame.players[0].body.position.x),
  ).toBeGreaterThan(x);
  await page.keyboard.press("Tab");
  await expect(page.locator("#testStatus")).toContainText("player 2");
  // Exercise the real exit trigger for all teammates, without solving the course in automation.
  await f.evaluate(() => {
    const d = mainGame.doors[0];
    d.setOpen(true);
    for (const p of mainGame.players) {
      p.body.isStatic = true;
      Matter.Body.setPosition(p.body, { ...d.trigger.rect.position });
      p.keys.arrowdown = true;
      d.onIn(p.body);
    }
  });
  await expect(page.locator("#testStatus")).toContainText("Round complete");
  await page.locator("#stopTest").click();
  await expect(page.locator("#testPanel")).toBeHidden();
  expect(await page.evaluate(() => parkStudio.snapshot())).toEqual(draft);
  expect(page.url()).toMatch(/\/lvl$/);
  expect(errors).toEqual([]);
});
test("mobile layout keeps the canvas and palette usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lvl");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.locator('[data-type="key"]').click();
  await expect(page.locator("#inspectorTitle")).toHaveText("Key");
});
test("Level Boundary is a resizable editor object and survives the JSON blueprint", async ({
  page,
}) => {
  await page.goto("/lvl");
  await expect(page.locator('[data-type="boundary"]')).toBeVisible();
  await page.locator('[data-type="boundary"]').click();
  await expect(page.locator("#inspectorTitle")).toHaveText("Level boundary");
  await expect(page.locator("#objectW")).toBeEnabled();
  await expect(page.locator("#objectH")).toBeEnabled();
  await page.locator("#objectW").fill("4");
  await page.locator("#objectW").press("Tab");
  await page.locator("#objectH").fill("2");
  await page.locator("#objectH").press("Tab");
  await clickCell(page, 3, 2);

  const state = await page.evaluate(() => {
    const level = parkStudio.snapshot().variants[2][0];
    const boundary = level.objects.find(
      (o) => o.type === "boundary" && o.x === 3 && o.y === 2,
    );
    const blueprint = ParkData.blueprint(level);
    return {
      boundary,
      runtimeBoundary: blueprint.boundaries.find(
        (b) => b.pos.x === 3 && b.pos.y === 2,
      ),
    };
  });

  expect(state.boundary).toMatchObject({ type: "boundary", w: 4, h: 2 });
  expect(state.runtimeBoundary).toEqual({
    pos: { x: 3, y: 2 },
    size: { x: 4, y: 2 },
  });
});
