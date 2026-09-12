const { test, expect } = require("@playwright/test");
test("one-block player clears one-block ledges but cannot climb a two-block wall solo", async ({
  page,
}) => {
  await page.goto("/test");
  const results = await page.evaluate(() => {
    function trial(height, walking, held = false, stacked = false) {
      const g = new Game();
      g.renderer.levelBounds = { pos: v(0, 0), size: v(2000, 1000) };
      g.updateDelta = () => {
        g.deltaTime = 1;
      };
      const p = g.playerhandler.addPlayer({});
      const floor = Matter.Bodies.rectangle(500, 525, 1000, 50, {
        isStatic: true,
      });
      Matter.Composite.add(g.matter.engine.world, floor);
      if (height)
        Matter.Composite.add(
          g.matter.engine.world,
          Matter.Bodies.rectangle(400, 500 - height * 25, 300, height * 50, {
            isStatic: true,
          }),
        );
      if (stacked) {
        const teammate = g.playerhandler.addPlayer({});
        Matter.Body.setPosition(teammate.body, v(205, 475));
        teammate.updatePlayerParts();
      }
      Matter.Body.setPosition(p.body, v(205, stacked ? 425 : 475));
      p.updatePlayerParts();
      g.initPhysics();
      Matter.Runner.stop(g.matter.runner);
      for (let i = 0; i < 15; i++)
        Matter.Engine.update(g.matter.engine, 1000 / 60);
      const initial = p.body.position.y;
      let rise = 0,
        landed = false;
      p.keys = { arrowup: true, arrowright: walking };
      for (let i = 0; i < 180; i++) {
        if (i === 1 && !held) p.keys.arrowup = false;
        Matter.Engine.update(g.matter.engine, 1000 / 60);
        rise = Math.max(rise, initial - p.body.position.y);
        if (
          height &&
          p.body.position.x > 270 &&
          Math.abs(p.body.position.y - (475 - height * 50)) < 2 &&
          p.onGround()
        )
          landed = true;
      }
      return {
        rise,
        landed,
        x: p.body.position.x,
        height:
          Math.max(...p.body.vertices.map((v) => v.y)) -
          Math.min(...p.body.vertices.map((v) => v.y)),
      };
    }
    return {
      vertical: trial(0, false),
      one: trial(1, true),
      two: trial(2, true, true),
      stacked: trial(2, true, false, true),
    };
  });

  expect(results.vertical.height).toBeCloseTo(50, 4);
  expect(results.vertical.rise).toBeGreaterThanOrEqual(50);
  expect(results.vertical.rise).toBeLessThanOrEqual(62.5);
  expect(results.one.landed).toBe(true);
  expect(results.two.landed).toBe(false);
  expect(results.two.x).toBeLessThan(250);
  expect(results.stacked.landed).toBe(true);
});

test("open gates leave the collision world and closed gates restore their blocker", async ({
  page,
}) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    const p = g.playerhandler.addPlayer({});
    const gate = new Door(v(3, 3), {
      gate: true,
      blocking: true,
      checkpoint: false,
      acceptsKey: false,
    });
    gate.game = g;

    const blocker = Matter.Bodies.rectangle(150, 100, 100, 100, {
      isStatic: true,
    });
    gate.blockerBody = blocker;
    Matter.Composite.add(g.levelHandler.levelComp, blocker);
    Matter.Body.setPosition(p.body, v(150, 100));
    p.updatePlayerParts();

    const closedCollision = p.testPlayerCollision();
    gate.setOpen(true);
    const openBodyPresent = Matter.Composite.allBodies(g.matter.engine.world).some(
      (body) => body.id === blocker.id,
    );
    const openCollision = p.testPlayerCollision();

    gate.setOpen(false);
    const closedBodyPresent = Matter.Composite.allBodies(g.matter.engine.world).some(
      (body) => body.id === blocker.id,
    );
    const reclosedCollision = p.testPlayerCollision();

    return {
      closedCollision,
      openBodyPresent,
      openCollision,
      closedBodyPresent,
      reclosedCollision,
    };
  });

  expect(state.closedCollision).toBe(true);
  expect(state.openBodyPresent).toBe(false);
  expect(state.openCollision).toBe(false);
  expect(state.closedBodyPresent).toBe(true);
  expect(state.reclosedCollision).toBe(true);
});

test("tether is slack inside its rest length and pulls both players symmetrically when taut", async ({
  page,
}) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    const a = g.playerhandler.addPlayer({});
    const b = g.playerhandler.addPlayer({});
    const c = g.playerhandler.addPlayer({});

    Matter.Body.setPosition(a.body, v(100, 100));
    Matter.Body.setPosition(b.body, v(180, 100));
    Matter.Body.setPosition(c.body, v(260, 100));
    g.bindPlayers([a, b, c]);

    g.constraintHandler.updateConstraints();
    const slack = {
      linkCount: g.constraints.length,
      forces: [a.body.force.x, b.body.force.x, c.body.force.x],
      taut: g.constraints.map((link) => link.taut),
    };

    for (const player of [a, b, c]) {
      player.body.force.x = 0;
      player.body.force.y = 0;
      player.constraintVel = v();
    }
    Matter.Body.setPosition(b.body, v(230, 100));
    const before = [a.body.position.x, b.body.position.x, c.body.position.x];
    g.constraintHandler.updateConstraints();

    return {
      slack,
      before,
      after: [a.body.position.x, b.body.position.x, c.body.position.x],
      taut: g.constraints.map((link) => link.taut),
      forceA: { ...a.body.force },
      forceB: { ...b.body.force },
      forceC: { ...c.body.force },
      constraintVel: [a.constraintVel.x, b.constraintVel.x, c.constraintVel.x],
      order: g.players.map((player) => player.tetherIndex),
      restLength: g.constraints[0].restLength,
      maxLength: g.constraints[0].maxLength,
    };
  });

  expect(state.slack.linkCount).toBe(2);
  expect(state.slack.forces.every((force) => Math.abs(force) < 1e-12)).toBe(true);
  expect(state.slack.taut).toEqual([false, false]);
  expect(state.taut).toEqual([true, false]);
  expect(state.forceA.x).toBeGreaterThan(0);
  expect(state.forceB.x).toBeLessThan(0);
  expect(Math.abs(state.forceA.x + state.forceB.x)).toBeLessThan(1e-12);
  expect(Math.abs(state.forceC.x)).toBeLessThan(1e-12);
  expect(state.after).toEqual(state.before);
  expect(state.constraintVel).toEqual([0, 0, 0]);
  expect(state.order).toEqual([0, 1, 2]);
  expect(state.restLength).toBe(100);
  expect(state.maxLength).toBe(150);
});

test("tether order follows roster indices instead of Matter body ids", async ({
  page,
}) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    const first = g.playerhandler.addPlayer({ bodyOptions: { id: "z-player" } });
    const second = g.playerhandler.addPlayer({ bodyOptions: { id: "a-player" } });
    const third = g.playerhandler.addPlayer({ bodyOptions: { id: "m-player" } });

    g.bindPlayers([first, second, third]);
    return {
      indices: [first.tetherIndex, second.tetherIndex, third.tetherIndex],
      links: g.constraints.map((link) => [link.bodyA.body.id, link.bodyB.body.id]),
    };
  });

  expect(state.indices).toEqual([0, 1, 2]);
  expect(state.links).toEqual([
    ["z-player", "a-player"],
    ["a-player", "m-player"],
  ]);
});

test("extreme tether separation resets the linked group instead of applying an explosive force", async ({
  page,
}) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    const a = g.playerhandler.addPlayer({});
    const b = g.playerhandler.addPlayer({});
    g.levelHandler.currentLevel = { spawn: { x: 4, y: 8 } };
    g.bindPlayers([a, b]);

    Matter.Body.setPosition(a.body, v(100, 100));
    Matter.Body.setPosition(b.body, v(1000, 100));
    Matter.Body.setVelocity(a.body, v(6, -4));
    Matter.Body.setVelocity(b.body, v(-8, 7));
    g.constraintHandler.updateConstraints();

    return {
      reason: g.lastTetherResetReason,
      a: { pos: { ...a.body.position }, vel: { ...a.body.velocity } },
      b: { pos: { ...b.body.position }, vel: { ...b.body.velocity } },
      force: g.constraints[0].force,
      taut: g.constraints[0].taut,
    };
  });

  expect(state.reason).toBe("tether-teleport");
  expect(state.a.pos.x).toBe(200);
  expect(state.b.pos.x).toBe(200);
  expect(state.a.pos.y).toBe(400);
  expect(state.b.pos.y).toBe(350);
  expect(state.a.vel.x).toBe(0);
  expect(state.a.vel.y).toBe(0);
  expect(state.b.vel.x).toBe(0);
  expect(state.b.vel.y).toBe(0);
  expect(state.force).toBe(0);
  expect(state.taut).toBe(false);
});

test("Level Boundary is non-solid and resets a player at the authored zone", async ({
  page,
}) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    g.renderer.levelBounds = { pos: v(-25, -25), size: v(600, 400) };
    g.renderer.offset = v();
    g.levelHandler.currentLevel = {
      spawn: { x: 2, y: 2 },
      cellsize: v(50, 50),
      boundaries: [{ pos: v(4, 5), size: v(3, 1) }],
    };
    const p = g.playerhandler.addPlayer({});
    Matter.Body.setPosition(p.body, v(250, 250));
    p.updatePlayerParts();
    const collisionBeforeReset = p.testPlayerCollision();
    const bodiesBefore = Matter.Composite.allBodies(g.matter.engine.world).length;
    const touched = p.touchesLevelBoundary();
    p.testFalling();
    return {
      touched,
      collisionBeforeReset,
      bodiesBefore,
      bodiesAfter: Matter.Composite.allBodies(g.matter.engine.world).length,
      pos: { ...p.body.position },
      vel: { ...p.body.velocity },
      reason: p.lastResetReason,
    };
  });

  expect(state.touched).toBe(true);
  expect(state.collisionBeforeReset).toBe(false);
  expect(state.bodiesAfter).toBe(state.bodiesBefore);
  expect(state.pos.x).toBe(100);
  expect(state.pos.y).toBe(100);
  expect(state.vel.x).toBe(0);
  expect(state.vel.y).toBe(0);
  expect(state.reason).toBe("level-boundary");
});

test("a Level Boundary resets the entire tethered group", async ({ page }) => {
  await page.goto("/test");
  const state = await page.evaluate(() => {
    const g = new Game();
    g.renderer.levelBounds = { pos: v(-25, -25), size: v(600, 400) };
    g.renderer.offset = v();
    g.levelHandler.currentLevel = {
      spawn: { x: 3, y: 3 },
      cellsize: v(50, 50),
      boundaries: [{ pos: v(7, 5), size: v(2, 1) }],
    };
    const a = g.playerhandler.addPlayer({});
    const b = g.playerhandler.addPlayer({});
    g.bindPlayers([a, b]);
    Matter.Body.setPosition(a.body, v(350, 250));
    Matter.Body.setPosition(b.body, v(200, 150));
    a.testFalling();
    return {
      reason: g.lastTetherResetReason,
      a: { ...a.body.position },
      b: { ...b.body.position },
    };
  });

  expect(state.reason).toBe("level-boundary");
  expect(state.a).toEqual({ x: 150, y: 150 });
  expect(state.b).toEqual({ x: 150, y: 100 });
});
