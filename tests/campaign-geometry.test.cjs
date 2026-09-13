const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
global.window = global;
vm.runInThisContext(fs.readFileSync("src/campaignTemplates.js", "utf8"));

/*
 * Geometry invariants. A template that validates can still be unplayable --
 * a switch floating in mid-air, a key buried in terrain, a gate you can walk
 * around -- and the only place that shows up otherwise is a room full of people
 * waiting. Tile (x,y) is a 50px box centred at x*50; a gate's collider covers
 * the two tiles above the floor at columns pos.x-1 and pos.x.
 */
const COUNTS = [1, 2, 3, 4, 5, 6];
const ROUNDS = [1, 2, 3, 4, 5];
const solid = (stage, x, y) =>
  y >= 0 && y < stage.height && x >= 0 && x < stage.width && !!stage.map[y][x];

const eachStage = (fn) => {
  for (const n of COUNTS)
    for (const r of ROUNDS) fn(CampaignTemplates.buildStage(r, n), n, r);
};

test("every switch sits on standable ground", () => {
  eachStage((stage, n, r) => {
    for (const b of stage.buttons) {
      const where = `L${r} ${n}P switch ${b.id} at ${b.pos.x},${b.pos.y}`;
      assert.ok(!solid(stage, b.pos.x, b.pos.y), `${where} is inside terrain`);
      assert.ok(
        solid(stage, b.pos.x, b.pos.y + 1),
        `${where} has no floor under it`,
      );
    }
  });
});

test("every key is reachable air, not buried in terrain", () => {
  eachStage((stage, n, r) => {
    for (const k of stage.keys)
      assert.ok(
        !solid(stage, k.pos.x, k.pos.y),
        `L${r} ${n}P key at ${k.pos.x},${k.pos.y} is inside terrain`,
      );
  });
});

test("every doorway is clear of terrain so the door can be entered", () => {
  eachStage((stage, n, r) => {
    for (const d of stage.doors) {
      if (d.gate) continue;
      for (const x of [d.pos.x - 1, d.pos.x])
        for (const y of [d.pos.y - 2, d.pos.y - 1])
          assert.ok(
            !solid(stage, x, y),
            `L${r} ${n}P exit at ${d.pos.x},${d.pos.y} is blocked at ${x},${y}`,
          );
    }
  });
});

test("a gate leaves no gap to climb over it", () => {
  eachStage((stage, n, r) => {
    for (const gate of stage.doors.filter((d) => d.gate)) {
      /*
       * Only the two columns the collider occupies matter. The column past them
       * is the corridor continuing on the far side, and must stay open -- what
       * would make the gate pointless is a gap *above* the collider, which a
       * team tall enough to stack could climb through instead of solving it.
       */
      for (const x of [gate.pos.x - 1, gate.pos.x])
        for (let y = 0; y <= gate.pos.y - 3; y++)
          assert.ok(
            solid(stage, x, y),
            `L${r} ${n}P gate can be climbed through at ${x},${y}`,
          );
    }
  });
});

test("latching gates keep their switches in front and their reward behind", () => {
  eachStage((stage, n, r) => {
    for (const gate of stage.doors.filter((d) => d.gate && d.latch)) {
      const wired = stage.buttons.filter((b) => b.gateId === gate.id);
      assert.equal(
        wired.length,
        n,
        `L${r} ${n}P should wire one switch per player`,
      );
      for (const b of wired)
        assert.ok(
          b.pos.x < gate.pos.x - 1,
          `L${r} ${n}P switch ${b.id} is past its own gate`,
        );
      assert.ok(
        wired.every((b) => b.mode === "all" && b.required === n),
        `L${r} ${n}P switches must all be required at once`,
      );
      for (const k of stage.keys)
        assert.ok(
          k.pos.x > gate.pos.x,
          `L${r} ${n}P key is reachable without opening the gate`,
        );
    }
  });
});

test("no stage asks for a stack taller than three players", () => {
  /* Column heights above the floor, ignoring the outer walls. */
  eachStage((stage, n, r) => {
    const ground = stage.height - 2;
    for (let x = 1; x < stage.width - 1; x++) {
      let height = 0;
      while (solid(stage, x, ground - 1 - height)) height++;
      assert.ok(
        height <= 3 ||
          stage.doors.some((d) => d.gate && Math.abs(d.pos.x - x) <= 1),
        `L${r} ${n}P column ${x} rises ${height} tiles above the floor`,
      );
    }
  });
});

test("everything stays inside the outer walls", () => {
  eachStage((stage, n, r) => {
    const all = [
      ...stage.buttons.map((b) => b.pos),
      ...stage.keys.map((k) => k.pos),
      ...stage.doors.map((d) => d.pos),
      ...stage.blocks.map((b) => b.pos),
      ...stage.lasers.map((l) => l.pos),
    ];
    for (const p of all) {
      assert.ok(
        p.x >= 1 && p.x <= stage.width - 2,
        `L${r} ${n}P object at x=${p.x} is outside 1..${stage.width - 2}`,
      );
      assert.ok(
        p.y >= 0 && p.y <= stage.height - 1,
        `L${r} ${n}P object at y=${p.y} is outside the level`,
      );
    }
  });
});
