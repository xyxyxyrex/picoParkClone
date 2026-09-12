/* Gates are mechanical barriers, not exits. Render closed gates as wall tiles so
 * they cannot be confused with the regular exit-door sprite. Open gates render
 * as empty space; collision state continues to be controlled by Door.setOpen(). */
(() => {
  if (typeof Renderer === "undefined") return;

  Renderer.prototype.renderDoors = function () {
    const cellsize = this.game.levelHandler.currentLevel.cellsize;

    for (const door of this.game.doors) {
      if (door.gate) {
        if (door.open) continue;

        const left = (door.pos.x - 1.5) * cellsize.x;
        const top = (door.pos.y - 2.5) * cellsize.y;

        for (let x = 0; x < 2; x++) {
          for (let y = 0; y < 2; y++) {
            const source = y === 0 ? [126, 194] : [389, 191];
            this.ctx.drawImage(
              levelAtlas,
              source[0],
              source[1],
              161,
              161,
              left + x * cellsize.x,
              top + y * cellsize.y,
              cellsize.x,
              cellsize.y,
            );
          }
        }
        continue;
      }

      if (door.open) {
        this.ctx.drawImage(
          levelAtlas,
          591,
          885,
          161 * 2.5,
          161 * 2.5,
          (door.pos.x - 1.5) * cellsize.x,
          (door.pos.y - 2.5) * cellsize.y,
          cellsize.x * 2,
          cellsize.y * 2,
        );
      } else {
        this.ctx.drawImage(
          levelAtlas,
          111,
          885,
          161 * 2.5,
          161 * 2.5,
          (door.pos.x - 1.5) * cellsize.x,
          (door.pos.y - 2.5) * cellsize.y,
          cellsize.x * 2,
          cellsize.y * 2,
        );
      }
    }
  };
})();
