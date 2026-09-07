/* Campaign-specific player safety/respawn behavior. */
(function(){
  if(typeof Player==='undefined') return;
  const originalTestFalling=Player.prototype.testFalling;

  Player.prototype.campaignRespawnPoint=function(){
    const current=this.game&&this.game.levelHandler&&this.game.levelHandler.currentLevel;
    if(!current) return null;
    if(current.campaign && current.spawnByTeam && this.team && current.spawnByTeam[this.team]){
      return current.spawnByTeam[this.team][this.campaignStage||1]||null;
    }
    return current.spawn||null;
  };

  Player.prototype.respawnAtCampaignCheckpoint=function(){
    const point=this.campaignRespawnPoint();
    if(!point) return false;
    this.dead=false;this.ready=false;this.body.isStatic=false;
    this.body.collisionFilter={category:1,group:0,mask:4294967295};
    Matter.Body.setPosition(this.body,v(point.x*50,point.y*50));
    Matter.Body.setVelocity(this.body,v(0,0));
    this.setScale(1);
    return true;
  };

  Player.prototype.testFalling=function(){
    const current=this.game&&this.game.levelHandler&&this.game.levelHandler.currentLevel;
    if(current&&current.data){
      let bottom=current.data.length*50+250;
      if(current.campaign&&current.stageMeta&&this.team&&current.stageMeta[this.team]){
        const meta=current.stageMeta[this.team][this.campaignStage||1];
        if(meta&&meta.bounds) bottom=(meta.bounds.y+meta.bounds.h)*50+220;
      }
      if(this.body.position.y>bottom){
        if(this.respawnAtCampaignCheckpoint()) return;
      }
    }
    return originalTestFalling.call(this);
  };
})();
