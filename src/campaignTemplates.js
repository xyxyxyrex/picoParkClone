/*
 * Tiny Park campaign templates.
 *
 * These are intentionally data-driven. Change CAMPAIGN_TEMPLATE_CONFIG to tune
 * geometry without touching networking/physics code. Every builder accepts a
 * player count from 1..6 and returns plain data so the same template can be
 * previewed in the level editor or instantiated by the game runtime.
 */
(function(){
  const clampCount=n=>Math.max(1,Math.min(6,Number(n)||1));
  const blank=(w,h)=>Array.from({length:h},()=>Array(w).fill(0));
  const fill=(map,x,y,w,h,value=1)=>{
    for(let yy=Math.max(0,y);yy<Math.min(map.length,y+h);yy++)
      for(let xx=Math.max(0,x);xx<Math.min(map[0].length,x+w);xx++) map[yy][xx]=value;
  };
  const clear=(map,x,y,w,h)=>fill(map,x,y,w,h,0);
  const makeBase=(w,h)=>{
    const map=blank(w,h);
    fill(map,0,0,1,h,1);fill(map,w-1,0,1,h,1);
    fill(map,0,h-2,w,2,1);
    return map;
  };
  const pos=(x,y)=>({x,y});

  const CAMPAIGN_TEMPLATE_CONFIG={
    level1:{name:'Stack School',baseWidth:22,height:13,wallX:8},
    level2:{name:'Tether Trouble',baseWidth:27,height:13,firstGapX:7},
    level3:{name:'Shield Relay',baseWidth:29,height:13,laserStartX:20},
    level4:{name:'Hold The Line',baseWidth:31,height:13,gateX:14},
    level5:{name:'Final Exam',baseWidth:38,height:14,gateX:24}
  };

  function baseStage(id,n,w,h){
    return {id,name:CAMPAIGN_TEMPLATE_CONFIG[id].name,playerCount:n,width:w,height:h,map:makeBase(w,h),blocks:[],lasers:[],buttons:[],keys:[],doors:[],jumppads:[],boundaries:[],bindPlayers:false,shieldRule:null,spawn:pos(2,h-3),description:''};
  }

  function level1(rawCount){
    const n=clampCount(rawCount),c=CAMPAIGN_TEMPLATE_CONFIG.level1;
    const w=c.baseWidth+n*2,h=c.height,g=h-2,s=baseStage('level1',n,w,h);
    const wallX=c.wallX+Math.floor(n/3),wallHeight=n===1?2:Math.min(n,2+Math.ceil(n/2));
    fill(s.map,wallX,g-wallHeight,2,wallHeight,1);fill(s.map,wallX,g-wallHeight,5,1,1);
    if(n===1)fill(s.map,wallX-2,g-1,1,1,1);
    s.keys.push({pos:pos(wallX+4,g-wallHeight-1)});s.doors.push({pos:pos(w-3,g),acceptsKey:true,checkpoint:true});
    s.description=`Stack to the key. The ledge rises with party size (${n}P).`;return s;
  }

  function level2(rawCount){
    const n=clampCount(rawCount),c=CAMPAIGN_TEMPLATE_CONFIG.level2;
    const w=c.baseWidth+n*2,h=c.height,g=h-2,s=baseStage('level2',n,w,h);
    const gap1=2+Math.floor((n-1)/2),gap2=2+Math.floor(n/3),x1=c.firstGapX,x2=x1+gap1+7;
    clear(s.map,x1,g,gap1,2);clear(s.map,x2,g,gap2,2);fill(s.map,x1+gap1+2,g-2,3,1,1);fill(s.map,x2+gap2+3,0,2,5+Math.floor(n/3),1);
    s.bindPlayers=n>1;if(n===1)s.jumppads.push(pos(x1-1,g+1),pos(x2-1,g+1));
    s.keys.push({pos:pos(w-7,g-3)});s.doors.push({pos:pos(w-3,g),acceptsKey:true,checkpoint:true});
    s.description=`Cross ${gap1}/${gap2}-tile pits while tethered. Geometry expands with ${n}P.`;return s;
  }

  function level3(rawCount){
    const n=clampCount(rawCount),c=CAMPAIGN_TEMPLATE_CONFIG.level3;
    const w=c.baseWidth+n,h=c.height,g=h-2,s=baseStage('level3',n,w,h),laserX=Math.min(w-8,c.laserStartX+Math.floor(n/2));
    fill(s.map,9,g-7,laserX-7,1,1);fill(s.map,9,g-6,1,4,1);
    s.lasers.push({pos:pos(laserX,g-3),angle:2});
    // Laser angle 2 projects left, so the bearer needs the shield on their right/front side (shield direction 2 in the physics model).
    s.shieldRule={type:'onePerTeam',direction:2};
    s.keys.push({pos:pos(laserX+3,g-3)});s.doors.push({pos:pos(w-3,g),acceptsKey:true,checkpoint:true});
    s.description='One teammate receives a right-facing shield and must escort the group through the beam.';return s;
  }

  function level4(rawCount){
    const n=clampCount(rawCount),c=CAMPAIGN_TEMPLATE_CONFIG.level4;
    const w=c.baseWidth+n,h=c.height,g=h-2,s=baseStage('level4',n,w,h),gateX=c.gateX;
    fill(s.map,gateX-1,0,3,g-4,1);
    s.doors.push({id:'hold-gate',pos:pos(gateX,g),acceptsKey:false,checkpoint:false,blocking:true,gate:true});
    s.buttons.push({id:'near-switch',pos:pos(gateX-5,g-1),gateId:'hold-gate',mode:'any'});
    if(n>1)s.buttons.push({id:'far-switch',pos:pos(gateX+5,g-1),gateId:'hold-gate',mode:'any'});else s.blocks.push({pos:pos(gateX-8,g-1),size:pos(1,1),minPlayers:1});
    s.keys.push({pos:pos(w-8,g-3)});s.doors.push({pos:pos(w-3,g),acceptsKey:true,checkpoint:true});
    s.description=n>1?'Leave one player on the near switch, hand the hold to the far switch, then regroup.':'Push the weight onto the switch so the single-player lane remains solvable.';return s;
  }

  function level5(rawCount){
    const n=clampCount(rawCount),c=CAMPAIGN_TEMPLATE_CONFIG.level5;
    const w=c.baseWidth+n*2,h=c.height,g=h-2,s=baseStage('level5',n,w,h),gap=2+Math.floor(n/3),gateX=c.gateX+Math.floor(n/2);
    clear(s.map,8,g,gap,2);clear(s.map,15+gap,g,Math.max(2,gap-1),2);if(n===1)s.jumppads.push(pos(7,g+1),pos(14+gap,g+1));
    s.blocks.push({pos:pos(12+gap,g-2),size:pos(Math.max(1,Math.ceil(n/2)),1),minPlayers:Math.max(1,Math.ceil(n/2))});
    s.lasers.push({pos:pos(gateX-3,g-3),angle:2});s.shieldRule={type:'onePerTeam',direction:2};
    fill(s.map,gateX-1,0,3,g-5,1);s.doors.push({id:'final-gate',pos:pos(gateX,g),acceptsKey:false,checkpoint:false,blocking:true,gate:true});
    const required=n===1?1:2;s.buttons.push({id:'final-a',pos:pos(gateX-7,g-1),gateId:'final-gate',mode:'all',required});if(required===2)s.buttons.push({id:'final-b',pos:pos(gateX-4,g-1),gateId:'final-gate',mode:'all',required});
    const stackHeight=n===1?2:Math.min(n,2+Math.floor(n/2));fill(s.map,w-11,g-stackHeight,3,stackHeight,1);
    s.keys.push({pos:pos(w-9,g-stackHeight-1)});s.doors.push({pos:pos(w-3,g),acceptsKey:true,checkpoint:true,finish:true});
    s.description='Final exam: pits, a weighted block, shielded laser crossing, simultaneous switches, then a last stack to the key.';return s;
  }

  const builders={level1,level2,level3,level4,level5};
  function buildStage(idOrNumber,count){if(window.parkCampaign && window.ParkData){const n=clampCount(count),r=Number(String(idOrNumber).replace('level',''))-1;return ParkData.blueprint(window.parkCampaign.variants[n][r],`level${r+1}`);}const id=String(idOrNumber).startsWith('level')?String(idOrNumber):`level${idOrNumber}`;if(!builders[id])throw new Error(`Unknown campaign stage: ${id}`);return builders[id](count);}
  function offsetBlueprint(stage,ox,oy,team,stageNumber){
    const move=p=>pos(p.x+ox,p.y+oy);
    return {...stage,team,stageNumber,offset:pos(ox,oy),spawn:move(stage.spawn),blocks:stage.blocks.map(b=>({...b,pos:move(b.pos)})),lasers:stage.lasers.map(l=>({...l,pos:move(l.pos),team,stage:stageNumber})),buttons:stage.buttons.map(b=>({...b,pos:move(b.pos),id:`${team}-s${stageNumber}-${b.id}`,gateId:b.gateId?`${team}-s${stageNumber}-${b.gateId}`:null,team,stage:stageNumber})),keys:stage.keys.map(k=>({...k,pos:move(k.pos),team,stage:stageNumber})),doors:stage.doors.map(d=>({...d,pos:move(d.pos),id:d.id?`${team}-s${stageNumber}-${d.id}`:`${team}-s${stageNumber}-exit`,team,stage:stageNumber,campaignStage:d.checkpoint?stageNumber:null})),jumppads:stage.jumppads.map(move),boundaries:(stage.boundaries||[]).map(b=>({...b,pos:move(b.pos)}))};
  }
  function buildVersusCampaign(teamCounts){
    const t1=clampCount(teamCounts&&teamCounts.team1),t2=clampCount(teamCounts&&teamCounts.team2),s1=[1,2,3,4,5].map(i=>buildStage(i,t1)),s2=[1,2,3,4,5].map(i=>buildStage(i,t2));
    const stageWidths=s1.map((s,i)=>Math.max(s.width,s2[i].width)),xOffsets=[];let cursor=0;stageWidths.forEach(w=>{xOffsets.push(cursor);cursor+=w+5;});
    const laneHeight=Math.max(...s1.map(s=>s.height),...s2.map(s=>s.height))+4,team2Y=laneHeight,totalH=laneHeight*2-4,totalW=cursor-5,map=blank(totalW,totalH),all={blocks:[],lasers:[],buttons:[],keys:[],doors:[],jumppads:[],boundaries:[]},spawns={team1:{},team2:{}},stageMeta={team1:{},team2:{}};
    function merge(team,stages,yOffset){stages.forEach((stage,index)=>{const sn=index+1,ox=xOffsets[index];for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++)if(stage.map[y][x])map[y+yOffset][x+ox]=stage.map[y][x];const moved=offsetBlueprint(stage,ox,yOffset,team,sn);['blocks','lasers','buttons','keys','doors','jumppads','boundaries'].forEach(k=>all[k].push(...moved[k]));spawns[team][sn]=moved.spawn;stageMeta[team][sn]={bindPlayers:stage.bindPlayers,shieldRule:stage.shieldRule,shields:stage.shields||[],name:stage.name,description:stage.description,bounds:{x:ox,y:yOffset,w:stage.width,h:stage.height}};});}
    merge('team1',s1,0);merge('team2',s2,team2Y);
    return {id:'versusCampaign',name:'Five-Level Versus Campaign',campaign:true,width:totalW,height:totalH,map,...all,playersBinded:false,playersHaveShields:[],spawnByTeam:spawns,stageMeta,teamCounts:{team1:t1,team2:t2}};
  }
  function toEditorProject(stageNumber,count){
    const stage=buildStage(stageNumber,count),grid=Array.from({length:stage.width},()=>Array(stage.height).fill('0'));
    for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++)if(stage.map[y][x])grid[x][y]='1';
    stage.keys.forEach(k=>grid[k.pos.x][k.pos.y]='key');stage.doors.filter(d=>d.checkpoint!==false).forEach(d=>{const x=Math.max(0,Math.min(stage.width-1,d.pos.x-1)),y=Math.max(0,Math.min(stage.height-1,d.pos.y-2));grid[x][y]='door';});
    stage.jumppads.forEach(j=>{const y=Math.max(0,Math.min(stage.height-1,j.y-2));grid[j.x][y]='jumppad';});stage.blocks.forEach(b=>grid[b.pos.x][b.pos.y]=`block|${b.size.x},${b.size.y},${b.minPlayers||0}`);stage.lasers.forEach(l=>grid[l.pos.x][l.pos.y]=`laser|${l.angle}`);stage.buttons.forEach(b=>{if(grid[b.pos.x]&&grid[b.pos.x][b.pos.y])grid[b.pos.x][b.pos.y]='growingButton';});
    return {width:stage.width,height:stage.height,grid,laserRotation:1,playersBinded:stage.bindPlayers,shields:[false,!!stage.shieldRule,false,false],block:{x:1,y:1,min:0},templateId:stage.id,templatePlayers:clampCount(count)};
  }
  window.CAMPAIGN_TEMPLATE_CONFIG=CAMPAIGN_TEMPLATE_CONFIG;window.CampaignTemplates={config:CAMPAIGN_TEMPLATE_CONFIG,buildStage,buildVersusCampaign,toEditorProject,clampCount};
})();
