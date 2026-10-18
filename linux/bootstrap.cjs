"use strict";
// Written into the client's app.asar and required first from its entry. It only adds an ordinary
// Electron preload; it does not touch renderer isolation, web security or the client's own preloads.
const { app, session } = require("electron");
const path = require("path");
const preload = path.join(__dirname, "preload.cjs");
function attach(target) {
  try {
    const existing = target.getPreloads();
    if (!existing.includes(preload)) target.setPreloads([...existing, preload]);
  } catch (error) { console.error("BTR preload:", error.message); }
}
app.on("session-created", attach);
app.whenReady().then(() => attach(session.defaultSession)).catch(error => console.error("BTR preload:", error.message));
