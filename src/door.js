class Door {
    constructor(pos,options) {
        this.game = undefined;
        options = {
            open:false,
            acceptsKey:true,
            checkpoint:true,
            blocking:false,
            gate:false,
            team:null,
            stage:null,
            campaignStage:null,
            finish:false,
            ...options
        };
        this.options = options;
        this.pos = pos;
        this.id = Math.floor(Math.random()*100000);
        this.nextLevel = options.nextLevel;
        this.open = options.open;
        this.prepped = options.players;
        this.playerCount = options.playerCount;
        this.team = options.team;
        this.stage = options.stage;
        this.campaignStage = options.campaignStage;
        this.acceptsKey = options.acceptsKey !== false;
        this.checkpoint = options.checkpoint !== false;
        this.blocking = !!options.blocking;
        this.gate = !!options.gate;
        this.finish = !!options.finish;
        this.blockerBody = null;
        this.roundLocked = false;

        this.setOpen = value=>{
            this.open=!!value;
            if(this.blockerBody){
                this.blockerBody.collisionFilter.mask=this.open?0:4294967295;
                this.blockerBody.render.visible=!this.open;
            }
        };

        this.playerAllowed = player=>{
            if(!player || player.observer) return false;
            if(this.team && player.team!==this.team) return false;
            if(this.campaignStage && player.campaignStage!==this.campaignStage) return false;
            return true;
        };

        this.onIn = e=>{
            if(!this.playerAllowed(e.player)) return;
            if(!this.open || !this.checkpoint) return;
            const rect=this.trigger.rect.bounds;
            const playerBody=e.bounds;
            const fullyInside = rect.min.x<playerBody.min.x && rect.max.x>playerBody.max.x && rect.min.y<playerBody.min.y && (rect.max.y+5)>playerBody.max.y;
            if(!fullyInside) return;

            e.player.exitTimer -= e.player.game.deltaTime;
            if(!e.player.keys[e.player.controls[3]]) return;
            e.player.readyUp(this.trigger.rect.position);
            if(window.clientConnection) return;

            if(window.hostConnection && hostConnection.mode==='versus' && this.campaignStage){
                const team=e.player.team;
                if((team!=='team1'&&team!=='team2')||this.roundLocked) return;
                const teamPlayers=this.game.players.filter(p=>!p.observer&&!p.unloading&&p.team===team&&p.campaignStage===this.campaignStage);
                const readyPlayers=teamPlayers.filter(p=>p.ready);
                if(teamPlayers.length>0 && readyPlayers.length>=teamPlayers.length){
                    this.roundLocked=true;
                    setTimeout(()=>{
                        this.roundLocked=false;
                        teamPlayers.forEach(p=>p.ready=false);
                        hostConnection.completeStage(team,this.campaignStage);
                    },220);
                }
                return;
            }

            const activePlayers=this.game.players.filter(p=>!p.observer&&!p.unloading);
            const playerReadyCount=activePlayers.filter(p=>p.ready).length;
            const needed=this.playerCount||activePlayers.length;
            if(playerReadyCount>=needed && this.nextLevel){
                e.player.game.renderer.levelTransistion(this.nextLevel);
                if(window.hostConnection) hostConnection.broadcast(JSON.stringify({setLevel:this.nextLevel}));
            }
        };
    }
}
