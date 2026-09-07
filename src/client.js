class Client {
    constructor(game, player) {
        this.game = game;
        this.mainPlayer = player;
        this.roomConn = null;
        this.mainConn = null;
        this.recentPing = 0;
        this.username = (localStorage.getItem("username") || "unnamed").slice(0,18);
        this.role = "observer";
        this.mode = "classic";
    }
    init(roomId) {
        this.roomConn = new Connection2W();
        this.roomConn.connect(roomId);
        this.roomConn.e.onData = d=>this.processData(d);
        this.roomConn.e.onConnectionFail = ()=>{
            console.log("retrying");
            setTimeout(()=>this.init(roomId),700);
        };
    }
    processData(d,rd) {
        d=JSON.parse(d);
        if(d.reconnectToThis){
            this.mainConn=new Connection2W();
            this.mainConn.connect(d.reconnectToThis);
            this.mainConn.e.onData=(payload,raw)=>this.processData(payload,raw);
            this.mainConn.e.onConnection=()=>{
                this.mainConn.send(JSON.stringify({setUsername:this.username}));
            };
        }
        if(d.roomConfig){ this.mode=d.roomConfig.mode||"classic"; if(window.setGameModeUI) setGameModeUI(this.mode); }
        if(d.lobbyState && window.renderLobbyState) renderLobbyState(d.lobbyState);
        if(d.roleResult){
            this.role=d.roleResult.role||this.role;
            if(this.mainPlayer.setObserver) this.mainPlayer.setObserver(this.role==="observer");
            if(window.showLobbyMessage) showLobbyMessage(d.roleResult.message || (d.roleResult.ok?`Joined ${this.role}.`:"Role change rejected."), !d.roleResult.ok);
        }
        if(d.playerData) this.updateHostPlayers(d.playerData);
        if(d.syncData&&mainGame.running) this.game.syncHandler.processSyncData(d.syncData);
        if(d.setColor) this.mainPlayer.color=d.setColor;
        if(d.startGame) startGame();
        if(d.setLevel) this.game.renderer.levelTransistion(d.setLevel);
        if(d.restartLevel) this.game.levelHandler.setLevel(mainGame.levelHandler.currentLevel.name);
    }
    requestRole(role){
        if(this.mainConn&&this.mainConn.fullyConnected) this.mainConn.send(JSON.stringify({requestRole:role}));
    }
    updateKey(keycode,value) {
        if(this.role==="observer") return;
        if(this.mainConn) this.mainConn.send(JSON.stringify({keycode:{code:keycode,value}}));
    }
    updateHost() {
        if(this.role==="observer") return;
        if(this.mainConn&&this.mainConn.fullyConnected) {
            this.mainPlayer.team=this.role;
            this.mainPlayer.username=this.username;
            this.mainConn.send(JSON.stringify({player:parsePlayerData(this.mainPlayer)}));
        }
    }
    updateHostPlayers(players) {
        const findPlayerById=id=>this.game.players.find(player=>player.body.id==id);
        players.forEach(player=>{
            let foundPlayer=findPlayerById(player.id);
            if(foundPlayer==undefined){
                foundPlayer=mainGame.playerhandler.addPlayer({bodyOptions:{id:player.id}});
                foundPlayer.onlinePlayer=true;
            }
            this.setPlayer(foundPlayer,player);
        });
    }
    setPlayer(body,data){ setPlayerWithData(body,data); }
}
