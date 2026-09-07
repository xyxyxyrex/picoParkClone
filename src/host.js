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
        this.hostRole = this.mode === "versus" ? "team1" : "player";
        this.scores = {team1:0, team2:0};
    }
    init() {
        this.recycleJoinConn();
        setInterval(()=>{
            if (window.hostConnection && !(this.roomJoinOnline || this.opening)) this.recycleJoinConn();
        }, 1000);
        setTimeout(()=>this.broadcastLobby(), 200);
    }
    broadcast(data) {
        this.connections.forEach(conn=>{ if(conn.fullyConnected) conn.send(data); });
    }
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
        this.joinConn.e.onDisconnection = ()=>{
            this.roomJoinOnline = false;
            this.recycleJoinConn();
        };
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
            if(d.setUsername){
                connection.clientUsername=String(d.setUsername||"Player").slice(0,18);
                this.broadcastLobby();
            }
            if(d.requestRole) this.requestRole(connection,d.requestRole);
            if(d.player && connection.role !== "observer") {
                connection.player=this.updateClientBody(d.player,connection);
                connection.player.team = connection.role;
                connection.player.username = connection.clientUsername;
            }
        };
        connection.e.onConnection = ()=>{
            const incoming=document.getElementById("incoming");
            if(incoming) incoming.textContent="";
            this.sendTo(connection,{roomConfig:{mode:this.mode},lobbyState:this.getLobbyState()});
        };
        connection.e.onClose = ()=>this.closeConnection(connection);
        this.connections.push(connection);
        return connection;
    }
    getCounts(excludeConn=null) {
        let team1=this.mode==="versus"&&this.hostRole==="team1"?1:0;
        let team2=this.mode==="versus"&&this.hostRole==="team2"?1:0;
        this.connections.forEach(c=>{
            if(c===excludeConn) return;
            if(c.role==="team1") team1++;
            if(c.role==="team2") team2++;
        });
        return {team1,team2};
    }
    canJoinRole(conn, role) {
        if(this.mode!=="versus") return role==="player";
        if(role==="observer") return true;
        if(role!=="team1"&&role!=="team2") return false;
        const counts=this.getCounts(conn);
        const other=role==="team1"?counts.team2:counts.team1;
        const target=role==="team1"?counts.team1:counts.team2;
        return target <= other;
    }
    requestRole(conn, role) {
        if(!this.canJoinRole(conn,role)){
            this.sendTo(conn,{roleResult:{ok:false,role:conn.role,message:"That team already has more players. Join the smaller team or observe."},lobbyState:this.getLobbyState()});
            return;
        }
        const oldRole=conn.role;
        conn.role=role;
        if(role==="observer" && conn.player){ conn.player.unload(); conn.player=null; }
        if(oldRole==="observer" && role!=="observer") conn.player=null;
        this.sendTo(conn,{roleResult:{ok:true,role},lobbyState:this.getLobbyState()});
        this.broadcastLobby();
    }
    getLobbyState() {
        const members=[{id:"host",username:this.username,role:this.hostRole,isHost:true}];
        this.connections.forEach((c,i)=>members.push({id:c.selfId||`guest-${i}`,username:c.clientUsername||"Player",role:c.role,isHost:false}));
        return {mode:this.mode,members,scores:this.scores,counts:this.getCounts()};
    }
    broadcastLobby() {
        const state=this.getLobbyState();
        if(window.renderLobbyState) renderLobbyState(state);
        this.broadcast(JSON.stringify({lobbyState:state,roomConfig:{mode:this.mode}}));
    }
    updateClientBody(data, conn) {
        const findPlayerById=id=>this.game.players.find(player=>player.body.id==id);
        let foundPlayer=findPlayerById(data.id);
        if(foundPlayer==undefined){
            foundPlayer=mainGame.playerhandler.addPlayer({bodyOptions:{id:data.id},color:this.game.fetchColor()});
            foundPlayer.onlinePlayer=true;
        }
        conn.clientBody=foundPlayer;
        foundPlayer.conn=conn;
        foundPlayer.keys=data.keys;
        foundPlayer.team=conn.role;
        foundPlayer.username=conn.clientUsername;
        return foundPlayer;
    }
    updateClients() {
        this.connections.forEach(conn=>{
            if(conn.fullyConnected) conn.send(JSON.stringify({playerData:this.getPlayersData(),syncData:this.game.syncHandler.getSyncData(),lobbyState:this.getLobbyState()}));
        });
    }
    getPlayersData() { return this.game.players.filter(p=>!p.observer).map(p=>this.getPlayerData(p)); }
    getPlayerData(p) { return parsePlayerData(p); }
}
