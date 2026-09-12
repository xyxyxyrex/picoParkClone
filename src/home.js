(() => {
  const $ = (id) => document.getElementById(id);
  const inputs = [...document.querySelectorAll(".username-input")];
  let saved = "";
  try {
    saved = localStorage.getItem("username") || "";
  } catch {}
  inputs.forEach((input) => {
    input.value = saved;
    input.addEventListener("input", () =>
      inputs.forEach((other) => {
        if (other !== input) other.value = input.value;
      }),
    );
  });
  function saveName() {
    try {
      localStorage.setItem(
        "username",
        inputs[0].value.trim().slice(0, 18) || "Player",
      );
    } catch {}
  }
  $("openCreate").onclick = () => $("createDialog").showModal();
  $("openJoin").onclick = () => $("joinDialog").showModal();
  document
    .querySelectorAll("[data-close]")
    .forEach(
      (button) => (button.onclick = () => button.closest("dialog").close()),
    );
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          dialog.close();
      }
    }),
  );
  $("gameMode").onchange = () =>
    ($("hostModeHint").textContent =
      $("gameMode").value === "versus"
        ? "Two equal teams. First to finish five rounds wins."
        : "Work together through five rounds.");
  $("createForm").onsubmit = (event) => {
    event.preventDefault();
    saveName();
    location.href = `game.html?host=true&mode=${$("gameMode").value}`;
  };
  $("joinForm").onsubmit = (event) => {
    event.preventDefault();
    saveName();
    const code = $("codeInput").value.trim().toUpperCase();
    if (code) location.href = `game.html?join=${encodeURIComponent(code)}`;
  };
  const atlas = new Image(),
    level = new Image();
  atlas.src = "assets/imgs/atlas.png";
  level.src = "assets/imgs/levelAssets.png";
  Promise.all([atlas.decode(), level.decode()])
    .then(() => {
      const c = $("menuCharacters").getContext("2d");
      c.imageSmoothingEnabled = false;
      const offsets = [
        [0, 0],
        [723, 0],
        [0, 501],
        [0, 750],
        [0, 252],
        [723, 501],
      ];
      offsets.forEach(([x, y], i) =>
        c.drawImage(atlas, 34 + x, 56 + y, 42, 46, 74 + i * 74, 23, 25, 28),
      );
      c.drawImage(level, 111, 885, 402.5, 402.5, 541, 12, 42, 42);
    })
    .catch(() => {});
})();
