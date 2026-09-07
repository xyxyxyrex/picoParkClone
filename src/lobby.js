(function(){
  const roleLabels={team1:"TEAM 1",team2:"TEAM 2",observer:"OBSERVER",player:"PLAYER"};

  window.setGameModeUI=function(mode){
    const versusOnly=document.querySelectorAll('[data-versus-only]');
    versusOnly.forEach(el=>el.style.display=mode==="versus"?"":"none");
    const modeLabel=document.getElementById('modeLabel');
    if(modeLabel) modeLabel.textContent=mode==="versus"?'VERSUS':'CLASSIC CO-OP';
  };

  window.showLobbyMessage=function(message,isError=false){
    const el=document.getElementById('lobbyMessage');
    if(!el) return;
    el.textContent=message||'';
    el.className='pixel-status'+(isError?' error':'');
  };

  function esc(str){ return String(str||'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }

  window.renderLobbyState=function(state){
    if(!state) return;
    setGameModeUI(state.mode||'classic');
    const columns={team1:document.getElementById('team1Members'),team2:document.getElementById('team2Members'),observer:document.getElementById('observerMembers'),player:document.getElementById('classicMembers')};
    Object.values(columns).forEach(el=>{if(el) el.innerHTML='';});

    (state.members||[]).forEach(member=>{
      const role=state.mode==='versus'?(member.role||'observer'):'player';
      const target=columns[role];
      if(!target) return;
      const chip=document.createElement('div');
      chip.className='member-chip';
      chip.innerHTML=`${esc(member.username)}${member.isHost?' <small>[HOST]</small>':''}`;
      target.appendChild(chip);
    });

    const counts=state.counts||{team1:0,team2:0};
    const t1=document.getElementById('team1Count');
    const t2=document.getElementById('team2Count');
    if(t1) t1.textContent=counts.team1||0;
    if(t2) t2.textContent=counts.team2||0;

    if(state.scores){
      const s1=document.getElementById('score1');
      const s2=document.getElementById('score2');
      if(s1) s1.textContent=state.scores.team1||0;
      if(s2) s2.textContent=state.scores.team2||0;
    }
  };

  function requestRole(role){
    if(window.clientConnection){ clientConnection.requestRole(role); return; }
    showLobbyMessage('The host occupies Team 1 in Versus mode so the first guest must join Team 2 or observe.',false);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-role]').forEach(btn=>btn.addEventListener('click',()=>requestRole(btn.dataset.role)));
    const copy=document.getElementById('copyLink');
    if(copy) copy.addEventListener('click',async e=>{
      e.preventDefault();
      if(!window.hostConnection||!hostConnection.joinConn) return;
      const url=new URL('./game.html',window.location.href);
      url.searchParams.set('join',hostConnection.joinConn.selfId);
      await navigator.clipboard.writeText(url.toString());
      showLobbyMessage('Invite link copied.');
    });
  });

  window.addEventListener('load',()=>{
    if(window.Player && !Player.prototype.__observerPatch){
      Player.prototype.__observerPatch=true;
      const originalRestart=Player.prototype.restart;
      Player.prototype.setObserver=function(enabled){
        this.observer=!!enabled;
        if(this.observer){
          this.body.isStatic=true;
          this.body.collisionFilter.mask=0;
          Matter.Body.setPosition(this.body,v(-10000,-10000));
          Matter.Body.setVelocity(this.body,v(0,0));
        } else {
          this.body.isStatic=false;
          this.body.collisionFilter={category:1,group:0,mask:4294967295};
          originalRestart.call(this,0);
        }
      };
      Player.prototype.restart=function(i=0){
        if(this.observer){
          Matter.Body.setPosition(this.body,v(-10000,-10000));
          Matter.Body.setVelocity(this.body,v(0,0));
          return;
        }
        return originalRestart.call(this,i);
      };
    }
  });
})();
