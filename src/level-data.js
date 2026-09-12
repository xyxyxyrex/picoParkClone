/* Shared, data-only level format. No code is evaluated when importing levels. */
(function (root) {
  const TYPES = [
    "terrain",
    "block",
    "door",
    "key",
    "jumppad",
    "grow",
    "shrink",
    "laser",
    "spawn",
    "gate",
    "switch",
  ];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function template(round = 1, players = 1) {
    const width = 28 + players * 2,
      height = 16;
    const objects = [];
    const add = (type, x, y, w = 1, h = 1, extra = {}) =>
      objects.push({
        id: `o${objects.length}`,
        type,
        x,
        y,
        w,
        h,
        rotation: 0,
        ...extra,
      });
    add("terrain", 0, 14, width, 2);
    add("terrain", 0, 0, 1, 14);
    add("terrain", width - 1, 0, 1, 14);
    add("spawn", 2, 13);
    add("door", width - 4, 12, 2, 2);
    add("key", width - 8, 10);
    add("terrain", width - 10, 12, 4, 1);
    add("block", 7, 13, Math.min(players + 1, 4), 1);
    if (round >= 2) add("terrain", 13, 12, 3, 2);
    if (round >= 3) add("jumppad", 11, 13);
    if (round >= 4) {
      add("grow", 4, 13);
      add("shrink", width - 6, 13);
    }
    if (round >= 5) add("laser", 18, 8, 1, 1, { rotation: 1 });
    return {
      name: [
        "First steps",
        "A little teamwork",
        "Spring together",
        "Size matters",
        "The final stretch",
      ][round - 1],
      width,
      height,
      linked: false,
      shields: [],
      objects,
    };
  }
  function campaign() {
    return {
      version: 1,
      name: "Tiny Park · Team race",
      variants: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          i + 1,
          Array.from({ length: 5 }, (_, r) =>
            root.CampaignTemplates
              ? fromBlueprint(root.CampaignTemplates.buildStage(r + 1, i + 1))
              : template(r + 1, i + 1),
          ),
        ]),
      ),
    };
  }
  function validateLevel(level) {
    const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    if (
      !level ||
      typeof level.name !== "string" ||
      level.name.length > 80 ||
      !integer(level.width, 12, 100) ||
      !integer(level.height, 8, 60)
    )
      throw Error("Level dimensions must be 12–100 × 8–60.");
    if (
      typeof level.linked !== "boolean" ||
      !Array.isArray(level.shields) ||
      level.shields.length > 4 ||
      level.shields.some((n) => !integer(n, 1, 4))
    )
      throw Error("Invalid team rules.");
    if (!Array.isArray(level.objects) || level.objects.length > 2000)
      throw Error("A level can contain up to 2,000 objects.");
    const ids = new Set();
    for (const o of level.objects) {
      if (
        !o ||
        !TYPES.includes(o.type) ||
        typeof o.id !== "string" ||
        o.id.length > 80 ||
        ids.has(o.id)
      )
        throw Error("Invalid or duplicate object.");
      ids.add(o.id);
      if (o.pushers !== undefined && !integer(o.pushers, 0, 6))
        throw Error("Invalid block strength.");
      if (
        !integer(o.x, 0, level.width - 1) ||
        !integer(o.y, 0, level.height - 1) ||
        !integer(o.w, 1, level.width) ||
        !integer(o.h, 1, level.height) ||
        o.x + o.w > level.width ||
        o.y + o.h > level.height ||
        !integer(o.rotation, 0, 3)
      )
        throw Error("Keep all objects inside the level.");
      if (
        ["door", "gate"].includes(o.type)
          ? o.w !== 2 || o.h !== 2
          : !["terrain", "block"].includes(o.type) && (o.w !== 1 || o.h !== 1)
      )
        throw Error("Invalid object size.");
    }
    for (const o of level.objects)
      if (
        o.type === "switch" &&
        (typeof o.gateId !== "string" ||
          !level.objects.some((g) => g.type === "gate" && g.id === o.gateId) ||
          !["any", "all"].includes(o.mode))
      )
        throw Error("Every switch must be connected to a gate.");
    return level;
  }
  function validate(data, playable = false) {
    if (
      !data ||
      data.version !== 1 ||
      typeof data.name !== "string" ||
      data.name.length > 80 ||
      !data.variants ||
      Object.keys(data.variants).length !== 6
    )
      throw Error("Choose a Tiny Park campaign JSON file.");
    for (let p = 1; p <= 6; p++) {
      const rounds = data.variants[p];
      if (!Array.isArray(rounds) || rounds.length !== 5)
        throw Error("Each team size needs exactly five rounds.");
      rounds.forEach((level, r) => {
        validateLevel(level);
        if (playable) {
          const issues = warnings(level);
          if (issues.length)
            throw Error(`${p} per team · Round ${r + 1}: ${issues[0]}`);
        }
      });
    }
    return data;
  }
  function warnings(level) {
    const result = [];
    for (const type of ["spawn", "door"])
      if (level.objects.filter((o) => o.type === type).length !== 1)
        result.push(
          `Place exactly one ${type === "spawn" ? "team spawn" : "exit door"}.`,
        );
    for (const o of level.objects.filter((o) =>
      ["spawn", "door", "key"].includes(o.type),
    )) {
      if (
        level.objects.some(
          (t) =>
            t.type === "terrain" &&
            o.x < t.x + t.w &&
            o.x + o.w > t.x &&
            o.y < t.y + t.h &&
            o.y + o.h > t.y,
        )
      )
        result.push(`${o.type} overlaps terrain.`);
    }
    return result;
  }
  function fromBlueprint(stage) {
    const objects = [],
      add = (type, x, y, w = 1, h = 1, extra = {}) =>
        objects.push({
          id: `o${objects.length}`,
          type,
          x,
          y,
          w,
          h,
          rotation: 0,
          ...extra,
        });
    for (let y = 0; y < stage.height; y++)
      for (let x = 0; x < stage.width;) {
        if (!stage.map[y][x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < stage.width && stage.map[y][x]) x++;
        add("terrain", start, y, x - start);
      }
    add("spawn", stage.spawn.x, stage.spawn.y);
    for (const d of stage.doors)
      add(d.gate ? "gate" : "door", d.pos.x - 1, d.pos.y - 2, 2, 2, {
        id: d.id || `o${objects.length}`,
      });
    for (const k of stage.keys) add("key", k.pos.x, k.pos.y);
    for (const b of stage.blocks)
      add("block", b.pos.x, b.pos.y, b.size.x, b.size.y, {
        pushers: b.minPlayers || 0,
      });
    for (const l of stage.lasers)
      add("laser", l.pos.x, l.pos.y, 1, 1, { rotation: l.angle % 4 });
    for (const j of stage.jumppads) add("jumppad", j.x, j.y - 2);
    for (const b of stage.buttons)
      add("switch", b.pos.x, b.pos.y, 1, 1, {
        gateId: b.gateId,
        mode: b.mode || "any",
      });
    return {
      name: stage.name,
      width: stage.width,
      height: stage.height,
      linked: !!stage.bindPlayers,
      shields: stage.shieldRule ? [stage.shieldRule.direction] : [],
      objects,
    };
  }
  function blueprint(level, id = "editor") {
    validateLevel(level);
    const map = Array.from({ length: level.height }, () =>
      Array(level.width).fill(0),
    );
    const data = {
      id,
      name: level.name,
      width: level.width,
      height: level.height,
      map,
      buttons: [],
      doors: [],
      keys: [],
      blocks: [],
      lasers: [],
      jumppads: [],
      bindPlayers: level.linked,
      shields: level.shields,
      spawn: level.objects.find((o) => o.type === "spawn") || { x: 2, y: 2 },
    };
    for (const o of level.objects) {
      const pos = { x: o.x, y: o.y };
      if (o.type === "terrain")
        for (let y = o.y; y < o.y + o.h; y++)
          for (let x = o.x; x < o.x + o.w; x++) map[y][x] = 1;
      if (o.type === "block")
        data.blocks.push({
          pos,
          size: { x: o.w, y: o.h },
          minPlayers: o.pushers || 0,
        });
      if (["door", "gate"].includes(o.type))
        data.doors.push({
          id: o.id,
          pos: { x: o.x + 1, y: o.y + 2 },
          gate: o.type === "gate",
          blocking: o.type === "gate",
          checkpoint: o.type === "door",
          acceptsKey: o.type === "door",
          open:
            o.type === "door" && !level.objects.some((x) => x.type === "key"),
        });
      if (o.type === "key") data.keys.push({ pos });
      if (o.type === "laser") data.lasers.push({ pos, angle: o.rotation });
      if (o.type === "jumppad") data.jumppads.push({ x: o.x, y: o.y + 2 });
      if (["grow", "shrink", "switch"].includes(o.type))
        data.buttons.push({
          id: o.id,
          pos,
          kind: o.type,
          gateId: o.gateId || null,
          mode: o.mode || "any",
          required: level.objects.filter(
            (b) => b.type === "switch" && b.gateId === o.gateId,
          ).length,
        });
    }
    return data;
  }
  function runtime(level) {
    return instantiateBlueprint(blueprint(level), "tempLevel");
  }
  function legacyLevel(data) {
    if (
      !data ||
      !Number.isInteger(data.width) ||
      !Number.isInteger(data.height) ||
      data.width < 12 ||
      data.width > 100 ||
      data.height < 8 ||
      data.height > 60 ||
      !Array.isArray(data.grid) ||
      data.grid.length !== data.width ||
      data.grid.some((c) => !Array.isArray(c) || c.length !== data.height)
    )
      throw Error("Invalid legacy project grid.");
    const level = {
      name: String(data.name || "Imported round").slice(0, 80),
      width: data.width,
      height: data.height,
      linked: !!data.playersBinded,
      shields: [3, 1, 2, 4].filter((_, i) => (data.shields || [])[i]),
      objects: [],
    };
    const mapping = {
      1: "terrain",
      door: "door",
      key: "key",
      jumppad: "jumppad",
      growingButton: "grow",
      shrinkingButton: "shrink",
      block: "block",
      laser: "laser",
    };
    for (let x = 0; x < data.width; x++)
      for (let y = 0; y < data.height; y++) {
        const cell = data.grid[x][y];
        if (typeof cell !== "string") throw Error("Invalid legacy tile.");
        const [kind, params] = cell.split("|");
        if (kind === "0") continue;
        if (!mapping[kind]) throw Error("Unsupported legacy tile.");
        const values = (params || "").split(",").map(Number),
          type = mapping[kind];
        level.objects.push({
          id: `legacy-${x}-${y}`,
          type,
          x,
          y,
          w: type === "door" ? 2 : type === "block" ? values[0] : 1,
          h: type === "door" ? 2 : type === "block" ? values[1] : 1,
          rotation: type === "laser" ? values[0] % 4 : 0,
          ...(type === "block" ? { pushers: values[2] || 0 } : {}),
        });
      }
    let spawn = null;
    for (let y = data.height - 2; y >= 0 && !spawn; y--)
      for (let x = 1; x < data.width - 1 && !spawn; x++)
        if (data.grid[x][y] === "0" && data.grid[x][y + 1] === "1")
          spawn = { x, y };
    if (spawn)
      level.objects.push({
        id: "legacy-spawn",
        type: "spawn",
        ...spawn,
        w: 1,
        h: 1,
        rotation: 0,
      });
    return validateLevel(level);
  }
  root.ParkData = {
    TYPES,
    clone,
    template,
    campaign,
    validate,
    validateLevel,
    warnings,
    runtime,
    blueprint,
    fromBlueprint,
    legacyLevel,
  };
  if (typeof module !== "undefined") module.exports = root.ParkData;
})(globalThis);
