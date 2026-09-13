var keys = {},
  preKeys = {},
  rawKeys = {},
  wasdAliasesEnabled = true;

const wasdAliases = {
  a: "arrowleft",
  d: "arrowright",
  w: "arrowup",
  s: "arrowdown",
};

function refreshKeys() {
  keys = { ...rawKeys };
  if (wasdAliasesEnabled)
    Object.entries(wasdAliases).forEach(([wasd, arrow]) => {
      if (rawKeys[wasd]) keys[arrow] = true;
    });
}

function setWasdAliasesEnabled(enabled) {
  wasdAliasesEnabled = !!enabled;
  refreshKeys();
}

document.addEventListener("keydown", (e) => {
  if (window.parkChat?.active || e.target?.id === "chatInput") return;
  if (e.code == "F1") mainGame.renderer.debug = !mainGame.renderer.debug;
  const key = e.key.toLowerCase();
  rawKeys[key] = true;
  refreshKeys();
  if (window.clientConnection && !e.repeat) {
    if (key === "arrowup" || (wasdAliasesEnabled && key === "w"))
      clientConnection.jumpSequence = (clientConnection.jumpSequence || 0) + 1;
    clientConnection.updateHost();
  }
});
document.addEventListener("keyup", (e) => {
  if (window.parkChat?.active || e.target?.id === "chatInput") return;
  rawKeys[e.key.toLowerCase()] = false;
  refreshKeys();
  if (window.clientConnection) clientConnection.updateHost();
});

function updateControls() {
  preKeys = { ...keys };
}
window.addEventListener("blur", () => {
  rawKeys = {};
  keys = {};
  preKeys = {};
  if (window.clientConnection) clientConnection.updateHost();
});

window.releaseParkControls = function () {
  rawKeys = {};
  keys = {};
  preKeys = {};
  if (window.clientConnection) clientConnection.updateHost();
};
