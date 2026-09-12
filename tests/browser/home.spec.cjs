const { test, expect } = require("@playwright/test");
test("minimal menu retains create, join, editor and keyboard dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".home-options")).toBeVisible();
  await expect(page.locator(".home-options").locator("button, a")).toHaveCount(
    3,
  );
  await page.locator("#openCreate").click();
  await expect(page.locator("#createDialog")).toBeVisible();
  await page.locator("#createDialog .username-input").fill("Parker");
  await page.locator("#gameMode").selectOption("versus");
  await expect(page.locator("#hostModeHint")).toContainText("Two equal teams");
  await page.keyboard.press("Escape");
  await expect(page.locator("#createDialog")).not.toBeVisible();
  await page.locator("#openJoin").click();
  await expect(page.locator("#joinDialog .username-input")).toHaveValue(
    "Parker",
  );
  await page.locator("#codeInput").fill("abcd1234");
  await page.route("**/game.html?*", (route) =>
    route.fulfill({ body: "<title>Room</title>", contentType: "text/html" }),
  );
  await page.locator("#joinRoom").click();
  await expect(page).toHaveURL(/game.html\?join=ABCD1234/);
  expect(await page.evaluate(() => localStorage.getItem("username"))).toBe(
    "Parker",
  );
  await page.goto("/");
  await page.locator("#openCreate").click();
  await page.locator("#gameMode").selectOption("versus");
  await page.locator("#createRoom").click();
  await expect(page).toHaveURL(/game.html\?host=true&mode=versus/);
});
test("home menu fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(
    page.getByRole("link", { name: "LEVEL EDITOR" }),
  ).toBeInViewport();
  await page.getByRole("link", { name: "LEVEL EDITOR" }).click();
  await expect(page.locator("#editorCanvas")).toBeVisible();
});
