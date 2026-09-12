class Game {
  constructor(options) {
    this.options = { ...options };
    this.mobile = [];
    this.players = [];
    this.constraints = [];
    this.playersBinded = false;
    this.buttons = [];
    this.doors = [];
    this.blocks = [];
    this.lasers = [];
    this.jumppads = [];
    this.triggers = [];
    this.entities = [];
    this.matter = new MatterHandler(this);
    this.triggerHandler = new TriggerHandler(this);
    this.playerhandler = new PlayerHandler(this);
    this.blockHandler = new BlockHandler(this);
    this.laserHandler = new LaserHandler(this);
    this.jumppadHandler = new JumppadHandler(this);
    this.levelHandler = new LevelHandler(this);
    this.renderer = new Renderer(this);
    this.constraintHandler = new ConstraintHandler(this);
    this.entityHandler = new EntityHandler(this);
    this.particleHandler = new ParticleHandler(this);
    this.syncHandler = new SyncHandler(this);

    this.updateMobiles = (self, delta) => {
      self.updateDelta(delta);
      if (window.hostConnection)
        self.players.forEach((p) => {
          if (!p.onlinePlayer && !p.observer) p.updateKeys(keys);
        });
      self.playerhandler.updateControls();
      self.blockHandler.updateBlocks();
      self.laserHandler.updateLasers();
      self.jumppadHandler.updateJumppads();
      self.playerhandler.updatePlayers();
      self.constraintHandler.updateConstraints();
      self.triggerHandler.updateTriggers();
      self.updateEntities();
    };
    this.afterUpdateMobiles = (self) => {
      for (let i = self.players.length - 1; i >= 0; i--) {
        const player = self.players[i];
        if (player.unloading) self.players.splice(i, 1);
        else player.updatePlayerParts();
      }
    };
    this.currentColor = randInt(0, 7);
    this.lastDelta = 0;
    this.deltaTime = 0;
  }
  updateDelta(delta = 1000 / 60) {
    this.deltaTime = delta / (1000 / 60);
  }

  async initRender() {
    this.renderer.init();
    await this.renderer.wait(500);
    const title = this.runTemp
      ? "untitled level"
      : this.levelHandler.currentLevel.name || "level";
    await this.renderer.showTitle(`-- ${title} --`, 500);
    await this.renderer.setFade(0, 700);
  }
  initPhysics() {
    if (window.clientConnection) {
      this.matter.running = true;
      return;
    }
    this.matter.init();
    Matter.Events.on(this.matter.engine, "beforeUpdate", (event) =>
      this.updateMobiles(this, event.delta),
    );
    Matter.Events.on(this.matter.engine, "afterUpdate", () =>
      this.afterUpdateMobiles(this),
    );
  }
  fetchColor() {
    const colors = Object.keys(colorMods);
    this.currentColor += 1;
    return colors[this.currentColor % colors.length];
  }
  updateEntities() {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      ent.update();
      if (ent.unload) this.entities.splice(i, 1);
    }
  }
  testInit() {
    this.initPhysics();
    this.syncHandler.addControl(
      "keys",
      () =>
        this.entities.map((e) => ({
          pos: e.pos,
          vel: e.vel,
          id: e.id,
          team: e.team || null,
          stage: e.stage || null,
        })),
      (d) => {
        let ent = this.entities.find((e) => e.id == d.id);
        if (ent) {
          ent.pos = d.pos;
          ent.vel = d.vel;
          ent.team = d.team || ent.team;
          ent.stage = d.stage || ent.stage;
        } else {
          ent = new Key(this, v(d.pos.x, d.pos.y), {
            team: d.team || null,
            stage: d.stage || null,
          });
          ent.id = d.id;
          this.entities.push(ent);
        }
      },
    );
    this.syncHandler.addControl(
      "doors",
      () => this.doors.map((e) => ({ open: e.open, pos: e.pos, id: e.id })),
      (d) => {
        const door = this.doors.find((e) => e.id == d.id);
        if (door) {
          door.setOpen ? door.setOpen(d.open) : (door.open = d.open);
        }
      },
    );
    this.syncHandler.addControl(
      "blocks",
      () =>
        this.blocks.map((e) => ({
          pos: e.rect.position,
          gridPos: e.pos,
          size: e.size,
          id: e.id,
          options: e.options,
        })),
      (d) => {
        let block = this.blocks.find((e) => e.id == d.id);
        if (block) Matter.Body.setPosition(block.rect, d.pos);
        else {
          block = this.blockHandler.addBlock(
            v(d.gridPos.x, d.gridPos.y),
            d.size,
            d.options,
          );
          block.id = d.id;
        }
      },
    );

    this.syncHandler.addControl(
      "buttons",
      () =>
        this.buttons.map((b, id) => ({
          id,
          pressed: !!b.trigger?.playerInside,
        })),
      (d) => {
        const button = this.buttons[d.id];
        if (button?.trigger) button.trigger.playerInside = d.pressed;
      },
    );
    this.syncHandler.addControl(
      "jumppads",
      () =>
        this.jumppads.map((j, id) => ({
          id,
          height: j.rect.bounds.max.y - j.rect.bounds.min.y,
        })),
      (d) => {
        this.jumppads[d.id]?.setHeight(d.height - 50);
      },
    );
    if (this.runTemp)
      this.levelHandler.loadLevel(levels.tempLevel, "tempLevel");
    else this.levelHandler.setLevel("one");
    this.running = true;
  }
  bindPlayers(players) {
    const pla = players
      .filter((p) => !p.observer && !p.unloading)
      .slice()
      .sort((a, b) => String(a.body.id).localeCompare(String(b.body.id)));
    if (pla.length < 2) return;
    for (let i = 0; i < pla.length - 1; i++) {
      const a = pla[i],
        b = pla[i + 1];
      this.constraintHandler.addConstraint({ bodyA: a, bodyB: b });
      this.constraintHandler.addConstraint({ bodyA: b, bodyB: a });
    }
    this.playersBinded = true;
  }
}
