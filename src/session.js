(function () {
  const COOKIE_NAME = "tiny_park_session";
  const COOKIE_AGE = 60 * 60 * 24 * 30;

  function readCookie() {
    const prefix = `${COOKIE_NAME}=`;
    const entry = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (!entry) return "";
    try {
      return decodeURIComponent(entry.slice(prefix.length));
    } catch {
      return "";
    }
  }

  function valid(value) {
    return /^[a-f0-9-]{32,64}$/i.test(value);
  }

  window.parkSessionId = function () {
    const current = readCookie();
    if (valid(current)) return current;
    const created = crypto.randomUUID();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(created)}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    return readCookie() || created;
  };
})();
