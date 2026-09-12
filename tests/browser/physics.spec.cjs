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
