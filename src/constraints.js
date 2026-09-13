const TETHER_DEFAULTS = Object.freeze({
  restLength: 100,
  maxLength: 150,
  stiffness: 0.00008,
  hardStiffness: 0.00025,
  damping: 0.00012,
  maxForce: 0.014,
  teleportResetDistance: 450,
});

class ConstraintHandler {
  constructor(game) {
    this.game = game;
  }

  clear() {
    this.game.constraints = [];
  }

  updateConstraints() {
    for (let i = 0; i < this.game.constraints.length; i++) {
      if (this.updateConstraint(this.game.constraints[i]) === "reset") break;
    }
    for (const link of this.game.constraints) this.assistAroundCorner(link);
    // Player walking is position-based, so force alone cannot enforce a hard
    // rope length. Repeated symmetric corrections keep the chain together
    // without changing its center of mass or favoring either end.
    for (let pass = 0; pass < 12; pass++)
      for (const link of this.game.constraints) this.enforceMaxLength(link);
  }

  isBlockedHorizontally(player, direction) {
    if (!direction || !player?.body?.bounds) return false;
    const bounds = player.body.bounds;
    const probe = 6;
    const inset = 4;
    const region = {
      min: {
        x: bounds.min.x + direction * probe,
        y: bounds.min.y + inset,
      },
      max: {
        x: bounds.max.x + direction * probe,
        y: bounds.max.y - inset,
      },
    };
    return (
      Matter.Query.region(
        Matter.Composite.allBodies(this.game.matter.engine.world).filter(
          (body) =>
            body !== player.body &&
            body.isStatic &&
            !body.isSensor &&
            body.collisionFilter.mask !== 0,
        ),
        region,
      ).length > 0
    );
  }

  assistAroundCorner(link) {
    const playerA = link.bodyA;
    const playerB = link.bodyB;
    if (!this.isActive(playerA) || !this.isActive(playerB)) return;
    const dx = playerB.body.position.x - playerA.body.position.x;
    const dy = playerB.body.position.y - playerA.body.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= link.restLength + 5 || Math.abs(dy) < 30) return;

    const lower = dy > 0 ? playerB : playerA;
    const upper = lower === playerA ? playerB : playerA;
    const towardUpper = Math.sign(
      upper.body.position.x - lower.body.position.x,
    );
    if (!towardUpper || !this.isBlockedHorizontally(lower, towardUpper)) return;

    const ordered = this.game.players
      .filter((player) => this.isActive(player))
      .slice()
      .sort((a, b) => (a.tetherIndex ?? 0) - (b.tetherIndex ?? 0));
    const lowerIndex = ordered.indexOf(lower);
    const upperIndex = ordered.indexOf(upper);
    if (lowerIndex < 0 || upperIndex < 0) return;
    const lowerSide =
      lowerIndex < upperIndex
        ? ordered.slice(0, lowerIndex + 1)
        : ordered.slice(lowerIndex);
    const upperSide =
      lowerIndex < upperIndex
        ? ordered.slice(upperIndex)
        : ordered.slice(0, upperIndex + 1);
    if (upperSide.length <= lowerSide.length) return;

    const awayControl = towardUpper > 0 ? 1 : 0;
    const pullers = upperSide.filter(
      (player) => player.keys?.[player.controls?.[awayControl]],
    ).length;
    if (pullers <= lowerSide.length) return;

    const advantage = Math.min(4, pullers - lowerSide.length);
    const lift = 0.75 + advantage * 0.3;
    Matter.Body.translate(lower.body, { x: 0, y: -lift });
    Matter.Body.setVelocity(lower.body, {
      x: lower.body.velocity.x,
      y: Math.min(lower.body.velocity.y, -1.5 - advantage * 0.45),
    });
    link.cornerAssisted = true;
  }

  enforceMaxLength(link) {
    const playerA = link.bodyA;
    const playerB = link.bodyB;
    if (!this.isActive(playerA) || !this.isActive(playerB)) return;
    const bodyA = playerA.body;
    const bodyB = playerB.body;
    const dx = bodyB.position.x - bodyA.position.x;
    const dy = bodyB.position.y - bodyA.position.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= link.maxLength) return;
    const halfCorrection = (distance - link.maxLength) * 0.5;
    const correction = {
      x: (dx / distance) * halfCorrection,
      y: (dy / distance) * halfCorrection,
    };
    Matter.Body.translate(bodyA, correction);
    Matter.Body.translate(bodyB, { x: -correction.x, y: -correction.y });
    link.distance = link.maxLength;
  }

  updateConstraint(link) {
    const playerA = link.bodyA;
    const playerB = link.bodyB;
    if (!this.isActive(playerA) || !this.isActive(playerB)) {
      link.taut = false;
      link.force = 0;
      return;
    }

    const bodyA = playerA.body;
    const bodyB = playerB.body;
    const dx = bodyB.position.x - bodyA.position.x;
    const dy = bodyB.position.y - bodyA.position.y;
    const distance = Math.hypot(dx, dy);
    link.distance = distance;

    if (!Number.isFinite(distance) || distance >= link.teleportResetDistance) {
      link.taut = false;
      link.force = 0;
      if (this.game.playersBinded && this.game.resetBoundPlayers) {
        this.game.resetBoundPlayers("tether-teleport");
        return "reset";
      }
      return;
    }

    if (distance <= link.restLength || distance < 0.0001) {
      link.taut = false;
      link.force = 0;
      return;
    }

    link.taut = true;
    const nx = dx / distance;
    const ny = dy / distance;
    const stretch = distance - link.restLength;
    const hardStretch = Math.max(0, distance - link.maxLength);
    const relativeSpeed =
      (bodyB.velocity.x - bodyA.velocity.x) * nx +
      (bodyB.velocity.y - bodyA.velocity.y) * ny;

    let magnitude =
      stretch * link.stiffness +
      hardStretch * link.hardStiffness +
      relativeSpeed * link.damping;
    magnitude = Math.max(0, Math.min(link.maxForce, magnitude));
    link.force = magnitude;

    if (magnitude <= 0) return;

    const force = { x: nx * magnitude, y: ny * magnitude };
    Matter.Body.applyForce(bodyA, bodyA.position, force);
    Matter.Body.applyForce(bodyB, bodyB.position, {
      x: -force.x,
      y: -force.y,
    });
  }

  isActive(player) {
    return !!(
      player &&
      player.body &&
      !player.observer &&
      !player.unloading &&
      !player.ready &&
      !player.dead
    );
  }

  addConstraint(options) {
    const link = new TetherLink(options);
    this.game.constraints.push(link);
    return link;
  }
}

class TetherLink {
  constructor(options = {}) {
    const config = { ...TETHER_DEFAULTS, ...options };
    this.bodyA = config.bodyA;
    this.bodyB = config.bodyB;
    this.restLength = config.restLength;
    this.maxLength = config.maxLength;
    this.stiffness = config.stiffness;
    this.hardStiffness = config.hardStiffness;
    this.damping = config.damping;
    this.maxForce = config.maxForce;
    this.teleportResetDistance = Math.max(
      config.teleportResetDistance,
      this.maxLength * 2,
    );
    this.distance = 0;
    this.force = 0;
    this.taut = false;
  }
}
