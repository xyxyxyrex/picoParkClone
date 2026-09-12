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
