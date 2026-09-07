const canvas=document.getElementById('myCanvas');
const ctx=canvas.getContext('2d');
const CELL=32;
let width=20,height=10,zoom=1;
let grid=[];
let selected='1';
let paintMode='paint';
let mouseDown=false;
let laserRotation=1;
let undoStack=[];
let redoStack=[];
let lastPaintKey='';

const tileNames={
  '1':'Wall','0':'Erase','door':'Door','key':'Key','jumppad':'Jump Pad',
  growingButton:'Grow Button',shrinkingButton:'Shrink Button',block:'Block',laser:'Laser'
};
const tileColors={
  '1':'#55b86b','0':'#0b0d12',door:'#9b6834',key:'#e2bd42',jumppad:'#70ff51',
  growingButton:'#ff5aa7',shrinkingButton:'#d64cff',block:'#9b532e',laser:'#ff4d4d'
};
const shortcuts={a:'1',z:'0',d:'door',k:'key',j:'jumppad',g:'growingButton',s:'shrinkingButton',b:'block',l:'laser'};

function newGrid(w=width,h=height){
  return Array.from({length:w},(_,x)=>Array.from({length:h},(_,y)=>y===h-1?'1':'0'));
}
function cloneGrid(g=grid){ return g.map(col=>[...col]); }
function stateSnapshot(){
  return {
    width,height,grid:cloneGrid(),laserRotation,
    playersBinded:document.getElementById('playersBinded').checked,
    shields:['sT','sB','sL','sR'].map(id=>document.getElementById(id).checked),
    block:{x:+document.getElementById('blockX').value||1,y:+document.getElementById('blockY').value||1,min:+document.getElementById('requiredPlayers').value||0}
  };
}
function pushHistory(){
  undoStack.push(stateSnapshot());
  if(undoStack.length>60) undoStack.shift();
  redoStack=[];
  updateHistoryButtons();
}
function restoreState(s){
  if(!s) return;
  width=s.width;height=s.height;grid=s.grid.map(c=>[...c]);laserRotation=s.laserRotation||1;
  document.getElementById('levelX').value=width;
  document.getElementById('levelY').value=height;
  document.getElementById('laserRotation').textContent=laserRotation;
  document.getElementById('playersBinded').checked=!!s.playersBinded;
  ['sT','sB','sL','sR'].forEach((id,i)=>document.getElementById(id).checked=!!(s.shields||[])[i]);
  if(s.block){
    document.getElementById('blockX').value=s.block.x||1;
    document.getElementById('blockY').value=s.block.y||1;
    document.getElementById('requiredPlayers').value=s.block.min||0;
  }
  resizeCanvas();
  draw();
}
function undo(){
  if(!undoStack.length) return;
  redoStack.push(stateSnapshot());
  restoreState(undoStack.pop());
  updateHistoryButtons();
}
function redo(){
  if(!redoStack.length) return;
  undoStack.push(stateSnapshot());
  restoreState(redoStack.pop());
  updateHistoryButtons();
}
function updateHistoryButtons(){
  document.getElementById('undoBtn').disabled=!undoStack.length;
  document.getElementById('redoBtn').disabled=!redoStack.length;
}

function resizeCanvas(){
  canvas.width=width*CELL;
  canvas.height=height*CELL;
  canvas.style.width=`${width*CELL*zoom}px`;
  canvas.style.height=`${height*CELL*zoom}px`;
  canvas.style.transformOrigin='top left';
}
function setZoom(next){
  zoom=Math.max(.5,Math.min(2,next));
  resizeCanvas();
  document.getElementById('zoomLabel').textContent=`${Math.round(zoom*100)}%`;
  draw();
}

function parseTile(tile){
  const [type,args='']=String(tile).split('|');
  return {type,args};
}
function currentTile(){
  if(selected==='block'){
    const x=Math.max(1,+document.getElementById('blockX').value||1);
    const y=Math.max(1,+document.getElementById('blockY').value||1);
    const min=Math.max(0,+document.getElementById('requiredPlayers').value||0);
    return `block|${x},${y},${min}`;
  }
  if(selected==='laser') return `laser|${laserRotation}`;
  return selected;
}
function chooseTile(type){
  selected=type;
  document.querySelectorAll('[data-tile]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tile===type));
  document.getElementById('selectedTile').textContent=`Selected: ${tileNames[type]||type}`;
}
function setPaintMode(mode){
  paintMode=mode;
  document.getElementById('paintMode').classList.toggle('active',mode==='paint');
  document.getElementById('fillMode').classList.toggle('active',mode==='fill');
}
function rotateLaser(){
  laserRotation=(laserRotation%4)+1;
  document.getElementById('laserRotation').textContent=laserRotation;
  if(selected==='laser') document.getElementById('selectedTile').textContent=`Selected: Laser · Dir ${laserRotation}`;
}

function drawGridLines(){
  ctx.strokeStyle='rgba(255,255,255,.12)';
  ctx.lineWidth=1;
  for(let x=0;x<=width;x++){ctx.beginPath();ctx.moveTo(x*CELL+.5,0);ctx.lineTo(x*CELL+.5,height*CELL);ctx.stroke();}
  for(let y=0;y<=height;y++){ctx.beginPath();ctx.moveTo(0,y*CELL+.5);ctx.lineTo(width*CELL,y*CELL+.5);ctx.stroke();}
}
function drawTile(x,y,tile){
  const {type,args}=parseTile(tile);
  if(type==='0') return;
  ctx.fillStyle=tileColors[type]||'#888';
  let w=1,h=1;
  if(type==='block'){
    const parts=args.split(',').map(Number);w=parts[0]||1;h=parts[1]||1;
  }
  ctx.fillRect(x*CELL+2,y*CELL+2,w*CELL-4,h*CELL-4);
  ctx.strokeStyle='#07080d';ctx.lineWidth=2;ctx.strokeRect(x*CELL+4,y*CELL+4,w*CELL-8,h*CELL-8);
  ctx.fillStyle='#111';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  const labels={door:'D',key:'K',jumppad:'J',growingButton:'G+',shrinkingButton:'S-',block:'B',laser:'L'};
  if(labels[type]) ctx.fillText(labels[type],x*CELL+(w*CELL/2),y*CELL+(h*CELL/2));
  if(type==='block'){
    const min=Number(args.split(',')[2]||0);
    ctx.fillStyle='#fff';ctx.font='9px monospace';ctx.fillText(`${w}x${h} / ${min}P`,x*CELL+(w*CELL/2),y*CELL+(h*CELL/2)+11);
  }
  if(type==='laser'){
    const dir=Number(args||1);
    const angle=dir*Math.PI*.5;
    const cx=x*CELL+CELL/2,cy=y*CELL+CELL/2;
    ctx.strokeStyle='#ffb0b0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(angle)*22,cy+Math.sin(angle)*22);ctx.stroke();
  }
}
function draw(){
  ctx.fillStyle='#0b0d12';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let x=0;x<width;x++) for(let y=0;y<height;y++) drawTile(x,y,grid[x][y]);
  drawGridLines();
}

function pointFromEvent(e){
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-rect.left)/(CELL*zoom));
  const y=Math.floor((e.clientY-rect.top)/(CELL*zoom));
  return {x,y,valid:x>=0&&x<width&&y>=0&&y<height};
}
function paintAt(x,y,tile=currentTile(),record=true){
  if(x<0||x>=width||y<0||y>=height) return;
  const key=`${x},${y},${tile}`;
  if(lastPaintKey===key) return;
  if(record) pushHistory();
  grid[x][y]=tile;
  lastPaintKey=key;
  draw();
}
function floodFill(x,y,replacement){
  if(x<0||x>=width||y<0||y>=height) return;
  const target=grid[x][y];
  if(target===replacement) return;
  pushHistory();
  const q=[[x,y]],seen=new Set();
  while(q.length){
    const [cx,cy]=q.pop(),k=`${cx},${cy}`;
    if(seen.has(k)||cx<0||cy<0||cx>=width||cy>=height||grid[cx][cy]!==target) continue;
    seen.add(k);grid[cx][cy]=replacement;
    q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
  draw();
}

function applyResize(){
  const nw=Math.max(5,Math.min(80,+document.getElementById('levelX').value||width));
  const nh=Math.max(5,Math.min(50,+document.getElementById('levelY').value||height));
  if(nw===width&&nh===height) return;
  pushHistory();
  const next=Array.from({length:nw},()=>Array.from({length:nh},()=> '0'));
  for(let x=0;x<Math.min(width,nw);x++) for(let y=0;y<Math.min(height,nh);y++) next[x][y]=grid[x][y];
  width=nw;height=nh;grid=next;resizeCanvas();draw();toast('Canvas resized. Existing cells were preserved.');
}
function clearLevel(){
  pushHistory();grid=Array.from({length:width},()=>Array.from({length:height},()=> '0'));draw();
}
function addFloor(){
  pushHistory();for(let x=0;x<width;x++) grid[x][height-1]='1';draw();
}

function projectData(){ return {...stateSnapshot(),version:2,name:'Tiny Park Custom Level'}; }
function saveDraft(){ localStorage.setItem('tinyParkEditorDraft',JSON.stringify(projectData()));toast('Draft saved locally.'); }
function loadDraft(){
  const raw=localStorage.getItem('tinyParkEditorDraft');
  if(!raw) return toast('No saved draft found.',true);
  pushHistory();restoreState(JSON.parse(raw));toast('Draft loaded.');
}
function exportProject(){
  const blob=new Blob([JSON.stringify(projectData(),null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tiny-park-level.json';a.click();URL.revokeObjectURL(a.href);
}
function importProjectFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{const data=JSON.parse(reader.result);pushHistory();restoreState(data);toast('Project imported.');}
    catch(err){toast('Invalid level JSON.',true);}
  };
  reader.readAsText(file);
}

function convert(){
  const map=[];const keys=[],doors=[],blocks=[],gButtons=[],sButtons=[],lasers=[],jumppads=[];
  for(let r=0;r<height;r++){
    map[r]=[];
    for(let t=0;t<width;t++){
      const tile=parseTile(grid[t][r]);
      map[r][t]=tile.type==='1'?1:0;
      switch(tile.type){
        case 'door':doors.push({x:t+1,y:r+2});break;
        case 'jumppad':jumppads.push({x:t,y:r+2});break;
        case 'key':keys.push({x:t,y:r});break;
        case 'growingButton':gButtons.push({x:t,y:r});break;
        case 'shrinkingButton':sButtons.push({x:t,y:r});break;
        case 'block':{
          const [x,y,min]=tile.args.split(',').map(Number);
          blocks.push({x:t,y:r,w:x||1,h:y||1,min:min||0});break;
        }
        case 'laser':lasers.push({x:t,y:r,angle:Number(tile.args)||1});break;
      }
    }
  }
  const mapString=map.map(row=>`[${row.join(',')}]`).join(',');
  const jp=jumppads.map(k=>`v(${k.x},${k.y}),`).join('');
  const keyString=keys.map(k=>`v(${k.x},${k.y}),`).join('');
  const doorString=doors.map(k=>`new Door(v(${k.x},${k.y}),{nextLevel:"tempLevel"}),`).join('');
  const blockString=blocks.map(k=>`{pos:v(${k.x},${k.y}),size:v(${k.w},${k.h}),minPlayers:${k.min}},`).join('');
  const growString=gButtons.map(k=>`new Button(v(${k.x},${k.y}),{onPlayer:(e)=>{e.player.setScale(Math.min(Math.max(e.player.scale+0.0075,0.5),2))}}),`).join('');
  const shrinkString=sButtons.map(k=>`new Button(v(${k.x},${k.y}),{onPlayer:(e)=>{e.player.setScale(Math.min(Math.max(e.player.scale-0.0075,0.5),2))}}),`).join('');
  const laserString=lasers.map(k=>`{pos:v(${k.x},${k.y}),angle:${k.angle}},`).join('');
  const shields=[];
  if(document.getElementById('sT').checked) shields.push(3);
  if(document.getElementById('sB').checked) shields.push(1);
  if(document.getElementById('sL').checked) shields.push(2);
  if(document.getElementById('sR').checked) shields.push(4);
  const template=`"tempName":{jumppads:[${jp}],playersHaveShields:[${shields.join(',')}],playersBinded:${document.getElementById('playersBinded').checked},map:[${mapString}],lasers:[${laserString}],buttons:[${growString}${shrinkString}],keys:[${keyString}],blocks:[${blockString}],doors:[${doorString}]},`;
  const encoded=btoa(template);
  document.getElementById('convert').value=encoded;
  return template;
}
function playTest(){ const level=convert();localStorage.setItem('tempLevel',btoa(level));window.open('./game.html?host=true','_blank'); }
async function copyData(){ if(!document.getElementById('convert').value) convert();await navigator.clipboard.writeText(document.getElementById('convert').value);toast('Game data copied.'); }
function toast(msg,error=false){
  const el=document.getElementById('editorToast');el.textContent=msg;el.style.borderColor=error?'#ff5c5c':'#ffd84a';el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800);
}

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  const p=pointFromEvent(e);if(!p.valid)return;
  mouseDown=true;lastPaintKey='';
  const tile=e.button===2?'0':currentTile();
  if(paintMode==='fill'||e.shiftKey) floodFill(p.x,p.y,tile); else paintAt(p.x,p.y,tile,true);
});
canvas.addEventListener('mousemove',e=>{
  const p=pointFromEvent(e);document.getElementById('cursorPos').textContent=p.valid?`X: ${p.x} / Y: ${p.y}`:'X: -- / Y: --';
  if(mouseDown&&p.valid&&paintMode==='paint') paintAt(p.x,p.y,e.buttons===2?'0':currentTile(),false);
});
window.addEventListener('mouseup',()=>{mouseDown=false;lastPaintKey='';});

window.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea') return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();return undo();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();return redo();}
  const k=e.key.toLowerCase();
  if(shortcuts[k]) chooseTile(shortcuts[k]);
  if(k==='r') rotateLaser();
  if(k==='p') setPaintMode('paint');
  if(k==='f') setPaintMode('fill');
  if(k==='+'||k==='=') setZoom(zoom+.25);
  if(k==='-') setZoom(zoom-.25);
});

document.querySelectorAll('[data-tile]').forEach(btn=>btn.addEventListener('click',()=>chooseTile(btn.dataset.tile)));
document.getElementById('paintMode').onclick=()=>setPaintMode('paint');
document.getElementById('fillMode').onclick=()=>setPaintMode('fill');
document.getElementById('rotateLaser').onclick=rotateLaser;
document.getElementById('resizeBtn').onclick=applyResize;
document.getElementById('undoBtn').onclick=undo;
document.getElementById('redoBtn').onclick=redo;
document.getElementById('clearBtn').onclick=clearLevel;
document.getElementById('floorBtn').onclick=addFloor;
document.getElementById('saveDraft').onclick=saveDraft;
document.getElementById('loadDraft').onclick=loadDraft;
document.getElementById('zoomIn').onclick=()=>setZoom(zoom+.25);
document.getElementById('zoomOut').onclick=()=>setZoom(zoom-.25);
document.getElementById('exportProject').onclick=exportProject;
document.getElementById('importProject').onclick=()=>document.getElementById('importFile').click();
document.getElementById('importFile').addEventListener('change',e=>{if(e.target.files[0])importProjectFile(e.target.files[0]);e.target.value='';});
document.getElementById('generateData').onclick=()=>{convert();toast('Game data generated.');};
document.getElementById('copyData').onclick=copyData;
document.getElementById('playTest').onclick=playTest;

width=20;height=10;grid=newGrid();resizeCanvas();draw();updateHistoryButtons();chooseTile('1');
