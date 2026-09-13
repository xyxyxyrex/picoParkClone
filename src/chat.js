(function () {
  const state = {
    active: false,
    messages: null,
    input: null,
    panel: null,
  };

  function setActive(active) {
    state.active = !!active;
    state.panel?.classList.toggle("typing", state.active);
    if (state.input) {
      state.input.hidden = !state.active;
      if (state.active) {
        window.releaseParkControls?.();
        state.input.value = "";
        state.input.focus();
      } else {
        state.input.blur();
      }
    }
  }

  function receive(message) {
    if (!state.messages || !message) return;
    const row = document.createElement("div");
    row.className = `chat-message${message.system ? " system" : ""}`;
    if (message.system) row.textContent = message.text;
    else {
      const name = document.createElement("strong");
      name.textContent = `${message.username || "Player"}: `;
      row.append(name, document.createTextNode(message.text || ""));
    }
    state.messages.append(row);
    while (state.messages.children.length > 30)
      state.messages.firstElementChild.remove();
    state.messages.scrollTop = state.messages.scrollHeight;
  }

  function notice(text, isError = false) {
    const element = document.getElementById("gameNotice");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", isError);
    element.classList.add("visible");
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => element.classList.remove("visible"), 4000);
  }

  function system(text) {
    receive({ system: true, text });
    notice(text);
  }

  function send() {
    const text = String(state.input?.value || "")
      .trim()
      .slice(0, 160);
    setActive(false);
    if (!text) return;
    if (window.clientConnection) clientConnection.sendChat(text);
    else if (window.hostConnection) hostConnection.sendChat(text);
  }

  function updatePing() {
    const element = document.getElementById("pingHud");
    if (!element) return;
    if (window.clientConnection) {
      const connected = clientConnection.mainConn?.fullyConnected;
      element.textContent = connected
        ? `PING ${Math.max(0, clientConnection.recentPing || 0)} MS`
        : "RECONNECTING";
      element.classList.toggle("warning", !connected);
    } else if (window.hostConnection) {
      element.textContent = "PING 0 MS";
      element.classList.remove("warning");
    } else {
      element.textContent = "LOCAL";
    }
  }

  window.parkChat = {
    get active() {
      return state.active;
    },
    receive,
    system,
    notice,
    show() {
      state.panel?.removeAttribute("hidden");
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    state.panel = document.getElementById("gameChat");
    state.messages = document.getElementById("chatMessages");
    state.input = document.getElementById("chatInput");
    updatePing();
    setInterval(updatePing, 400);
  });

  document.addEventListener("keydown", (event) => {
    if (!window.clientConnection && !window.hostConnection) return;
    if (event.key === "Escape" && state.active) {
      event.preventDefault();
      setActive(false);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (state.active) send();
    else setActive(true);
  });
})();
