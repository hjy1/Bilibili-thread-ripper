// Builds the Linux client version into dist/linux/: the page bundle (this repository's shared
// download core from src/ plus the client adapter in linux/adapter/) wrapped into the preload,
// and the patcher that writes it into the client's app.asar.
//
//   node linux/build.mjs            version from the latest release in CHANGELOG.md
//   node linux/build.mjs <outdir>   somewhere else, e.g. for the PKGBUILD
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const linux = dirname(fileURLToPath(import.meta.url));
const root = resolve(linux, "..");
// Raise when only the adapter changes, so the client shows that a new build is installed.
export const ADAPTER_REVISION = 1;
const SHARED = ["range-core", "cdn-resolver", "idm-downloader", "runtime-notices", "notification-view"].map(name => `src/${name}.js`);
const ADAPTER = ["settings", "transport", "client", "settings-view", "player-settings"].map(name => `linux/adapter/${name}.js`);

const read = file => readFileSync(join(root, file), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");

export function baseVersion() {
  const match = /^## \[(\d+\.\d+\.\d+\.\d+)\]/m.exec(read("CHANGELOG.md"));
  if (!match) throw new Error("CHANGELOG.md 里找不到已发布的版本");
  return match[1];
}

export function buildBundle(version) {
  const prefix = `globalThis.__BTR_DESKTOP_RELEASE__=${JSON.stringify({ version, adapterRevision: ADAPTER_REVISION })};\n`;
  return prefix + [...SHARED, ...ADAPTER].map(file => `\n/* ${file} */\n${read(file)}\n`).join("");
}

export function build(out = join(root, "dist/linux")) {
  const version = `${baseVersion()}-l${ADAPTER_REVISION}`;
  const bundle = buildBundle(version);
  const preload = read("linux/preload.template.cjs").replace("__BTR_BUNDLE__", () => JSON.stringify(bundle));
  mkdirSync(join(out, "payload"), { recursive: true });
  writeFileSync(join(out, "payload/preload.cjs"), preload);
  copyFileSync(join(linux, "bootstrap.cjs"), join(out, "payload/bootstrap.cjs"));
  for (const file of ["patch.cjs", "asar.cjs", "btr-patch"]) copyFileSync(join(linux, file), join(out, file));
  chmodSync(join(out, "btr-patch"), 0o755);
  const sha = createHash("sha256").update(preload).update(read("linux/bootstrap.cjs")).digest("hex");
  writeFileSync(join(out, "payload/payload.json"), JSON.stringify({ version, adapterRevision: ADAPTER_REVISION, sha256: sha }, null, 2) + "\n");
  return { out, version, bytes: Buffer.byteLength(preload) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = build(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`BTR Linux ${result.version}: ${result.out} (${result.bytes} bytes)`);
}
