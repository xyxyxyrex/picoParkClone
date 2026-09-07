/* Smooth player-aware camera. Loaded after render.js and before Game is created. */
(function(){
  if(typeof Renderer==='undefined') return;

  Renderer.prototype.cameraPlayers=function(){
    const players=this.game.players.filter(p=>!p.observer&&!p.unloading&&!p.ready&&p.body);
    if(!players.length) return [];
    const versus=(window.hostConnection&&hostConnection.mode==='versus')||(window.clientConnection&&clientConnection.mode==='versus');
    if(!versus) return players;

    if(window.clientConnection && clientConnection.role!=='observer'){
      const mine=this.game.players.find(p=>p.body&&clientConnection.mainPlayer&&p.body.id===clientConnection.mainPlayer.body.id) || clientConnection.mainPlayer;
      const stage=mine&&mine.campaignStage||1;
      return players.filter(p=>p.team===clientConnection.role&&p.campaignStage===stage);
    }

    let lead=1;
    players.forEach(p=>lead=Math.max(lead,p.campaignStage||1));
    return players.filter(p=>(p.campaignStage||1)===lead);
  };

  Renderer.prototype.updateDynamicCamera=function(){
    if(!this.camera){
      this.camera={x:0,y:0,scale:1,initialized:false};
      this.cameraPadding={x:260,y:210};
      this.minCameraScale=.52;
      this.maxCameraScale=1.18;
    }
    const players=this.cameraPlayers();
    if(!players.length) return;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    players.forEach(p=>{
      const x=p.body.position.x,y=p.body.position.y;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    });
    const targetX=(minX+maxX)/2;
    const targetY=(minY+maxY)/2;
    const spanX=Math.max(380,maxX-minX+this.cameraPadding.x);
    const spanY=Math.max(300,maxY-minY+this.cameraPadding.y);
    const targetScale=Math.max(this.minCameraScale,Math.min(this.maxCameraScale,Math.min(this.canvas.width/spanX,this.canvas.height/spanY)));

    if(!this.camera.initialized){
      this.camera.x=targetX;this.camera.y=targetY;this.camera.scale=targetScale;this.camera.initialized=true;
    }else{
      const follow=.085,zoomFollow=.065;
      this.camera.x+=(targetX-this.camera.x)*follow;
      this.camera.y+=(targetY-this.camera.y)*follow;
      this.camera.scale+=(targetScale-this.camera.scale)*zoomFollow;
    }
    this.offset=v(-this.camera.x,-this.camera.y);
    this.globalScale=this.camera.scale;
  };

  Renderer.prototype.resetDynamicCamera=function(){ if(this.camera)this.camera.initialized=false; };

  Renderer.prototype.resizeCanvas=function(){
    this.canvas.width=window.innerWidth;
    this.canvas.height=window.innerHeight;
    if(this.camera&&this.camera.initialized) return;
    this.globalScale=1;
  };

  Renderer.prototype.renderLoop=function(self){
    const averageStrength=50,currentFps=(new Date()).getTime()-self.lastFPS;
    if(currentFps<100) self.fps=((self.fps*averageStrength)+currentFps)/(averageStrength+1);
    self.clearCanvas();
    self.renderBackground();
    self.updateDynamicCamera();
    self.ctx.save();
    self.ctx.translate((self.offset.x*self.globalScale)+(window.innerWidth*.5),(self.offset.y*self.globalScale)+(window.innerHeight*.5));
    self.ctx.scale(self.globalScale,self.globalScale);
    self.renderLevel(self.game.levelHandler);
    self.renderConstraints();
    self.game.players.forEach(player=>{if(!player.observer&&!player.unloading)self.renderPlayer(player);});
    self.renderEntities();
    if(self.debug) self.renderTriggers();
    self.ctx.restore();
    if(self.debug) self.renderDebug();
    self.renderEffects();
    self.lastFPS=(new Date()).getTime();
    requestAnimationFrame(()=>self.renderLoop(self));
  };
})();
