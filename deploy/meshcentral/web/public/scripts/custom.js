(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var embed = Boolean(params.get("hide"));
    var meshToken = params.get("login") || params.get("auth") || "";

    if (embed) {
      var mark = function () {
        if (document.body) document.body.classList.add("adelmsp-embed");
      };
      mark();
      document.addEventListener("DOMContentLoaded", mark);
    }

    if (typeof MeshServerCreateControl === "function" && !MeshServerCreateControl._adelmsp) {
      var orig = MeshServerCreateControl;
      MeshServerCreateControl = function (domain, cookie) {
        var token = meshToken || cookie;
        if (!token && typeof authCookie === "string") token = authCookie;
        return orig(domain, token);
      };
      MeshServerCreateControl._adelmsp = true;
    }

    document.addEventListener("DOMContentLoaded", function () {
      if (meshToken && typeof authCookie === "string") authCookie = meshToken;
      if (typeof meshserver === "object" && meshserver && meshToken && !meshserver.authCookie) {
        meshserver.authCookie = meshToken;
      }
    });

    if (!embed) return;

    var lastTry = 0;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;

      var input = document.getElementById("DeskControl");
      if (input && !input.checked) input.checked = true;

      if (typeof desktop === "object" && desktop && desktop.State) {
        if (desktop.State === 3) clearInterval(timer);
        return;
      }

      var disconnectSpan = document.getElementById("disconnectbutton1span");
      if (disconnectSpan && disconnectSpan.style.display !== "none") {
        clearInterval(timer);
        return;
      }

      if (typeof currentNode !== "object" || !currentNode || !(currentNode.conn & 1)) return;
      if (typeof connectDesktop !== "function") return;
      var now = Date.now();
      if (now - lastTry < 4000) return;
      lastTry = now;
      connectDesktop(null, 1);
      if (tries > 90) clearInterval(timer);
    }, 500);
  } catch (e) {}
})();
