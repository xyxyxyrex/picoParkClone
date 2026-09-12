/* Render a short, bounded history of authoritative states; never extrapolate physics. */
class ParkPlayback {
  constructor(game) {
    this.game = game;
    this.frames = [];
    this.delay = 100;
    this.renderTime = -Infinity;
    this.lastArrival = 0;
  }
  clear() {
    this.frames = [];
    this.renderTime = -Infinity;
    this.clockOffset = undefined;
  }
  push(state, time) {
    if (
      !Number.isFinite(time) ||
      time <= (this.frames.at(-1)?.time ?? -Infinity)
    )
      return;
    const now = performance.now();
    this.clockOffset = Math.min(this.clockOffset ?? Infinity, now - time);
    this.lastArrival = now;
    this.frames.push({ state, time });
    if (this.frames.length > 12) this.frames.shift();
    if (this.frames.length === 1) this.apply(state, state, 1);
  }
  update() {
    if (!this.frames.length) return;
    const now = performance.now(),
      latest = this.frames.at(-1);
    const target = Math.min(
      latest.time,
      Math.max(this.renderTime, now - this.clockOffset - this.delay),
    );
    this.renderTime = target;
    while (this.frames.length > 2 && this.frames[1].time <= target)
      this.frames.shift();
    const a = this.frames[0],
      b = this.frames[1] || a;
    const t =
      a === b
        ? 1
        : Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time)));
    this.apply(a.state, b.state, t);
    if (this.game.worldLabel) {
      this.game.worldLabel.dataset.network =
        now - this.lastArrival > 500 ? "Waiting for host connection..." : "";
    }
  }
  apply(a, b, t) {
    const mix = (left, right) => ({
      x: left.x + (right.x - left.x) * t,
      y: left.y + (right.y - left.y) * t,
    });
    const old = new Map(a.players.map((p) => [p.id, p]));
    for (const info of b.players) {
      const p = this.game.players.find((p) => p.body.id === info.id);
      if (!p) continue;
      const previous = old.get(info.id);
      const continuous =
        previous &&
        previous.dead === info.dead &&
        previous.ready === info.ready &&
        Math.hypot(
          info.position.x - previous.position.x,
          info.position.y - previous.position.y,
        ) < 150;
      const data = {
        ...(t < 1 && continuous ? previous : info),
        position: continuous
          ? mix(previous.position, info.position)
          : info.position,
      };
      setPlayerWithData(p, data);
      if (info.velocity) Matter.Body.setVelocity(p.body, info.velocity);
      p.constraintVel = v();
      p.updatePlayerParts();
    }
    const sync = { ...b.sync };
    for (const label of ["keys", "blocks"]) {
      const prior = new Map(
        (a.sync?.[label] || []).map((item) => [item.id, item]),
      );
      sync[label] = (b.sync?.[label] || []).map((item) => {
        const p = prior.get(item.id);
        return p ? { ...item, pos: mix(p.pos, item.pos) } : item;
      });
    }
    const previousPads = new Map(
      (a.sync?.jumppads || []).map((p) => [p.id, p]),
    );
    sync.jumppads = (b.sync?.jumppads || []).map((p) => ({
      ...p,
      height: previousPads.has(p.id)
        ? previousPads.get(p.id).height +
          (p.height - previousPads.get(p.id).height) * t
        : p.height,
    }));
    const ids = new Set((sync.keys || []).map((k) => k.id));
    this.game.entities = this.game.entities.filter((k) => ids.has(k.id));
    const blockIds = new Set((sync.blocks || []).map((b) => b.id));
    this.game.blocks = this.game.blocks.filter((block) => {
      if (blockIds.has(block.id)) return true;
      Matter.Composite.remove(this.game.blockHandler.comp, block.rect);
      return false;
    });
    this.game.syncHandler.processSyncData(sync);
    this.game.laserHandler.updateLasers();
  }
}
