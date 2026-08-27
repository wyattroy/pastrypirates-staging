// scripts/lib/load_engine.js
//
// Single indirection seam for obtaining the real `Game`/`roundCfg` engine. `loadEngine()`
// obtains `Game`/`roundCfg` (and every other engine export) by a plain, native `import` of the
// engine barrel module (src/engine/index.js) — no sandboxed evaluation, no file-slicing, no
// dependency on any application markup at all. Every caller (real_game_test.js,
// dlog_replay_test.js, determinism_baseline.js) keeps calling this the same (already-async) way,
// so a future change to how the engine is obtained stays contained to this one file (D-12).
//
// Loud-failure-on-drift convention preserved verbatim from the harnesses this consolidates: a
// harness that silently passes because the engine module failed to export what's expected is
// worse than no harness.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as engine from "../../src/engine/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

// D-13/RESEARCH Q3: sourceHash derives from the module sources the engine actually depends on
// (src/engine/**/*.js + src/shared/**/*.js) — enumerated and sorted lexicographically by
// relative path (deterministic across platforms, unlike fs.readdir order), each file's content
// fed in as `relative/path.js\n` + content + `\n` so two different file-boundary splits can
// never accidentally hash to the same byte stream.
function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function computeSourceHash() {
  const files = [
    ...collectJsFiles(path.join(ROOT, "src", "engine")),
    ...collectJsFiles(path.join(ROOT, "src", "shared")),
  ]
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
    .sort();

  const hash = crypto.createHash("sha256");
  for (const rel of files) {
    hash.update(rel + "\n");
    hash.update(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export async function loadEngine() {
  const sourceHash = computeSourceHash();

  const { Game, roundCfg } = engine;
  if (typeof Game !== "function" || typeof roundCfg !== "function") {
    throw new Error("src/engine/index.js didn't export Game/roundCfg as functions — has the module's export list drifted?");
  }

  return { Game, roundCfg, sourceHash };
}
