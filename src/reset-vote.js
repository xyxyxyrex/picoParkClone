(function () {
  const state = { vote: null, hideTimer: null };
  const byId = (id) => document.getElementById(id);

  function role() {
    if (window.hostConnection) return hostConnection.hostRole;
    if (window.clientConnection) return clientConnection.role;
    return "observer";
  }

  function roomState() {
    if (window.hostConnection) return hostConnection.getLobbyState();
    return window.clientConnection?.lastLobbyState || null;
  }

  function updateVisibility() {
    const control = byId("teamResetControl");
    if (!control) return;
    const currentRole = role();
    const lobby = roomState();
    const canVote =
      ((window.hostConnection && hostConnection.mode === "versus") ||
        (window.clientConnection && clientConnection.mode === "versus")) &&
      lobby?.matchStarted &&
      !lobby.matchWinner &&
      (currentRole === "team1" || currentRole === "team2");
    control.hidden = !canVote;
    if (!canVote) byId("resetVotePanel").hidden = true;
    byId("startResetVote").disabled = !!state.vote;
  }

  function renderVote(vote) {
    const panel = byId("resetVotePanel");
    const actions = byId("resetVoteActions");
    const question = byId("resetVoteQuestion");
    const status = byId("resetVoteStatus");
    clearTimeout(state.hideTimer);
    state.vote = vote;
    updateVisibility();
    if (!vote || vote.team !== role()) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (!vote.active) {
      actions.hidden = true;
      question.textContent =
        vote.status === "passed" ? "LEVEL RESET" : "LEVEL KEPT";
      status.textContent = vote.message || "Vote finished.";
      state.hideTimer = setTimeout(() => {
        state.vote = null;
        panel.hidden = true;
        updateVisibility();
      }, 2200);
      return;
    }
    actions.hidden = false;
    question.textContent = `${vote.initiator.toUpperCase()}: RESET LEVEL ${vote.stage}?`;
    const seconds = Math.max(
      0,
      Math.ceil((vote.expiresAt - Date.now()) / 1000),
    );
    status.textContent = `${vote.yes} YES · ${vote.no} NO · ${vote.needed} NEEDED · ${seconds}S`;
    for (const [id, choice] of [
      ["resetVoteYes", true],
      ["resetVoteNo", false],
    ]) {
      const button = byId(id);
      button.disabled = vote.myVote !== null;
      button.setAttribute("aria-pressed", String(vote.myVote === choice));
    }
  }

  function request(action, choice) {
    if (window.hostConnection)
      hostConnection.requestTeamResetVote(action, choice);
    else if (window.clientConnection)
      clientConnection.requestResetVote(action, choice);
  }

  window.parkResetVote = {
    receive: renderVote,
    updateVisibility,
    clear() {
      clearTimeout(state.hideTimer);
      state.vote = null;
      const panel = byId("resetVotePanel");
      if (panel) panel.hidden = true;
      updateVisibility();
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    byId("startResetVote").addEventListener("click", () => request("start"));
    byId("resetVoteYes").addEventListener("click", () => request("vote", true));
    byId("resetVoteNo").addEventListener("click", () => request("vote", false));
    updateVisibility();
    setInterval(() => {
      updateVisibility();
      if (state.vote?.active) renderVote(state.vote);
    }, 500);
  });
})();
