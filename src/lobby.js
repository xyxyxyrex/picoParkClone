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
    if(modeLabel) modeLabel.textContent=mode==="versus"?'VERSUS':'CLASSIC CO-OP';
  };

  window.showLobbyMessage=function(message,isError=false){
    allId('lobbyMessage').forEach(el=>{
      el.textContent=message||'';
      el.className='pixel-status'+(isError?' error':'');
    });
  };

  window.renderLobbyState=function(state){
    if(!state) return;
    setGameModeUI(state.mode||'classic');
    const buckets={team1:allId('team1Members'),team2:allId('team2Members'),observer:allId('observerMembers'),player:allId('classicMembers')};
    Object.values(buckets).flat().forEach(el=>el.innerHTML='');

    (state.members||[]).forEach(member=>{
      const role=state.mode==='versus'?(member.role||'observer'):'player';
      (buckets[role]||[]).forEach(target=>{
        const chip=document.createElement('div');
        chip.className='member-chip';
        chip.innerHTML=`${esc(member.username)}${member.isHost?' <small>[HOST]</small>':''}`;
        target.appendChild(chip);
      });
    });

    const counts=state.counts||{team1:0,team2:0};
    allId('team1Count').forEach(el=>el.textContent=counts.team1||0);
    allId('team2Count').forEach(el=>el.textContent=counts.team2||0);
    if(state.scores){
      const s1=document.getElementById('score1');
      const s2=document.getElementById('score2');
      if(s1) s1.textContent=state.scores.team1||0;
      if(s2) s2.textContent=state.scores.team2||0;
    }
  };

  function requestRole(role){
    if(window.clientConnection){ clientConnection.requestRole(role); return; }
    showLobbyMessage('The host occupies Team 1 in Versus mode so the first guest must join Team 2 or observe.');
  }

  document.addEventListener('DOMContentLoaded',()=>{
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

  if(typeof Player !== 'undefined' && !Player.prototype.__observerPatch){
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
})();
