"use strict";
// The Linux client patcher (linux/patch.cjs) on a small stand-in for the client's app.asar:
// patch, patch again, re-patch after a new build, restore byte for byte, and leave other
// archives alone. Also checks that the page bundle and the preload parse.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const { Asar, sha } = require(path.join(root, "linux/asar.cjs"));

function emptyAsar() {
  const json = Buffer.from(JSON.stringify({ files: {} }));
  const padded = Math.ceil((json.length + 4) / 4) * 4;
  const bytes = Buffer.alloc(12 + padded);
  bytes.writeUInt32LE(4, 0); bytes.writeUInt32LE(padded + 4, 4);
  bytes.writeUInt32LE(padded, 8); bytes.writeUInt32LE(json.length, 12); json.copy(bytes, 16);
  return bytes;
}
function client(name = "bilibili", entry = "\"use strict\";const electron=require(\"electron\");\n") {
  const archive = new Asar(emptyAsar());
  archive.set("package.json", JSON.stringify({ name, version: "1.19.0" }));
  archive.set("index.js", entry);
  archive.set("main/app.js", "module.exports = 1;\n");
  return archive.pack();
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "btr-linux-test-"));
  try {
    const { build } = await import(pathToFileURL(path.join(root, "linux/build.mjs")).href);
    const out = path.join(temp, "out");
    const built = build(out);
    assert.match(built.version, /^\d+\.\d+\.\d+\.\d+-l\d+$/);
    const preload = fs.readFileSync(path.join(out, "payload/preload.cjs"), "utf8");
    new Function(preload);
    const bundle = JSON.parse(/const code = (".*");\n/.exec(preload)[1]);
    new Function(bundle);
    assert.ok(bundle.includes("__BILI_IDM_DOWNLOADER_FACTORY__") && bundle.includes("__BTR_DESKTOP__"));

    process.env.BTR_CLIENT_ASAR = path.join(temp, "app.asar");
    process.env.BTR_STATE_DIR = path.join(temp, "state");
    const patcher = require(path.join(out, "patch.cjs"));
    const original = client();
    fs.writeFileSync(process.env.BTR_CLIENT_ASAR, original);
    assert.equal(patcher.status().state, "not-patched");

    assert.equal(patcher.patch().state, "patched");
    let archive = Asar.open(process.env.BTR_CLIENT_ASAR);
    assert.ok(archive.text("index.js").startsWith("\"use strict\";" + patcher.PREFIX), "the prefix goes after \"use strict\"");
    assert.ok(archive.text("index.js").endsWith("const electron=require(\"electron\");\n"));
    assert.equal(archive.text("main/app.js"), "module.exports = 1;\n");
    assert.equal(sha(archive.read("btr-linux/preload.cjs")), sha(preload));
    assert.deepEqual(fs.readdirSync(process.env.BTR_STATE_DIR), [`${sha(original)}.asar`]);
    const patched = fs.readFileSync(process.env.BTR_CLIENT_ASAR);
    assert.equal(patcher.patch().state, "current");
    assert.ok(fs.readFileSync(process.env.BTR_CLIENT_ASAR).equals(patched), "patching twice changes nothing");

    // A new BTR build is put onto the kept original, not onto the patched file.
    const meta = path.join(out, "payload/payload.json");
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, "utf8")), sha256: "0".repeat(64), version: "next" }));
    assert.equal(patcher.patch().state, "patched");
    archive = Asar.open(process.env.BTR_CLIENT_ASAR);
    assert.equal(archive.text("index.js").split(patcher.PREFIX).length, 2, "one prefix only");
    assert.equal(JSON.parse(archive.text("btr-linux/installed.json")).originalSha256, sha(original));

    assert.equal(patcher.restore().state, "restored");
    assert.ok(fs.readFileSync(process.env.BTR_CLIENT_ASAR).equals(original), "restore gives back the original bytes");
    assert.deepEqual(fs.readdirSync(process.env.BTR_STATE_DIR), []);
    assert.equal(patcher.restore().state, "not-patched");

    // A client update replaces the patched file with a clean one: patch it and drop the old original.
    assert.equal(patcher.patch().state, "patched");
    const updated = client("bilibili", "\"use strict\";console.log(2);\n");
    fs.writeFileSync(process.env.BTR_CLIENT_ASAR, updated);
    assert.equal(patcher.patch().state, "patched");
    assert.deepEqual(fs.readdirSync(process.env.BTR_STATE_DIR), [`${sha(updated)}.asar`]);

    // The client removed: nothing to do, and the kept original goes.
    fs.unlinkSync(process.env.BTR_CLIENT_ASAR);
    assert.equal(patcher.patch().state, "no-client");
    assert.deepEqual(fs.readdirSync(process.env.BTR_STATE_DIR), []);

    fs.writeFileSync(process.env.BTR_CLIENT_ASAR, client("something-else"));
    assert.throws(() => patcher.patch(), /不是哔哩哔哩客户端/);
    console.log("linux patch test passed");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
