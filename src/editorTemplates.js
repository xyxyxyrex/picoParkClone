(function(){
  function loadTemplate(){
    const level=Number(document.getElementById('campaignTemplate').value)||1;
    const players=Number(document.getElementById('templatePlayers').value)||2;
    const stage=CampaignTemplates.buildStage(level,players);
    const project=CampaignTemplates.toEditorProject(level,players);
    if(typeof pushHistory==='function') pushHistory();
    restoreState(project);
    const hint=document.getElementById('templateHint');
    if(hint) hint.textContent=`${stage.name} · ${players}P · ${stage.description}`;
    if(typeof toast==='function') toast(`Loaded Level ${level} template for ${players} player${players===1?'':'s'}.`);
  }
  document.getElementById('loadCampaignTemplate').addEventListener('click',loadTemplate);
  ['campaignTemplate','templatePlayers'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{
    const level=Number(document.getElementById('campaignTemplate').value)||1;
    const players=Number(document.getElementById('templatePlayers').value)||2;
    const stage=CampaignTemplates.buildStage(level,players);
    const hint=document.getElementById('templateHint');
    if(hint) hint.textContent=`Preview: ${stage.width}×${stage.height} · ${stage.description}`;
  }));
})();
