(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    D = ParkData,
    canvas = $("editorCanvas"),
    ctx = canvas.getContext("2d");
  const catalog = {
    terrain: ["Terrain", "Build platforms, walls, and a path to the finish."],
    block: [
      "Push block",
      "A movable crate. Stack it, push it, and help your team climb.",
    ],
    door: [
      "Exit door",
      "Collect the keys, then gather every teammate here and press down.",
    ],
    key: ["Key", "Unlocks an exit when a player brings it close."],
    jumppad: ["Jump pad", "Launch teammates into the air."],
    grow: ["Grow button", "Stand here to grow."],
    shrink: ["Shrink button", "Stand here to squeeze through smaller spaces."],
    laser: ["Laser", "A dangerous beam. Rotate to change its direction."],
    spawn: ["Team spawn", "Where teammates start and respawn. One per level."],
    gate: ["Gate", "A barrier opened by connected pressure switches."],
    switch: [
      "Pressure switch",
      "Link to a gate. Choose whether any or all connected switches must be held.",
    ],
    boundary: [
      "Level boundary",
      "Editor-only reset zone. It is invisible and non-solid during gameplay.",
    ],
  };
  const atlas = new Image(),
    players = new Image(),
    lasers = new Image();
  atlas.src = "assets/imgs/levelAssets.png";
  players.src = "assets/imgs/atlas.png";
  lasers.src = "assets/imgs/laser.png";
  let campaign = D.campaign(),
    team = 2,
    round = 0,
    selected = null,
    brush = { type: "terrain", w: 1, h: 1, rotation: 0 },
    tool = "paint";
  let camera = { x: 0, y: 0, scale: 24 },
    space = false,
    showGrid = true,
    pointer = null,
    gesture = null,
    movePending = false,
    undo = [],
    redo = [],
    toastTimer,
    revision = null,
    edited = false;
  const level = () => campaign.variants[team][round];
  try {
    const saved = localStorage.getItem("park.studio.v1");
    if (saved) campaign = D.validate(JSON.parse(saved));
  } catch {
    toast("Saved draft could not be read. Import a backup to recover it.");
  }
  const hadDraft =
    !!localStorage.getItem("park.studio.v1") ||
    !!localStorage.getItem("tinyParkEditorDraft");
  if (
    !localStorage.getItem("park.studio.v1") &&
    localStorage.getItem("tinyParkEditorDraft")
  ) {
    try {
      campaign.variants[team][round] = D.legacyLevel(
        JSON.parse(localStorage.getItem("tinyParkEditorDraft")),
      );
      save();
      toast("Your previous draft was recovered into Round 1, 2 per team.");
    } catch {
      toast(
        "Previous draft could not be migrated. It remains stored on this device.",
      );
    }
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function save() {
    edited = true;
    try {
      localStorage.setItem("park.studio.v1", JSON.stringify(campaign));
      $("saveState").textContent = "Saved";
    } catch {
      $("saveState").textContent = "Draft not saved — export a backup";
    }
  }
  function checkpoint() {
    undo.push({ team, round, data: D.clone(campaign) });
    if (undo.length > 80) undo.shift();
    redo = [];
  }
  function changed() {
    save();
    sync();
    draw();
  }
  function mutate(fn) {
    const before = D.clone(campaign);
    checkpoint();
    try {
      fn();
      D.validate(campaign);
      changed();
    } catch (e) {
      campaign = before;
      undo.pop();
      toast(e.message);
      sync();
      draw();
    }
  }
  function history(from, to) {
    if (!from.length) return;
    to.push({ team, round, data: D.clone(campaign) });
    const state = from.pop();
    campaign = state.data;
    team = state.team;
    round = state.round;
    selected = null;
    hideMenu();
    changed();
    fit();
  }
  function sync() {
    const l = level(),
      object = l.objects.find((o) => o.id === selected) || brush;
    $("levelName").value = l.name;
    $("levelW").value = l.width;
    $("levelH").value = l.height;
    $("linked").checked = l.linked;
    $("teamSize").value = team;
    document
      .querySelectorAll(".shields input")
      .forEach((e) => (e.checked = l.shields.includes(+e.value)));
    $("roundLabel").textContent = `ROUND ${String(round + 1).padStart(2, "0")}`;
    $("canvasBadge").textContent =
      `ROUND ${String(round + 1).padStart(2, "0")} · ${team} PER TEAM`;
    $("inspectorTitle").textContent = catalog[object.type][0];
    $("objectDescription").textContent = catalog[object.type][1];
    $("objectW").value = object.w;
    $("objectH").value = object.h;
    $("objectW").disabled = $("objectH").disabled = ![
      "terrain",
      "block",
      "boundary",
    ].includes(object.type);
    $("switchFields").hidden = object.type !== "switch";
    $("gateSelect").replaceChildren();
    l.objects
      .filter((o) => o.type === "gate")
      .forEach((g, i) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = `Gate ${i + 1} · ${g.x}, ${g.y}`;
        $("gateSelect").append(opt);
      });
    $("gateSelect").value = object.gateId || "";
    $("switchMode").value = object.mode || "any";
    $("sizeHint").textContent = selected
      ? "Changes save automatically."
      : "R to rotate.";
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
      b.setAttribute("aria-pressed", b.dataset.tool === tool);
    });
    document.querySelectorAll(".tile").forEach((b) => {
      b.classList.toggle("active", b.dataset.type === brush.type);
      b.setAttribute("aria-pressed", b.dataset.type === brush.type);
    });
    document.querySelectorAll("[data-round]").forEach((b) => {
      b.classList.toggle("active", +b.dataset.round === round);
      b.setAttribute(
        "aria-current",
        +b.dataset.round === round ? "step" : "false",
      );
    });
    const warnings = D.warnings(l);
    $("validation").textContent = warnings.length
      ? warnings.join(" ")
      : "Ready to test.";
    $("validation").classList.toggle("warning", !!warnings.length);
    $("undo").disabled = !undo.length;
    $("redo").disabled = !redo.length;
  }
  function sprite(c, image, sx, sy, sw, sh, x, y, w, h) {
    if (image.complete && image.naturalWidth)
      c.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  }
  function drawObject(c, o, terrain = null) {
    const { x, y, w, h, type } = o;
    if (type === "terrain" || type === "block") {
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++) {
          const source =
            type === "block"
              ? [655, 196]
              : (terrain ? !terrain.has(`${x + a},${y + b - 1}`) : b === 0)
                ? [126, 194]
                : [389, 191];
          sprite(c, atlas, ...source, 161, 161, x + a, y + b, 1, 1);
        }
    } else if (type === "door") {
      sprite(c, atlas, 111, 885, 402.5, 402.5, x, y, 2, 2);
    } else if (type === "gate") {
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++) {
          const source = b === 0 ? [126, 194] : [389, 191];
          sprite(c, atlas, ...source, 161, 161, x + a, y + b, 1, 1);
        }
    } else if (type === "boundary") {
      c.save();
      c.fillStyle = "rgba(220, 35, 35, 0.2)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "#c52020";
      c.lineWidth = 0.055;
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++) {
          const bx = x + a,
            by = y + b;
          c.strokeRect(bx + 0.06, by + 0.06, 0.88, 0.88);
          c.beginPath();
          c.moveTo(bx + 0.22, by + 0.22);
          c.lineTo(bx + 0.78, by + 0.78);
          c.moveTo(bx + 0.78, by + 0.22);
          c.lineTo(bx + 0.22, by + 0.78);
          c.stroke();
        }
      c.restore();
    } else if (type === "key")
      sprite(c, atlas, 115, 514, 159, 215, x + 0.15, y + 0.03, 0.7, 0.94);
    else if (["grow", "shrink", "switch"].includes(type)) {
      sprite(c, atlas, 389, 535, 161, 161, x, y, 1, 1);
      c.fillStyle = "#604730";
      c.font = ".4px Arial";
      c.textAlign = "center";
      c.fillText(
        type === "grow" ? "+" : type === "shrink" ? "−" : "•",
        x + 0.5,
        y + 0.45,
      );
    } else if (type === "jumppad") {
      c.fillStyle = "#ff5500";
      c.fillRect(x, y + 0.15, 1, 0.85);
      c.fillStyle = "#ffe291";
      c.font = ".5px Arial";
      c.textAlign = "center";
      c.fillText("↑", x + 0.5, y + 0.76);
    } else if (type === "spawn") {
      sprite(c, players, 34, 56, 42, 46, x + 0.08, y, 0.84, 1);
      c.strokeStyle = "#496b45";
      c.lineWidth = 0.05;
      c.setLineDash([0.12, 0.08]);
      c.strokeRect(x - 0.05, y - 0.05, 1.1, 1.1);
      c.setLineDash([]);
    } else if (type === "laser") {
      c.save();
      c.translate(x + 0.5, y + 0.5);
      c.rotate((o.rotation * Math.PI) / 2);
      sprite(c, lasers, 0, 4, 36, 92, -0.25, -0.46, 0.36, 0.92);
      sprite(c, lasers, 57, 0, 100, 100, 0.08, -0.22, 0.85, 0.44);
      c.restore();
    }
  }
  function draw() {
    const ratio = devicePixelRatio || 1,
      rect = canvas.getBoundingClientRect();
    if (
      canvas.width !== Math.round(rect.width * ratio) ||
      canvas.height !== Math.round(rect.height * ratio)
    ) {
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.imageSmoothingEnabled = false;

    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    const l = level(),
      gradient = ctx.createLinearGradient(0, 0, 0, l.height);
    gradient.addColorStop(0, "#ffb017");
    gradient.addColorStop(1, "#ffe218");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, l.width, l.height);
    const terrain = new Set();
    for (const o of l.objects.filter((o) => o.type === "terrain"))
      for (let y = o.y; y < o.y + o.h; y++)
        for (let x = o.x; x < o.x + o.w; x++) terrain.add(`${x},${y}`);
    for (const o of l.objects.filter((o) => o.type !== "boundary"))
      drawObject(ctx, o, terrain);
    // Boundaries are deliberately drawn last and translucent so the editor can
    // inspect them even when they overlap floor tiles. Runtime never renders them.
    for (const o of l.objects.filter((o) => o.type === "boundary"))
      drawObject(ctx, o, terrain);
    const active = l.objects.find((o) => o.id === selected);
    if (active?.type === "switch") {
      const gate = l.objects.find((o) => o.id === active.gateId);
      if (gate) {
        ctx.strokeStyle = "#496b45";
        ctx.lineWidth = 2 / camera.scale;
        ctx.setLineDash([0.2, 0.15]);
        ctx.beginPath();
        ctx.moveTo(active.x + 0.5, active.y + 0.5);
        ctx.lineTo(gate.x + 1, gate.y + 1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (showGrid && camera.scale > 9) {
      ctx.strokeStyle = "#70532220";
      ctx.lineWidth = 1 / camera.scale;
      ctx.beginPath();
      for (let x = 0; x <= l.width; x++) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, l.height);
      }
      for (let y = 0; y <= l.height; y++) {
        ctx.moveTo(0, y);
        ctx.lineTo(l.width, y);
      }
      ctx.stroke();
    }
    const sel = l.objects.find((o) => o.id === selected);
    if (sel) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3 / camera.scale;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      ctx.strokeStyle = "#496b45";
      ctx.lineWidth = 1 / camera.scale;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }
    if (pointer && tool === "paint" && !gesture && !space && !hit(pointer)) {
      const ghost = { ...brush, ...pointer };
      ctx.globalAlpha = 0.45;
      drawObject(ctx, ghost);
      ctx.globalAlpha = 1;
    }
    $("zoomLabel").textContent = Math.round((camera.scale / 32) * 100) + "%";
    canvas.style.cursor =
      space || tool === "pan"
        ? "grab"
        : movePending
          ? "move"
          : tool === "erase"
            ? "crosshair"
            : tool === "select"
              ? "default"
              : "crosshair";
  }
  function fit() {
    const r = canvas.getBoundingClientRect();
    camera.scale = Math.max(
      5,
      Math.min(
        (r.width - 55) / level().width,
        (r.height - 140) / level().height,
        40,
      ),
    );
    camera.x = (r.width - level().width * camera.scale) / 2;
    camera.y = (r.height - level().height * camera.scale) / 2 + 10;
    draw();
  }
  function zoom(
    factor,
    x = canvas.clientWidth / 2,
    y = canvas.clientHeight / 2,
  ) {
    const old = camera.scale;
    camera.scale = Math.max(5, Math.min(96, old * factor));
    camera.x = x - ((x - camera.x) * camera.scale) / old;
    camera.y = y - ((y - camera.y) * camera.scale) / old;
    hideMenu();
    draw();
  }
  function position(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left - camera.x) / camera.scale),
      y: Math.floor((e.clientY - r.top - camera.y) / camera.scale),
    };
  }
  function hit(p) {
    return [...level().objects]
      .reverse()
      .find(
        (o) => p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h,
      );
  }
  function inside(o) {
    return (
      o.x >= 0 &&
      o.y >= 0 &&
      o.x + o.w <= level().width &&
      o.y + o.h <= level().height
    );
  }
  function hideMenu() {
    $("objectMenu").hidden = true;
  }
  function menu(o, e) {
    selected = o.id;
    sync();
    const r = canvas.getBoundingClientRect();
    $("objectTitle").textContent = `${catalog[o.type][0]} · ${o.w} × ${o.h}`;
    $("objectMenu").hidden = false;
    const m = $("objectMenu");
    m.style.left =
      Math.max(
        5,
        Math.min(e.clientX - r.left + 10, r.width - m.offsetWidth - 8),
      ) + "px";
    m.style.top =
      Math.max(
        65,
        Math.min(e.clientY - r.top + 10, r.height - m.offsetHeight - 50),
      ) + "px";
    draw();
  }
  function paint(p) {
    const o = { ...brush, ...p, id: crypto.randomUUID() };
    if (!inside(o) || hit(p)) return;
    if (
      ["spawn", "door"].includes(o.type) &&
      level().objects.some((x) => x.type === o.type)
    ) {
      toast(`Move the existing ${catalog[o.type][0].toLowerCase()} instead.`);
      return;
    }
    level().objects.push(o);
  }
  function fillArea(start) {
    if (hit(start) || !inside({ ...start, w: 1, h: 1 })) {
      toast("Click an empty enclosed area to fill with terrain.");
      return;
    }
    mutate(() => {
      const occupied = new Set();
      for (const o of level().objects)
        for (let y = o.y; y < o.y + o.h; y++)
          for (let x = o.x; x < o.x + o.w; x++) occupied.add(`${x},${y}`);
      const visited = new Set(),
        pending = [start];
      while (pending.length) {
        const p = pending.pop(),
          key = `${p.x},${p.y}`;
        if (
          visited.has(key) ||
          occupied.has(key) ||
          !inside({ ...p, w: 1, h: 1 })
        )
          continue;
        visited.add(key);
        pending.push(
          { x: p.x + 1, y: p.y },
          { x: p.x - 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x, y: p.y - 1 },
        );
      }
      for (let y = 0; y < level().height; y++)
        for (let x = 0; x < level().width;) {
          if (!visited.has(`${x},${y}`)) {
            x++;
            continue;
          }
          const start = x;
          while (visited.has(`${x},${y}`)) x++;
          level().objects.push({
            id: crypto.randomUUID(),
            type: "terrain",
            x: start,
            y,
            w: x - start,
            h: 1,
            rotation: 0,
          });
        }
    });
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button > 1) return;
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    pointer = position(e);
    hideMenu();
    if (space || e.button === 1 || tool === "pan") {
      gesture = { mode: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    const found = hit(pointer);
    if (tool === "fill" || (e.shiftKey && tool === "paint")) {
      fillArea(pointer);
      return;
    }
    if (movePending && selected) {
      const o = level().objects.find((x) => x.id === selected);
      if (o)
        mutate(() => {
          o.x = pointer.x;
          o.y = pointer.y;
        });
      movePending = false;
      return;
    }
    if (tool !== "erase" && found) {
      menu(found, e);
      return;
    }
    if (tool === "select") {
      selected = null;
      sync();
      draw();
      return;
    }
    checkpoint();
    gesture = { mode: tool, before: JSON.stringify(level()), last: pointer };
    if (tool === "erase" && found)
      level().objects = level().objects.filter(
        (o) => o.id !== found.id && o.gateId !== found.id,
      );
    else if (tool === "paint") paint(pointer);
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    pointer = position(e);
    $("coordinates").textContent =
      `X ${pointer.x} : Y ${pointer.y} · ${level().width} × ${level().height}`;
    if (gesture?.mode === "pan") {
      camera.x += e.clientX - gesture.x;
      camera.y += e.clientY - gesture.y;
      gesture.x = e.clientX;
      gesture.y = e.clientY;
    } else if (gesture) {
      // Edge panning keeps placement usable on levels larger than the viewport.
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left + 25) camera.x += 8;
      if (e.clientX > r.right - 25) camera.x -= 8;
      if (e.clientY < r.top + 25) camera.y += 8;
      if (e.clientY > r.bottom - 25) camera.y -= 8;
      pointer = position(e);
      const start = gesture.last,
        steps = Math.max(
          Math.abs(pointer.x - start.x),
          Math.abs(pointer.y - start.y),
          1,
        );
      for (let i = 1; i <= steps; i++) {
        const p = {
          x: Math.round(start.x + ((pointer.x - start.x) * i) / steps),
          y: Math.round(start.y + ((pointer.y - start.y) * i) / steps),
        };
        if (gesture.mode === "paint") paint(p);
        else {
          const o = hit(p);
          if (o)
            level().objects = level().objects.filter(
              (x) => x.id !== o.id && x.gateId !== o.id,
            );
        }
      }
      gesture.last = pointer;
    }
    draw();
  });
  function endGesture() {
    if (gesture && gesture.mode !== "pan") {
      if (gesture.before === JSON.stringify(level())) undo.pop();
      else {
        try {
          D.validate(campaign);
          save();
        } catch (e) {
          const previous = undo.pop();
          if (previous) campaign = previous.data;
          toast(e.message);
        }
      }
    }
    gesture = null;
    sync();
    draw();
  }
  canvas.addEventListener("pointerup", endGesture);
  canvas.addEventListener("pointercancel", endGesture);
  canvas.addEventListener("lostpointercapture", () => {
    if (gesture) endGesture();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!gesture) {
      pointer = null;
      draw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoom(
          Math.exp(-e.deltaY * 0.002),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      else {
        camera.x -= e.deltaX;
        camera.y -= e.deltaY;
        hideMenu();
        draw();
      }
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const o = hit(position(e));
    if (o) menu(o, e);
  });
  function action(name) {
    const o = level().objects.find((x) => x.id === selected);
    if (!o) return;
    hideMenu();
    if (name === "move") {
      movePending = true;
      toast("Click a grid cell to move the block. Escape cancels.");
      draw();
      return;
    }
    if (name === "duplicate") {
      if (["spawn", "door"].includes(o.type)) {
        toast("Each level has one spawn and one exit.");
        return;
      }
      brush = { ...D.clone(o) };
      selected = null;
      tool = "paint";
      toast("Click an empty cell to place a copy.");
      sync();
      draw();
      return;
    }
    mutate(() => {
      if (name === "delete") {
        level().objects = level().objects.filter(
          (x) => x.id !== selected && x.gateId !== selected,
        );
        selected = null;
      }
      if (name === "rotate") {
        if (["block", "terrain", "boundary"].includes(o.type)) [o.w, o.h] = [o.h, o.w];
        o.rotation = (o.rotation + 1) % 4;
      }
    });
  }
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => action(b.dataset.action)));
  document.querySelectorAll("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        tool = b.dataset.tool;
        movePending = false;
        hideMenu();
        sync();
        draw();
      }),
  );
  for (let i = 0; i < 5; i++) {
    const b = document.createElement("button");
    b.dataset.round = i;
    b.innerHTML = `<span>0${i + 1}</span> Round ${i + 1}`;
    b.onclick = () => switchLayout(team, i);
    $("rounds").append(b);
  }
  function switchLayout(t, r) {
    stopTest();
    team = +t;
    round = r;
    selected = null;
    movePending = false;
    hideMenu();
    sync();
    fit();
  }
  $("teamSize").onchange = (e) => switchLayout(e.target.value, round);
  function palette() {
    $("palette").replaceChildren();
    let count = 0;
    for (const [type, [name]] of Object.entries(catalog)) {
      if (!name.toLowerCase().includes($("search").value.toLowerCase()))
        continue;
      count++;
      const b = document.createElement("button");
      b.className = "tile";
      b.dataset.type = type;
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 90;
      c.setAttribute("aria-hidden", "true");
      const pc = c.getContext("2d");
      pc.imageSmoothingEnabled = false;
      const size = ["door", "gate"].includes(type) ? 2 : 1;
      pc.translate(12, 8);
      pc.scale(70 / size, 70 / size);
      drawObject(pc, { type, x: 0, y: 0, w: size, h: size, rotation: 0 });
      b.append(c, document.createTextNode(name));
      b.onclick = () => {
        if (
          type === "switch" &&
          !level().objects.some((o) => o.type === "gate")
        ) {
          toast("Place a gate first, then connect a pressure switch.");
          return;
        }
        brush = {
          type,
          w: size,
          h: size,
          rotation: 0,
          ...(type === "switch"
            ? {
                gateId: level().objects.find((o) => o.type === "gate").id,
                mode: "any",
              }
            : {}),
        };
        selected = null;
        tool = "paint";
        movePending = false;
        hideMenu();
        sync();
        draw();
      };
      $("palette").append(b);
    }
    $("paletteCount").textContent = count;
    sync();
  }
  $("search").oninput = palette;
  [atlas, players, lasers].forEach(
    (i) =>
      (i.onload = () => {
        palette();
        draw();
      }),
  );
  $("levelName").onchange = (e) =>
    mutate(() => (level().name = e.target.value.trim() || "Untitled round"));
  for (const [id, prop] of [
    ["levelW", "width"],
    ["levelH", "height"],
  ])
    $(id).onchange = (e) => {
      mutate(() => (level()[prop] = +e.target.value));
      fit();
    };
  for (const [id, prop] of [
    ["objectW", "w"],
    ["objectH", "h"],
  ])
    $(id).onchange = (e) => {
      if (selected)
        mutate(
          () =>
            (level().objects.find((o) => o.id === selected)[prop] =
              +e.target.value),
        );
      else {
        brush[prop] = Math.max(
          1,
          Math.min(
            prop === "w" ? level().width : level().height,
            Math.round(+e.target.value) || 1,
          ),
        );
        sync();
        draw();
      }
    };
  $("linked").onchange = (e) =>
    mutate(() => (level().linked = e.target.checked));
  for (const [id, prop] of [
    ["gateSelect", "gateId"],
    ["switchMode", "mode"],
  ])
    $(id).onchange = (e) => {
      if (selected)
        mutate(() => {
          const o = level().objects.find((o) => o.id === selected);
          o[prop] = e.target.value;
          if (prop === "mode")
            level()
              .objects.filter(
                (b) => b.type === "switch" && b.gateId === o.gateId,
              )
              .forEach((b) => (b.mode = o.mode));
        });
      else brush[prop] = e.target.value;
    };
  document
    .querySelectorAll(".shields input")
    .forEach(
      (e) =>
        (e.onchange = () =>
          mutate(
            () =>
              (level().shields = [
                ...document.querySelectorAll(".shields input:checked"),
              ].map((x) => +x.value)),
          )),
    );
  $("undo").onclick = () => history(undo, redo);
  $("redo").onclick = () => history(redo, undo);
  $("fit").onclick = fit;
  $("zoomIn").onclick = () => zoom(1.2);
  $("zoomOut").onclick = () => zoom(1 / 1.2);
  $("gridToggle").onclick = () => {
    showGrid = !showGrid;
    $("gridToggle").setAttribute("aria-pressed", showGrid);
    draw();
  };
  addEventListener("keydown", (e) => {
    if (
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
      $("adminDialog").open ||
      !$("testPanel").hidden
    )
      return;
    const k = e.key.toLowerCase();
    if (
      [" ", "delete", "backspace"].includes(k) ||
      ((e.ctrlKey || e.metaKey) && ["z", "y", "s"].includes(k))
    )
      e.preventDefault();
    if (k === " ") {
      space = true;
      draw();
    }
    if (k === "escape") {
      selected = null;
      movePending = false;
      hideMenu();
      sync();
      draw();
    }
    if ((e.ctrlKey || e.metaKey) && k === "z")
      return e.shiftKey ? history(redo, undo) : history(undo, redo);
    if ((e.ctrlKey || e.metaKey) && k === "y") return history(redo, undo);
    if ((e.ctrlKey || e.metaKey) && k === "s") return save();
    if (["delete", "backspace"].includes(k)) action("delete");
    if (k === "r") {
      if (selected) action("rotate");
      else {
        [brush.w, brush.h] = [brush.h, brush.w];
        brush.rotation = (brush.rotation + 1) % 4;
        sync();
        draw();
      }
    }
    const shortcuts = {
      v: "select",
      b: "paint",
      f: "fill",
      e: "erase",
      h: "pan",
    };
    if (shortcuts[k]) {
      tool = shortcuts[k];
      sync();
      draw();
    }
  });
  addEventListener("keyup", (e) => {
    if (e.key === " ") {
      space = false;
      draw();
    }
  });
  addEventListener("blur", () => {
    space = false;
    if (gesture) endGesture();
  });
  $("export").onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(campaign, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tiny-park-campaign.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("import").onclick = () => $("fileInput").click();
  $("fileInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error("Keep campaign files under 2 MB.");
      const raw = JSON.parse(await file.text());
      const data = raw.grid ? D.legacyLevel(raw) : D.validate(raw);
      checkpoint();
      if (raw.grid) campaign.variants[team][round] = data;
      else campaign = data;
      selected = null;
      changed();
      fit();
      toast("Campaign imported. Undo is available.");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  };
  function play() {
    const issues = D.warnings(level());
    if (issues.length) {
      toast(issues[0]);
      return;
    }
    hideMenu();
    $("testPanel").hidden = false;
    $("testStatus").textContent =
      "Arrows to move · ↓ to enter · Tab to switch player";
    $("testFrame").src = "test.html";
  }
  function stopTest() {
    $("testPanel").hidden = true;
    $("testFrame").removeAttribute("src");
  }
  $("play").onclick = play;
  $("stopTest").onclick = stopTest;
  $("restartTest").onclick = play;
  addEventListener("message", (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== $("testFrame").contentWindow
    )
      return;
    if (e.data?.type === "park:ready") {
      e.source.postMessage(
        { type: "park:test", level: D.clone(level()), players: team },
        location.origin,
      );
      $("testFrame").focus();
    }
    if (e.data?.type === "park:complete")
      $("testStatus").textContent =
        "✓ Round complete! All teammates reached the exit.";
    if (e.data?.type === "park:player")
      $("testStatus").textContent =
        `Controlling player ${e.data.player} / ${team} · Arrows + ↓ · Tab switches`;
    if (e.data?.type === "park:stop") stopTest();
  });
  $("admin").onclick = () => {
    $("publishStatus").textContent = "";
    $("publishSummary").textContent =
      "20 layouts · 1–4 players per team · five rounds each";
    $("adminDialog").showModal();
  };
  $("closeAdmin").onclick = () => $("adminDialog").close();
  $("adminDialog").addEventListener(
    "close",
    () => ($("adminPassword").value = ""),
  );
  $("publishForm").onsubmit = async (e) => {
    e.preventDefault();
    $("publish").disabled = true;
    try {
      D.validate(campaign, true);
      $("publishStatus").textContent = "Publishing…";
      const response = await fetch("/api/levels", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${$("adminPassword").value}`,
        },
        body: JSON.stringify({ campaign, revision }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) $("publish").dataset.conflict = "true";
        throw Error(result.error || "Publishing failed.");
      }
      revision = result.revision;
      $("publishStatus").textContent =
        "Published! New matches will use this campaign.";
      $("adminPassword").value = "";
    } catch (err) {
      $("publishStatus").textContent = err.message;
    } finally {
      $("publish").disabled = $("publish").dataset.conflict === "true";
    }
  };
  fetch("/api/levels")
    .then(async (r) => {
      if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
        return;
      const data = await r.json();
      revision = data.revision;
      if (data.campaign && !hadDraft && !edited) {
        campaign = D.validate(data.campaign);
        sync();
        fit();
      }
    })
    .catch(() => {});
  new ResizeObserver(() => draw()).observe($("viewport"));
  palette();
  sync();
  requestAnimationFrame(fit);
  // Read-only diagnostics for browser verification and draft recovery.
  window.parkStudio = {
    snapshot: () => D.clone(campaign),
    camera: () => ({ ...camera }),
    active: () => ({ team, round }),
    selected: () => selected,
  };
})();