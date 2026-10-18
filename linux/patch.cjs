"use strict";
// Writes BTR into the Linux Bilibili client (msojocs/bilibili-linux, packaged on the AUR as
// bilibili-bin or bilibili) the way BTR Desktop does on Windows: one require() at the top of the
// asar's entry, which loads payload/bootstrap.cjs. The untouched asar is kept in the state
// directory, so restore gives back exactly the file pacman installed.
//
//   patch.cjs patch     patch the client, or re-patch it from the kept original (idempotent)
//   patch.cjs restore   put the original back and drop the kept copy
//   patch.cjs status
//
// Run by the pacman hooks as root through btr-patch. BTR_CLIENT_ASAR and BTR_STATE_DIR point it
// somewhere else, for tests.
let fs;
try { fs = require("original-fs"); } catch (_) { fs = require("node:fs"); }
const path = require("node:path");
const { Asar, sha } = require("./asar.cjs");

const DIR = "btr-linux";
const MARKER = `${DIR}/installed.json`;
const PREFIX = `try{require("./${DIR}/bootstrap.cjs")}catch(error){console.error("BTR bootstrap:",error&&error.message)}\n`;
const target = () => process.env.BTR_CLIENT_ASAR || "/usr/lib/bilibili/app.asar";
const stateDir = () => process.env.BTR_STATE_DIR || "/var/lib/bilibili-thread-ripper";
const backupOf = hash => path.join(stateDir(), `${hash}.asar`);

function payload() {
  const dir = path.join(__dirname, "payload");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "payload.json"), "utf8"));
  return { meta, files: { bootstrap: fs.readFileSync(path.join(dir, "bootstrap.cjs")), preload: fs.readFileSync(path.join(dir, "preload.cjs")) } };
}

// A BOM and a leading "use strict" directive must stay first, or the entry changes meaning.
function splitHead(text) {
  const head = /^﻿?(?:\s*(["'])use strict\1[ \t]*;?[ \t]*(?:\r?\n)?)?/.exec(text)[0];
  return [head, text.slice(head.length)];
}

// Electron starts package.json "main" (index.js by default). Only a plain JavaScript file
// stored inside the archive can take the prefix; anything else is left alone.
function mainEntry(archive, app) {
  const main = typeof app.main === "string" && app.main.trim() ? app.main.trim().replace(/^\.\//, "") : "index.js";
  for (const name of [main, `${main}.js`, `${main}/index.js`]) {
    try {
      const entry = archive.entry(name);
      if (/\.c?js$/.test(name) && entry && !entry.files && !entry.unpacked && !entry.link) return name;
    } catch (_) { return null; }
  }
  return null;
}

function inspect(archive) {
  let app = null;
  try { app = JSON.parse(archive.text("package.json")); } catch (_) {}
  if (app?.name !== "bilibili") throw Error("这不是哔哩哔哩客户端的 app.asar");
  const installed = archive.entry(MARKER) ? JSON.parse(archive.text(MARKER)) : null;
  return { clientVersion: String(app.version || "unknown"), installed, entry: mainEntry(archive, app) };
}

function replace(file, bytes) {
  const temporary = `${file}.btr-${process.pid}.tmp`;
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644;
  fs.writeFileSync(temporary, bytes, { flag: "wx", mode });
  try {
    if (sha(fs.readFileSync(temporary)) !== sha(bytes)) throw Error("写入校验失败");
    fs.renameSync(temporary, file);
  } catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
}

// Only the original of the client that is installed now is worth keeping.
function prune(keep) {
  const removed = [];
  if (!fs.existsSync(stateDir())) return removed;
  for (const name of fs.readdirSync(stateDir())) {
    if (/^[a-f0-9]{64}\.asar$/.test(name) && name !== `${keep}.asar`) { fs.unlinkSync(path.join(stateDir(), name)); removed.push(name); }
  }
  return removed;
}

function readOriginal(installed, clientVersion) {
  const hash = installed.originalSha256;
  if (!/^[a-f0-9]{64}$/.test(hash || "")) throw Error("安装记录里的原始文件校验值无效");
  const file = backupOf(hash);
  if (!fs.existsSync(file)) throw Error(`找不到原始客户端备份 ${file}，请重新安装客户端（paru -S bilibili-bin）`);
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== hash) throw Error("原始客户端备份校验失败，请重新安装客户端");
  const info = inspect(new Asar(bytes));
  if (info.installed || info.clientVersion !== clientVersion) throw Error("原始客户端备份和当前客户端版本对不上，请重新安装客户端");
  return bytes;
}

function patch() {
  const file = target();
  // The client was removed: nothing to patch, and its kept original is no use any more.
  if (!fs.existsSync(file)) return { state: "no-client", removedBackups: prune(null) };
  const bytes = fs.readFileSync(file), info = inspect(new Asar(bytes)), { meta, files } = payload();
  if (info.installed?.payloadSha256 === meta.sha256) return { state: "current", version: meta.version, clientVersion: info.clientVersion };
  const original = info.installed ? readOriginal(info.installed, info.clientVersion) : bytes;
  const originalSha256 = sha(original), archive = new Asar(original), entry = inspect(archive).entry;
  if (!entry) return { state: "unsupported-client", clientVersion: info.clientVersion, message: "认不出客户端的入口文件，没有修改客户端" };
  const text = archive.text(entry);
  if (text.includes(`${DIR}/bootstrap.cjs`)) throw Error("客户端已经包含 BTR 入口，但没有安装记录");
  const [head, body] = splitHead(text);
  archive.set(entry, head + PREFIX + body);
  archive.set(`${DIR}/bootstrap.cjs`, files.bootstrap);
  archive.set(`${DIR}/preload.cjs`, files.preload);
  archive.set(MARKER, JSON.stringify({ schema: 1, version: meta.version, clientVersion: info.clientVersion, originalSha256, payloadSha256: meta.sha256 }));
  const patched = archive.pack(), check = new Asar(patched);
  if (!check.text(entry).startsWith(head + PREFIX) || sha(check.read(`${DIR}/preload.cjs`)) !== sha(files.preload)) throw Error("补丁自检失败，没有修改客户端");
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o755 });
  if (!fs.existsSync(backupOf(originalSha256))) replace(backupOf(originalSha256), original);
  replace(file, patched);
  return { state: "patched", version: meta.version, clientVersion: info.clientVersion, removedBackups: prune(originalSha256) };
}

function restore() {
  const file = target();
  if (!fs.existsSync(file)) return { state: "no-client", removedBackups: prune(null) };
  const info = inspect(new Asar(fs.readFileSync(file)));
  if (!info.installed) return { state: "not-patched", clientVersion: info.clientVersion, removedBackups: prune(null) };
  replace(file, readOriginal(info.installed, info.clientVersion));
  return { state: "restored", clientVersion: info.clientVersion, removedBackups: prune(null) };
}

function status() {
  const file = target();
  if (!fs.existsSync(file)) return { state: "no-client", path: file };
  const info = inspect(new Asar(fs.readFileSync(file))), { meta } = payload();
  return { state: !info.installed ? "not-patched" : info.installed.payloadSha256 === meta.sha256 ? "current" : "outdated", path: file, clientVersion: info.clientVersion, installed: info.installed?.version || null, available: meta.version, supported: !!info.entry };
}

const actions = { patch, restore, status };
if (require.main === module) {
  const action = actions[process.argv[2] || "status"];
  try {
    if (!action) throw Error(`未知操作：${process.argv[2]}（可用：patch、restore、status）`);
    console.log(`BTR: ${JSON.stringify(action())}`);
  } catch (error) {
    console.error(`BTR: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { patch, restore, status, PREFIX };
