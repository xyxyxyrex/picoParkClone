(function(){
  function allId(id){ return [...document.querySelectorAll(`[id="${id}"]`)]; }
  function esc(str){ return String(str||'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }

  window.setGameModeUI=function(mode){
    document.querySelectorAll('[data-versus-only]').forEach(el=>el.style.display=mode==="versus"?"":"none");
    const classicHost=document.getElementById('classicBoard');
    const classicJoin=document.getElementById('classicJoinBoard');
    if(classicHost) classicHost.style.display=mode==="versus"?'none':'';
    if(classicJoin) classicJoin.style.display=mode==="versus"?'none':'';
    const modeLabel=document.getElementById('modeLabel');
    if(modeLabel) modeLabel.textContent=mode==="versus"?'VERSUS · FIRST TO CLEAR 5':'CLASSIC CO-OP';
  };

  window.showLobbyMessage=function(message,isError=false){
    allId('lobbyMessage').forEach(el=>{el.textContent=message||'';el.className='pixel-status'+(isError?' error':'');});
    if(isError && window.mainGame && mainGame.running){
      let banner=document.getElementById('networkStatus');
      if(!banner){banner=document.createElement('div');banner.id='networkStatus';banner.setAttribute('role','alert');banner.style.cssText='position:fixed;left:50%;top:75px;transform:translateX(-50%);z-index:90;max-width:90vw;padding:16px;background:#fff3cd;color:#49351c;border:2px solid #b78324;border-radius:8px;font:14px Arial';document.body.append(banner);}
      banner.replaceChildren(document.createTextNode(message+' '));const link=document.createElement('a');link.href='./index.html';link.textContent='Return home';banner.append(link);
    }
  };

  window.showMatchWinner=function(label){
    let overlay=document.getElementById('matchWinnerOverlay');
    if(!overlay){
      overlay=document.createElement('div');overlay.id='matchWinnerOverlay';overlay.className='game-menu-wrap';overlay.style.zIndex='80';
      overlay.innerHTML='<div class="pixel-card" style="text-align:center;max-width:620px"><div class="pixel-kicker">Campaign Complete</div><h1 id="matchWinnerText" style="font-size:46px;margin:12px 0"></h1><p class="pixel-status">First team to clear all five stages wins.</p><a class="pixel-btn green" href="./index.html">Back to Lobby</a></div>';
      document.body.appendChild(overlay);
    }
    document.getElementById('matchWinnerText').textContent=`${label} WINS!`;overlay.style.display='grid';
  };

  window.renderLobbyState=function(state){
    if(!state) return;
    setGameModeUI(state.mode||'classic');
    const buckets={team1:allId('team1Members'),team2:allId('team2Members'),observer:allId('observerMembers'),player:allId('classicMembers')};
    Object.values(buckets).flat().forEach(el=>el.innerHTML='');
    (state.members||[]).forEach(member=>{
      const role=state.mode==='versus'?(member.role||'observer'):'player';
      (buckets[role]||[]).forEach(target=>{const chip=document.createElement('div');chip.className='member-chip';chip.innerHTML=`${esc(member.username)}${member.isHost?' <small>[HOST]</small>':''}`;target.appendChild(chip);});
    });
    const counts=state.counts||{team1:0,team2:0},cap=state.maxTeamPlayers||6;
    allId('team1Count').forEach(el=>el.textContent=`${counts.team1||0}/${cap}`);
    allId('team2Count').forEach(el=>el.textContent=`${counts.team2||0}/${cap}`);
    const progress=state.progress||{team1:1,team2:1},finished=state.finished||{};
    const p1=document.getElementById('score1'),p2=document.getElementById('score2');
    if(p1)p1.textContent=finished.team1?'5/5':`${Math.max(0,(progress.team1||1)-1)}/5`;
    if(p2)p2.textContent=finished.team2?'5/5':`${Math.max(0,(progress.team2||1)-1)}/5`;
    allId('team1Progress').forEach(el=>el.textContent=finished.team1?'FINISHED':`LEVEL ${progress.team1||1}`);
    allId('team2Progress').forEach(el=>el.textContent=finished.team2?'FINISHED':`LEVEL ${progress.team2||1}`);
    document.querySelectorAll('[data-role]').forEach(btn=>{
      const role=btn.dataset.role,count=role==='team1'?counts.team1:role==='team2'?counts.team2:0;
      btn.disabled=!!state.matchStarted||((role==='team1'||role==='team2')&&count>=cap);
    });
    if(state.matchWinner) showMatchWinner(state.matchWinner==='team1'?'TEAM 1':'TEAM 2');
  };

  function requestRole(role){
    if(window.clientConnection){clientConnection.requestRole(role);return;}
    if(window.hostConnection){const ok=hostConnection.requestHostRole(role);showLobbyMessage(ok?(role==='observer'?'Host is observing.':'Host joined '+(role==='team1'?'Team 1.':'Team 2.')):'That host role would break team balance or the match already started.',!ok);}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-role]').forEach(btn=>btn.addEventListener('click',()=>requestRole(btn.dataset.role)));
    const copy=document.getElementById('copyLink');
    if(copy)copy.addEventListener('click',async e=>{e.preventDefault();if(!window.hostConnection||!hostConnection.joinConn)return;const url=new URL('./game.html',window.location.href);url.searchParams.set('join',hostConnection.joinConn.selfId);await navigator.clipboard.writeText(url.toString());showLobbyMessage('Invite link copied.');});
  });

  if(typeof Player!=='undefined'&&!Player.prototype.__observerPatch){
    Player.prototype.__observerPatch=true;
    const originalRestart=Player.prototype.restart;
    const originalTestFalling=Player.prototype.testFalling;
    Player.prototype.setObserver=function(enabled){
      enabled=!!enabled;if(this.observer===enabled)return;this.observer=enabled;
      if(this.observer){this.body.isStatic=true;this.body.collisionFilter.mask=0;Matter.Body.setPosition(this.body,v(-10000,-10000));Matter.Body.setVelocity(this.body,v(0,0));}
      else{this.body.isStatic=false;this.body.collisionFilter={category:1,group:0,mask:4294967295};originalRestart.call(this,0);}
    };
    Player.prototype.restart=function(i=0){
      if(this.observer){Matter.Body.setPosition(this.body,v(-10000,-10000));Matter.Body.setVelocity(this.body,v(0,0));return;}
      return originalRestart.call(this,i);
    };
    Player.prototype.campaignRespawnPoint=function(){
      const current=this.game&&this.game.levelHandler&&this.game.levelHandler.currentLevel;if(!current)return null;
      if(current.campaign&&current.spawnByTeam&&this.team&&current.spawnByTeam[this.team])return current.spawnByTeam[this.team][this.campaignStage||1]||null;
      return current.spawn||null;
    };
    Player.prototype.respawnAtCampaignCheckpoint=function(){
      const point=this.campaignRespawnPoint();if(!point)return false;
      this.dead=false;this.ready=false;this.body.isStatic=false;this.body.collisionFilter={category:1,group:0,mask:4294967295};
      Matter.Body.setPosition(this.body,v(point.x*50,point.y*50));Matter.Body.setVelocity(this.body,v(0,0));this.setScale(1);return true;
    };
    Player.prototype.testFalling=function(){
      const current=this.game&&this.game.levelHandler&&this.game.levelHandler.currentLevel;
      if(current&&current.data){
        let bottom=current.data.length*50+250;
        if(current.campaign&&current.stageMeta&&this.team&&current.stageMeta[this.team]){const meta=current.stageMeta[this.team][this.campaignStage||1];if(meta&&meta.bounds)bottom=(meta.bounds.y+meta.bounds.h)*50+220;}
        if(this.body.position.y>bottom&&this.respawnAtCampaignCheckpoint())return;
      }
      return originalTestFalling.call(this);
    };
  }
})();
