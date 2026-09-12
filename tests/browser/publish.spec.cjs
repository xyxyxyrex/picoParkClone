const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
test("server authenticates, validates and atomically rejects stale publication", async ({
  request,
  page,
  baseURL,
}) => {
  test.skip(
    !baseURL.includes("localhost"),
    "Publishing tests only mutate the local database.",
  );
  const password = JSON.parse(
    fs.readFileSync("admin-secret.local"),
  ).ADMIN_PASSWORD;
  await page.goto("/lvl");
  const campaign = await page.evaluate(() => parkStudio.snapshot());
  const current = await (await request.get("/api/levels")).json();
  const put = (secret, revision, data = campaign) =>
    request.put("/api/levels", {
      headers: { Origin: baseURL, Authorization: `Bearer ${secret}` },
      data: { campaign: data, revision },
    });
  expect((await put("incorrect", current.revision)).status()).toBe(401);
  const invalid = JSON.parse(JSON.stringify(campaign));
  invalid.variants[1][0].objects = [];
  expect((await put(password, current.revision, invalid)).status()).toBe(400);
  const responses = await Promise.all([
    put(password, current.revision),
    put(password, current.revision),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const live = await (await request.get("/api/levels")).json();
  expect(live.campaign).toEqual(campaign);
  expect(live.revision).not.toBe(current.revision);
});
