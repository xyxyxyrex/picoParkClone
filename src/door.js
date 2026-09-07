class Door {
    constructor(pos,options) {
        this.game = undefined;
        options = {open:false,...options};
        this.options = options;
        this.pos = pos;
        this.id = Math.floor(Math.random()*100000);
        this.nextLevel = options.nextLevel;
        this.open = options.open;
        this.prepped = options.players;
        this.playerCount = options.playerCount;
        this.roundLocked = false;

        this.onIn = e=>{
            const rect=this.trigger.rect.bounds;
            const playerBody=e.bounds;
            if(!this.open) return;
            const fullyInside = rect.min.x<playerBody.min.x && rect.max.x>playerBody.max.x && rect.min.y<playerBody.min.y && (rect.max.y+5)>playerBody.max.y;
            if(!fullyInside) return;

            e.player.exitTimer -= e.player.game.deltaTime;
            if(!e.player.keys[e.player.controls[3]]) return;
            e.player.readyUp(this.trigger.rect.position);

            if(window.clientConnection) return;

            if(window.hostConnection && hostConnection.mode==='versus') {
                const team=e.player.team;
                if((team!=='team1'&&team!=='team2')||this.roundLocked) return;
                const teamPlayers=this.game.players.filter(p=>!p.observer&&p.team===team);
                const readyPlayers=teamPlayers.filter(p=>p.ready);
                if(teamPlayers.length>0 && readyPlayers.length>=teamPlayers.length) {
                    this.roundLocked=true;
                    hostConnection.scores[team]=(hostConnection.scores[team]||0)+1;
                    hostConnection.broadcastLobby();
                    hostConnection.broadcast(JSON.stringify({versusRoundWinner:team,lobbyState:hostConnection.getLobbyState()}));
                    setTimeout(()=>{
                        this.roundLocked=false;
                        e.player.game.renderer.levelTransistion(this.nextLevel);
                        hostConnection.broadcast(JSON.stringify({setLevel:this.nextLevel}));
                    },350);
                }
                return;
            }

            let playerReadyCount=0;
            this.game.players.forEach(p=>{if(p.ready&&!p.observer)playerReadyCount+=1;});
            if(playerReadyCount>=this.playerCount) {
                e.player.game.renderer.levelTransistion(this.nextLevel);
                if(window.hostConnection) hostConnection.broadcast(JSON.stringify({setLevel:this.nextLevel}));
            }
        };
    }
}
