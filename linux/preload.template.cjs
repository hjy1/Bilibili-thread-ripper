"use strict";
// Runs in every page of the client. Only the main window and the player window get BTR; the page
// code is put in as a <script> so it runs in the page's own world, next to the client's player.
(() => {
  if (!process.isMainFrame || location.origin !== "https://bilipc.bilibili.com" || !/^\/(index|player)\.html$/.test(location.pathname)) return;
  const code = __BTR_BUNDLE__;
  let injected = false;
  function inject() {
    if (injected || !document.documentElement) return;
    injected = true; observer.disconnect();
    const script = document.createElement("script");
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  const observer = new MutationObserver(inject);
  observer.observe(document, { childList: true, subtree: true });
  inject();
})();
