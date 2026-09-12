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
  }

  updateConstraint(link) {
    const playerA = link.bodyA;
    const playerB = link.bodyB;
    if (!this.isActive(playerA) || !this.isActive(playerB)) {
      link.taut = false;
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
      if (this.game.playersBinded && this.game.resetBoundPlayers) {
        this.game.resetBoundPlayers("tether-teleport");
        return "reset";
      }
      return;
    }

    if (distance <= link.restLength || distance < 0.0001) {
      link.taut = false;
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
