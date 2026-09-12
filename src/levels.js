/* Dynamic campaign instantiation. Geometry lives in campaignTemplates.js. */
var levels = {};

function tinyParkMode(){
  if(window.hostConnection) return hostConnection.mode;
  if(window.clientConnection) return clientConnection.mode;
  return 'classic';
}

function activePlayerCount(game){
  return Math.max(1,game.players.filter(p=>!p.observer&&!p.unloading).length);
}

function versusCounts(game){
  if(window.hostConnection) return hostConnection.getCounts();
  if(window.clientConnection && clientConnection.lastLobbyState && clientConnection.lastLobbyState.counts) return clientConnection.lastLobbyState.counts;
  return {
    team1:Math.max(1,game.players.filter(p=>!p.observer&&p.team==='team1').length),
    team2:Math.max(1,game.players.filter(p=>!p.observer&&p.team==='team2').length)
  };
}

function stableNumericId(text){
  let h=2166136261;
  for(let i=0;i<String(text).length;i++){h^=String(text).charCodeAt(i);h=Math.imul(h,16777619);}
  return Math.abs(h>>>0)+100000;
}

function instantiateBlueprint(blueprint,nextLevel=null){
  const doorMap={};
  const doors=(blueprint.doors||[]).map((desc,index)=>{
    const door=new Door(v(desc.pos.x,desc.pos.y),{
      nextLevel:desc.checkpoint===false?null:nextLevel,
      acceptsKey:desc.acceptsKey!==false,
      checkpoint:desc.checkpoint!==false,
      blocking:!!desc.blocking,
      gate:!!desc.gate,
      team:desc.team||null,
      stage:desc.stage||null,
      campaignStage:desc.campaignStage||null,
      finish:!!desc.finish
      ,open:!!desc.open
    });
    door.templateId=desc.id||`${blueprint.id||blueprint.name||'level'}-door-${index}`;
    door.id=stableNumericId(door.templateId);
    doorMap[door.templateId]=door;
    return door;
  });

  const buttons=(blueprint.buttons||[]).map(desc=>{
    const gate=desc.gateId?doorMap[desc.gateId]:null;
    if(gate && !gate._pressedSwitches) gate._pressedSwitches=new Set();
    const refresh=()=>{
      if(!gate) return;
      const needed=desc.mode==='all'?Math.max(1,desc.required||1):1;
      gate.setOpen(gate._pressedSwitches.size>=needed);
    };
    const button=new Button(v(desc.pos.x,desc.pos.y),{
      onPlayer:e=>{if(e.player&&(desc.kind==='grow'||desc.kind==='shrink'))e.player.setScale(Math.max(.5,Math.min(2,e.player.scale+(desc.kind==='grow'?.0075:-.0075))));},
      onPress:()=>{if(gate){gate._pressedSwitches.add(desc.id);refresh();}},
      onUnpress:()=>{if(gate){gate._pressedSwitches.delete(desc.id);refresh();}}
    });
    button.team=desc.team||null;button.stage=desc.stage||null;button.templateId=desc.id||null;
    return button;
  });

  return {
    name:blueprint.name||blueprint.id,
    campaign:!!blueprint.campaign,
    map:blueprint.map,
    playersBinded:!!blueprint.bindPlayers,
    playersHaveShields:blueprint.shields||[],
    shieldRule:blueprint.shieldRule||null,
    spawn:blueprint.spawn||null,
    spawnByTeam:blueprint.spawnByTeam||null,
    stageMeta:blueprint.stageMeta||null,
    teamCounts:blueprint.teamCounts||null,
    buttons,
    keys:(blueprint.keys||[]).map(k=>({pos:v(k.pos.x,k.pos.y),team:k.team||null,stage:k.stage||null})),
    blocks:(blueprint.blocks||[]).map(b=>({pos:v(b.pos.x,b.pos.y),size:v(b.size.x,b.size.y),minPlayers:b.minPlayers||0,static:!!b.static})),
    lasers:(blueprint.lasers||[]).map(l=>({pos:v(l.pos.x,l.pos.y),angle:l.angle,enabled:l.enabled!==false,team:l.team||null,stage:l.stage||null})),
    jumppads:(blueprint.jumppads||[]).map(j=>v(j.x,j.y)),
    boundaries:(blueprint.boundaries||[]).map(b=>({pos:v(b.pos.x,b.pos.y),size:v(b.size.x,b.size.y)})),
    doors
  };
}

function resolveGameLevel(name,game){
  if(game.options.team){
    const stage=game.options.stage||1, team=game.options.team;
    const bp=CampaignTemplates.buildStage(stage,game.options.playerCount);
    bp.doors.forEach(d=>{d.team=team;d.campaignStage=stage;});
    (bp.keys||[]).forEach(k=>{k.team=team;k.stage=stage;});
    return instantiateBlueprint(bp,null);
  }
  if(name==='tempLevel' && levels.tempLevel) return levels.tempLevel;
  if(name==='one') name=tinyParkMode()==='versus'?'versusCampaign':'level1';

  if(name==='versusCampaign'){
    const bp=CampaignTemplates.buildVersusCampaign(versusCounts(game));
    return instantiateBlueprint(bp,null);
  }

  const match=/^level([1-5])$/.exec(name);
  if(match){
    const stage=Number(match[1]);
    const bp=CampaignTemplates.buildStage(stage,activePlayerCount(game));
    const next=stage<5?`level${stage+1}`:'level1';
    return instantiateBlueprint(bp,next);
  }

  return levels[name];
}
