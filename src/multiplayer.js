class Connection {
  constructor(id=null, debug=false) {
    this.lastPeerId = null;
    this.peer = null;
    this.peerId = null;
    this.conn = null;
    this.vanityId = id;
    this.e = {connection:this,onConnection:()=>{},onOpening:()=>{},onDisconnection:()=>{},onData:()=>{},onConnectionFail:()=>{},onClose:()=>{}};
    this.send = d => { if (this.conn && this.conn.open) this.conn.send(d); };
    this.online = false;
    this.joining = undefined;
    this.debug = debug;
  }
  log(c) { if(this.debug) console.log(c); }
  initialize(id=null) {
    this.joining = id;
    this.peer = new Peer(this.vanityId, {debug:2});
    this.peer.connection = this;
    this.peer.on("open", function(id) {
      if (this.id === null) this.id = this.connection.lastPeerId;
      else this.connection.lastPeerId = this.id;
      if (this.connection.joining) this.connection.join(this.connection.joining);
      this.connection.log("Awaiting connection "+this.connection.lastPeerId);
      this.connection.e.onOpening();
    });
    this.peer.on("connection", function(c) {
      this.connection.online = true;
      if (this.connection.conn && this.connection.conn.open) {
        c.on("open", function(){ c.send("Already connected to another client"); setTimeout(()=>c.close(),500); });
        return;
      }
      this.connection.conn = c;
      this.connection.conn.connection = this.connection;
      this.connection.e.onConnection();
      this.connection.ready();
    });
    this.peer.on("destroyed", function(){ this.connection.online=false; this.connection.e.onDisconnection("destroy"); });
    this.peer.on("disconnected", function(){
      this.connection.e.onDisconnection("disconnected"); this.connection.online=false;
      this.id=this.connection.lastPeerId; this._lastServerId=this.connection.lastPeerId; this.reconnect();
    });
    this.peer.on("close", function(){ this.connection.e.onClose(); this.connection.conn=null; this.connection.online=false; });
    this.peer.on("error", function(err){ this.connection.e.onConnectionFail(err); this.connection.online=false; console.error("peer err",err); });
  }
  ready() {
    this.conn.on("data", function(data){ this.connection.e.onData(data); });
    this.conn.on("close", function(){ this.connection.online=false; this.connection.e.onClose(); this.conn=null; });
  }
  join(id) {
    this.conn = this.peer.connect(id,{reliable:true});
    this.conn.connection=this;
    this.conn.on("open", function(){ this.connection.e.onConnection(); });
  }
}

class Connection2W {
  constructor() {
    this.connS2T=null; this.connT2S=null; this.selfId=null; this.fullyConnected=false; this.lastPing=0;
    this.e={connection:this,onConnection:()=>{},onOpening:()=>{},onDisconnection:()=>{},onData:()=>{},onConnectionFail:()=>{},onClose:()=>{}};
  }
  connectionEvents(conn){ conn.e.onDisconnection=e=>{this.fullyConnected=false;this.e.onDisconnection(e);}; }
  open(id=null,twC=false){
    this.selfId=id; this.connS2T=new Connection(id); this.connS2T.twC=this; this.connectionEvents(this.connS2T); this.connS2T.initialize();
    this.connS2T.e.onOpening=function(){ this.connection.twC.selfId=this.connection.lastPeerId; this.connection.twC.e.onOpening(); };
    if(twC) this.connS2T.e.onConnection=function(){ this.connection.twC.fullyConnected=true; this.connection.twC.e.onConnection(); };
    this.connS2T.e.onData=function(d){ this.connection.twC.processData(d); };
    this.connS2T.e.onClose=()=>this.e.onClose();
  }
  connect(id,twC=false){
    this.connT2S=new Connection(); this.connT2S.twC=this; this.connectionEvents(this.connT2S); this.connT2S.initialize(id);
    if(!twC){
      this.connT2S.e.onConnection=function(){
        this.connection.twC.open(null,true);
        this.connection.twC.connS2T.e.onOpening=function(){
          const newId=this.connection.twC.connS2T.lastPeerId;
          this.connection.twC.connT2S.send(JSON.stringify({connectToNow:newId,content:JSON.stringify({})}));
        };
      };
    } else this.connT2S.e.onConnection=function(){ this.connection.twC.fullyConnected=true; this.connection.twC.e.onConnection(); };
    this.connT2S.e.onConnectionFail=()=>this.e.onConnectionFail();
    this.connT2S.e.onClose=()=>this.e.onClose();
  }
  terminate(twC=false){
    if(!twC) this.send(JSON.stringify({terminate:true}),true);
    setTimeout(()=>{ if(this.connT2S&&this.connT2S.peer) this.connT2S.peer.destroy(); },500);
    setTimeout(()=>{ if(this.connS2T&&this.connS2T.peer) this.connS2T.peer.destroy(); },500);
    this.e.onDisconnection("terminated");
  }
  processData(d){
    d=JSON.parse(d);
    if(d.ping) this.lastPing=((this.lastPing*10)+((new Date()).getTime()-d.ping))/11;
    if(d.connectToNow) this.connect(d.connectToNow,true);
    if(d.terminate) this.terminate(true);
    else this.e.onData(d.content,d);
  }
  send(d,raw=false){
    if(this.fullyConnected&&this.connT2S) this.connT2S.send(raw?d:JSON.stringify({content:d,ping:(new Date()).getTime()}));
  }
}

function parsePlayerData(player) {
  return {
    position:player.body.position,
    id:player.body.id,
    direction:player.direction,
    keys:player.keys,
    frame:player.frame,
    color:player.color,
    scale:player.scale,
    ready:player.ready,
    shields:player.hasShield,
    dead:player.dead,
    team:player.team || null,
    username:player.username || "Player"
  };
}

function setPlayerWithData(player,data,updatePhysics=true) {
  if(updatePhysics) { Matter.Body.setPosition(player.body,data.position); player.direction=data.direction; }
  if(!window.hostConnection) player.updateKeys(data.keys||{});
  player.color=data.color; player.frame=data.frame; player.ready=data.ready; player.hasShield=data.shields; player.dead=data.dead;
  player.team=data.team||null; player.username=data.username||player.username||"Player";
  player.setScale(data.scale);
}
