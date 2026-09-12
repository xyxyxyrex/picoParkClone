var keys = {},
  preKeys = {};
document.addEventListener("keydown", (e) => {
  if (e.code == "F1") mainGame.renderer.debug = !mainGame.renderer.debug;
  keys[e.key.toLowerCase()] = true;
  if (window.clientConnection && !e.repeat) {
    if (e.key.toLowerCase() === "arrowup")
      clientConnection.jumpSequence = (clientConnection.jumpSequence || 0) + 1;
    clientConnection.updateHost();
  }
});
document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
  if (window.clientConnection) clientConnection.updateHost();
});

function updateControls() {
  preKeys = { ...keys };
}
window.addEventListener("blur", () => {
  keys = {};
  preKeys = {};
  if (window.clientConnection) clientConnection.updateHost();
});
