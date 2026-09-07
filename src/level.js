var currentLevel = {};

class LevelHandler {
    constructor(game) {
        this.game = game;
        this.levelComp = Matter.Composite.create();
        Matter.Composite.add(this.game.matter.engine.world, this.levelComp);
        this.currentLevel={};
    }
    setLevel(name) {
        this.restartLevel();
        const resolved=resolveGameLevel(name,this.game);
        if(!resolved) throw new Error(`Unknown level: ${name}`);
        this.loadLevel(resolved,name);
    }
    restartLevel() {
        this.game.doors=[];this.game.entities=[];this.game.buttons=[];this.game.triggers=[];this.game.constraints=[];this.game.playersBinded=false;
        this.game.blocks=[];this.game.lasers=[];this.game.jumppads=[];
        Matter.Composite.remove(this.game.matter.engine.world,this.levelComp);
        this.levelComp=Matter.Composite.create();Matter.Composite.add(this.game.matter.engine.world,this.levelComp);
        Matter.Composite.remove(this.game.matter.engine.world,this.game.jumppadHandler.comp);
        this.game.jumppadHandler.comp=Matter.Composite.create();Matter.Composite.add(this.game.matter.engine.world,this.game.jumppadHandler.comp);
        Matter.Composite.remove(this.game.matter.engine.world,this.game.blockHandler.comp);
        this.game.blockHandler.comp=Matter.Composite.create();Matter.Composite.add(this.game.matter.engine.world,this.game.blockHandler.comp);
        if(window.hostConnection) window.hostConnection.broadcast(JSON.stringify({restartLevel:true}));
    }
    addStaticRect(cx,cy,w,h){
        const wall=Matter.Bodies.rectangle(cx,cy,w,h,{isStatic:true});
        Matter.Composite.add(this.levelComp,wall);
    }
    buildMapBodies(levelMap,cellsize){
        // Merge contiguous horizontal tiles into a single rectangle per run. This
        // keeps the large two-lane Versus campaign cheap enough for 12 players.
        for(let y=0;y<levelMap.length;y++){
            let runStart=-1;
            for(let x=0;x<=levelMap[y].length;x++){
                const solid=x<levelMap[y].length&&!!levelMap[y][x];
                if(solid&&runStart<0) runStart=x;
                if((!solid||x===levelMap[y].length)&&runStart>=0){
                    const runEnd=x-1,len=runEnd-runStart+1;
                    const cx=((runStart+runEnd)/2)*cellsize.x;
                    this.addStaticRect(cx,y*cellsize.y,len*cellsize.x,cellsize.y);
                    runStart=-1;
                }
            }
        }
    }
    loadLevel(levelData,name) {
        const cellsize=v(50,50),levelMap=levelData.map;
        this.currentLevel={data:levelMap,cellsize,name,campaign:!!levelData.campaign,spawn:levelData.spawn||null,spawnByTeam:levelData.spawnByTeam||null,stageMeta:levelData.stageMeta||null,teamCounts:levelData.teamCounts||null};
        this.game.buttons=levelData.buttons||[];
        const width=levelMap[0].length*cellsize.x,height=levelMap.length*cellsize.y;
        this.game.renderer.levelBounds={pos:v(-25,-25),size:v(width,height)};
        this.game.renderer.offset=v((cellsize.x*.5)+(-width*.5),(cellsize.y*.5)+(-height*.5));
        this.game.renderer.resizeCanvas();
        if(this.game.renderer.resetDynamicCamera)this.game.renderer.resetDynamicCamera();
        this.buildMapBodies(levelMap,cellsize);

        const activePlayers=this.game.players.filter(p=>!p.observer&&!p.unloading);
        activePlayers.forEach(p=>p.removeShield());
        if(!levelData.campaign){
            if(levelData.playersBinded&&activePlayers.length>1)this.game.bindPlayers(activePlayers);
            if(levelData.shieldRule&&activePlayers.length)activePlayers.slice().sort((a,b)=>String(a.body.id).localeCompare(String(b.body.id)))[0].hasShield[levelData.shieldRule.direction||2]=true;
            if(levelData.playersHaveShields&&!window.clientConnection)levelData.playersHaveShields.forEach((shield,i)=>{if(activePlayers.length)activePlayers[i%activePlayers.length].hasShield[shield]=true;});
            activePlayers.forEach((player,i)=>{
                if(levelData.spawn){player.dead=false;player.ready=false;player.body.isStatic=false;Matter.Body.setPosition(player.body,v(levelData.spawn.x*50,levelData.spawn.y*50-(i*48)));Matter.Body.setVelocity(player.body,v(0,0));}
                else player.restart(i);
            });
        }

        (levelData.doors||[]).forEach(dor=>{
            dor.trigger=this.game.triggerHandler.addTrigger(v((dor.pos.x-.5)*cellsize.x,(dor.pos.y-1.5)*cellsize.y),v(cellsize.x*2,cellsize.y*2));
            this.game.doors.push(dor);dor.game=this.game;dor.trigger.onIn=dor.onIn;dor.playerCount=activePlayers.length;
            if(dor.blocking){
                const blocker=Matter.Bodies.rectangle((dor.pos.x-1)*cellsize.x,(dor.pos.y-1.5)*cellsize.y,cellsize.x*1.4,cellsize.y*2.2,{isStatic:true});
                dor.blockerBody=blocker;Matter.Composite.add(this.levelComp,blocker);dor.setOpen(dor.open);
            }
        });

        if(!window.clientConnection){
            (levelData.blocks||[]).forEach(b=>this.game.blockHandler.addBlock(v(b.pos.x*50,b.pos.y*50),b.size,b));
            (levelData.keys||[]).forEach(k=>{const key=new Key(this.game,v(k.pos.x*cellsize.x,k.pos.y*cellsize.y),{team:k.team||null,stage:k.stage||null});this.game.entities.push(key);});
        }
        (levelData.buttons||[]).forEach(but=>{
            but.trigger=this.game.triggerHandler.addTrigger(v(but.pos.x*cellsize.x,(but.pos.y+.25)*cellsize.y),v(cellsize.x,cellsize.y*.5));
            but.trigger.onEnter=but.onPress;but.trigger.onLeave=but.onUnpress;but.trigger.onIn=but.onIn;
        });
        (levelData.jumppads||[]).forEach(jp=>{const newJp=new Jumppad(this.game,v(jp.x,jp.y-2),{});this.game.jumppads.push(newJp);});
        (levelData.lasers||[]).forEach(l=>{const laser=new Laser(this.game,v(l.pos.x*50,l.pos.y*50),l.angle,{});laser.enabled=l.enabled!==false;laser.team=l.team||null;laser.stage=l.stage||null;this.game.lasers.push(laser);});
    }
}
