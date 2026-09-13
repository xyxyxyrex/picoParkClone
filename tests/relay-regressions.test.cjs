const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("../server/index.js");
const { LIMITS } = require("../server/rooms.js");

test("malformed static URLs return 400 instead of killing the relay", async () => {
  const root = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "tiny-park-"),
  );
  const { httpServer, wss } = createServer({ staticDir: root });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = httpServer.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/%ZZ`);
  assert.equal(response.status, 400);
  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);
  await new Promise((done) => httpServer.close(() => wss.close(done)));
});

test("relay framing allows the maximum published campaign envelope", () => {
  assert.ok(LIMITS.maxMessageBytes > 2_000_000);
});
