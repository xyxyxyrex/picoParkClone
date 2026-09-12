const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(__dirname, "../dist");
fs.mkdirSync(out, { recursive: true });
for (const name of [
  "index.html",
  "game.html",
  "lvl.html",
  "test.html",
  "ui.css",
  "src",
  "assets",
  "libs",
  "_headers",
  "_routes.json",
]) {
  fs.cpSync(path.resolve(__dirname, "..", name), path.join(out, name), {
    recursive: true,
  });
}
console.log("Built static assets in dist/");
