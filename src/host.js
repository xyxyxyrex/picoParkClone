class Host {
    constructor(game) {
        this.game = game;
        this.connections = [];
        const wordsf = words.filter(a=>a.length==4);
        this.id = wordsf[randInt(0, wordsf.length)].toUpperCase();
        this.roomJoinOnline = false;
        this.opening = true;
        this.mode = (window.urlData && urlData.mode === "versus") ? "versus" : "classic";
        this.username = (localStorage.getItem("username") || "Host").slice(0,18);
        this.hostRole = this.mode === "versus" ? "observer" : "player";
        this.maxTeamPlayers = 6;
        this.progress = {team1:1,team2:1};
        this.finished = {team1:false,team2:false};
        this.matchWinner = null;
        this.matchStarted = false;
    }
    init() {
        this.recycleJoinConn();
        setInterval(()=>{
            if (window.hostConnection && !(this.roomJoinOnline || this.opening)) this.recycleJoinConn();
        }, 1000);
        setTimeout(()=>this.broadcastLobby(), 200);
    }
    broadcast(data) { this.connections.forEach(conn=>{ if(conn.fullyConnected) conn.send(data); }); }
    sendTo(conn, payload) { if(conn && conn.fullyConnected) conn.send(JSON.stringify(payload)); }
    recycleJoinConn() {
        this.joinConn = new Connection2W();
        this.joinConn.open(this.id);
        this.opening = true;
        this.joinConn.e.onOpening = ()=>{
            this.roomJoinOnline = true;
            this.opening = false;
            setRoomCode(this.joinConn.selfId);
        };
        this.joinConn.e.onConnection = ()=>{
            const incoming = document.getElementById("incoming");
            if(incoming) incoming.textContent = " INCOMING";
            const newConnection = this.openConnection();
            newConnection.e.onOpening = ()=>{
                this.joinConn.send(JSON.stringify({reconnectToThis:newConnection.connS2T.lastPeerId}));
                setTimeout(()=>this.joinConn.terminate(),1000);
            };
        };
        this.joinConn.e.onDisconnection = ()=>{ this.roomJoinOnline=false; this.recycleJoinConn(); };
    }
    closeConnection(conn) {
        const i=this.connections.indexOf(conn);
        if(i>=0) this.connections.splice(i,1);
        if(conn.player){ conn.player.unload(); conn.player=null; }
        this.broadcastLobby();
    }
    openConnection() {
        const connection = new Connection2W();
        connection.role = this.mode === "versus" ? "observer" : "player";
        connection.clientUsername = "Player";
        connection.open();
        connection.e.onData = d=>{
            d=JSON.parse(d);
            if(d.setUsername){ connection.clientUsername=String(d.setUsername||"Player").slice(0,18); this.broadcastLobby(); }
            if(d.requestRole) this.requestRole(connection,d.requestRole);
            if(d.player && connection.role !== "observer") {
                connection.player=this.updateClientBody(d.player,connection);
                connection.player.team=connection.role;
                connection.player.username=connection.clientUsername;
                connection.player.campaignStage=this.progress[connection.role]||1;
            }
        };
        connection.e.onConnection = ()=>{
            const incoming=document.getElementById("incoming"); if(incoming) incoming.textContent="";
            this.sendTo(connection,{roomConfig:{mode:this.mode,maxTeamPlayers:this.maxTeamPlayers},lobbyState:this.getLobbyState()});
        };
        connection.e.onClose = ()=>this.closeConnection(connection);
        this.connections.push(connection);
        return connection;
    }
    getCounts(excludeConn=null) {
        let team1=0,team2=0;
        this.connections.forEach(c=>{
            if(c===excludeConn) return;
            if(c.role==="team1") team1++;
            if(c.role==="team2") team2++;
        });
        if(this.hostRole==='team1') team1++;
        if(this.hostRole==='team2') team2++;
        return {team1,team2};
    }
    canJoinRole(conn, role) {
        if(this.mode!=="versus") return role==="player";
        if(role==="observer") return true;
        if(role!=="team1"&&role!=="team2") return false;
        if(this.matchStarted) return false;
        const counts=this.getCounts(conn);
        const target=role==="team1"?counts.team1:counts.team2;
        const other=role==="team1"?counts.team2:counts.team1;
        if(target>=this.maxTeamPlayers) return false;
        return target<=other;
    }
    requestRole(conn, role) {
        if(!this.canJoinRole(conn,role)){
            const counts=this.getCounts(conn);
            const full=(role==='team1'?counts.team1:counts.team2)>=this.maxTeamPlayers;
            this.sendTo(conn,{roleResult:{ok:false,role:conn.role,message:full?`That team is full (${this.maxTeamPlayers}/${this.maxTeamPlayers}).`:(this.matchStarted?'The match has already started.':'Join the smaller team, or observe.')},lobbyState:this.getLobbyState()});
            return;
        }
        const oldRole=conn.role; conn.role=role;
        if(role==="observer" && conn.player){ conn.player.setObserver&&conn.player.setObserver(true); conn.player.unload(); conn.player=null; }
        if(oldRole==="observer" && role!=="observer") conn.player=null;
        this.sendTo(conn,{roleResult:{ok:true,role,message:role==='observer'?'Now observing.':`Joined ${role==='team1'?'Team 1':'Team 2'}.`},lobbyState:this.getLobbyState()});
        this.broadcastLobby();
    }
    requestHostRole(role){
        if(this.mode!=="versus"||this.matchStarted) return false;
        const fake={role:this.hostRole};
        const old=this.hostRole; this.hostRole='observer';
        const allowed=role==='observer'||this.canJoinRole(fake,role);
        this.hostRole=allowed?role:old;
        const hostPlayer=this.game.players.find(p=>p.isHostPlayer);
        if(hostPlayer){ hostPlayer.team=this.hostRole; hostPlayer.setObserver&&hostPlayer.setObserver(this.hostRole==='observer'); }
        this.broadcastLobby(); return allowed;
    }
    getLobbyState() {
        const members=[{id:"host",username:this.username,role:this.hostRole,isHost:true}];
        this.connections.forEach((c,i)=>members.push({id:c.selfId||`guest-${i}`,username:c.clientUsername||"Player",role:c.role,isHost:false}));
        return {
            mode:this.mode,members,counts:this.getCounts(),maxTeamPlayers:this.maxTeamPlayers,
            progress:{...this.progress},finished:{...this.finished},matchWinner:this.matchWinner,matchStarted:this.matchStarted
        };
    }
    broadcastLobby() {
        const state=this.getLobbyState();
        if(window.renderLobbyState) renderLobbyState(state);
        this.broadcast(JSON.stringify({lobbyState:state,roomConfig:{mode:this.mode,maxTeamPlayers:this.maxTeamPlayers}}));
    }
    updateClientBody(data, conn) {
        const findPlayerById=id=>this.game.players.find(player=>player.body.id==id);
        let foundPlayer=findPlayerById(data.id);
        if(foundPlayer==undefined){ foundPlayer=mainGame.playerhandler.addPlayer({bodyOptions:{id:data.id},color:this.game.fetchColor()}); foundPlayer.onlinePlayer=true; }
        conn.clientBody=foundPlayer; foundPlayer.conn=conn; foundPlayer.keys=data.keys; foundPlayer.team=conn.role; foundPlayer.username=conn.clientUsername;
        foundPlayer.campaignStage=this.progress[conn.role]||1;
        return foundPlayer;
    }
    getTeamPlayers(team){ return this.game.players.filter(p=>!p.observer&&!p.unloading&&p.team===team); }
    clearTeamStageEffects(team){
        const teamPlayers=this.getTeamPlayers(team);
        this.game.constraints=this.game.constraints.filter(c=>!teamPlayers.includes(c.bodyA)&&!teamPlayers.includes(c.bodyB));
        teamPlayers.forEach(p=>p.removeShield());
    }
    applyCampaignStage(team,stage){
        if(!this.game.levelHandler.currentLevel.stageMeta) return;
        const meta=this.game.levelHandler.currentLevel.stageMeta[team]&&this.game.levelHandler.currentLevel.stageMeta[team][stage];
        const spawn=this.game.levelHandler.currentLevel.spawnByTeam&&this.game.levelHandler.currentLevel.spawnByTeam[team]&&this.game.levelHandler.currentLevel.spawnByTeam[team][stage];
        if(!meta||!spawn) return;
        const players=this.getTeamPlayers(team);
        this.clearTeamStageEffects(team);
        players.forEach((p,i)=>{
            p.campaignStage=stage; p.dead=false; p.ready=false; p.body.isStatic=false;
            Matter.Body.setPosition(p.body,v(spawn.x*50,spawn.y*50-(i*48)));
            Matter.Body.setVelocity(p.body,v(0,0));
        });
        if(meta.bindPlayers && players.length>1) this.game.bindPlayers(players);
        if(meta.shieldRule && players.length){
            const bearer=players.slice().sort((a,b)=>a.body.id-b.body.id)[0];
            bearer.hasShield[meta.shieldRule.direction||4]=true;
        }
    }
    beginMatch(){
        this.matchStarted=true; this.matchWinner=null; this.progress={team1:1,team2:1}; this.finished={team1:false,team2:false};
        if(this.mode==='versus'){
            this.applyCampaignStage('team1',1); this.applyCampaignStage('team2',1);
            this.broadcast(JSON.stringify({campaignState:this.getLobbyState()}));
        }
        this.broadcastLobby();
    }
    completeStage(team,stage){
        if(this.mode!=='versus'||this.matchWinner||this.finished[team]) return;
        if(stage!==this.progress[team]) return;
        if(stage>=5){
            this.finished[team]=true; this.matchWinner=team;
            this.broadcastLobby();
            this.broadcast(JSON.stringify({matchWinner:team,campaignState:this.getLobbyState()}));
            return;
        }
        this.progress[team]=stage+1;
        this.applyCampaignStage(team,stage+1);
        this.broadcastLobby();
        this.broadcast(JSON.stringify({campaignAdvance:{team,stage:stage+1},campaignState:this.getLobbyState()}));
    }
    updateClients() {
        this.connections.forEach(conn=>{
            if(conn.fullyConnected) conn.send(JSON.stringify({playerData:this.getPlayersData(),syncData:this.game.syncHandler.getSyncData(),lobbyState:this.getLobbyState()}));
        });
    }
    getPlayersData() { return this.game.players.filter(p=>!p.observer).map(p=>this.getPlayerData(p)); }
    getPlayerData(p) { return parsePlayerData(p); }
}
