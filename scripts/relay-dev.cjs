"use strict";
const path = require("node:path");

const port = Number(process.env.PORT || 8787);
const staticDir = path.resolve(
  process.env.STATIC_DIR || path.join(__dirname, "../dist"),
);
process.env.STATIC_DIR = staticDir;
const { createServer } = require("../server/index.js");
const { httpServer } = createServer();
httpServer.listen(port, () =>
  console.log(`Tiny Park relay listening on :${port}`),
);
const stop = () => httpServer.close(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
