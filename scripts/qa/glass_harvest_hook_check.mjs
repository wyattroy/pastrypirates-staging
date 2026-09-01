#!/usr/bin/env node
// GATE: the Glass harvest hook must deny the publish that would delete Wyatt's words,
// must let every other call through, and must actually be REGISTERED.
//
// Earned twice over. CEO Review 47 found the harvest rule was prose only. CEO Review 46 found a
// gate that ran a hook FILE and called that proof the hook worked — while the hook sat
// unregistered in settings.json, doing nothing. So this gate checks both halves: the behaviour
// AND the registration, each red-proofed.
//
// It runs THE REAL HOOK as a child process with real event JSON on stdin. No paraphrase.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, utimesSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "glass-harvest-first.cjs");
let failed = false;
const fail = (m) => { failed = true; console.error(`FAIL glass_harvest_hook: ${m}`); };
const ok = (m) => console.log(`  ok: ${m}`);

// Run the hook against a throwaway tree so the real repo's stamp is never read or written.
const run = (event) => {
  const out = execFileSync("node", [HOOK], { input: JSON.stringify(event), encoding: "utf8" });
  if (!out.trim()) return null;
  try { return JSON.parse(out); } catch { return { unparseable: out }; }
};
const denies = (r) => !!r && r.hookSpecificOutput?.permissionDecision === "deny";

const tree = mkdtempSync(join(tmpdir(), "glass-harvest-"));
mkdirSync(join(tree, ".planning", "wyclau"), { recursive: true });
const stamp = join(tree, ".planning", "wyclau", "LAST-HARVEST");
const publishEvent = { tool_name: "Artifact", cwd: tree, tool_input: { file_path: `${tree}/.planning/wyclau/glass.html` } };

// 1 — the case that fired for real: publish the Glass with no harvest stamp at all.
if (!denies(run(publishEvent))) fail("1/6 a Glass publish with NO harvest stamp was allowed — the hook cannot catch the incident it was built for");
else ok("1/6 Glass publish with no harvest stamp is denied");

// 2 — a stale stamp is not evidence about THIS publish (an old read from earlier work).
writeFileSync(stamp, "2026-01-01T00:00:00Z\n");
const old = Date.now() / 1000 - 3 * 3600;
utimesSync(stamp, old, old);
if (!denies(run(publishEvent))) fail("2/6 a 3-hour-old harvest stamp was accepted — staleness is not being checked");
else ok("2/6 stale harvest stamp is denied");

// 3 — RED-PROOF OF 1 AND 2: a fresh stamp must be ALLOWED, or this gate would pass on a hook
//     that simply denies everything forever, which is a wedged publish path, not a guard.
writeFileSync(stamp, "now\n");
if (denies(run(publishEvent))) fail("3/6 VACUOUS: a FRESH harvest stamp was still denied — the hook blocks unconditionally");
else ok("3/6 fresh harvest stamp lets the publish through (the guard lets go)");

// 4 — it must never touch anything else. A publish of a different artifact, and a non-publish
//     Artifact action (reading the Glass is step one of harvesting — blocking it is the tail
//     eating itself), both with NO stamp present.
rmSync(stamp, { force: true });
const otherFile = { tool_name: "Artifact", cwd: tree, tool_input: { file_path: `${tree}/some-report.html` } };
const readAction = { tool_name: "Artifact", cwd: tree, tool_input: { action: "read", url: "https://claude.ai/code/artifact/74034bde-ad7e-4861-913e-d5d190801af2" } };
const otherTool = { tool_name: "Bash", cwd: tree, tool_input: { command: "node scripts/wyclau/glass.mjs --note x" } };
if (denies(run(otherFile))) fail("4/6 denied a publish of a DIFFERENT artifact — the hook is too broad");
else if (denies(run(readAction))) fail("4/6 denied READING the Glass — that is step one of harvesting");
else if (denies(run(otherTool))) fail("4/6 denied a non-Artifact tool call — the hook is far too broad");
else ok("4/6 other artifacts, the read action, and other tools all pass untouched");

// 5 — REGISTRATION (Review 46's finding: a gate that only runs the file passes forever while the
//     hook sits unregistered). Read the real settings.json and require it in PreToolUse.
const settingsRaw = (() => { try { return readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"); } catch { return null; } })();
const registered = (raw) => {
  if (raw === null) return false;
  let s; try { s = JSON.parse(raw); } catch { return false; }
  const pre = s?.hooks?.PreToolUse;
  if (!Array.isArray(pre)) return false;
  return pre.some((m) => (m.hooks || []).some((h) => String(h.command || "").includes("glass-harvest-first.cjs")));
};
if (!registered(settingsRaw)) fail("5/6 glass-harvest-first.cjs is NOT registered in .claude/settings.json PreToolUse — the file exists and never runs");
else ok("5/6 the hook is registered in settings.json PreToolUse");

// 6 — RED-PROOF OF 5: the predicate must return false for a settings file without it, or
//     assertion 5 is decorative and would pass on any settings.json at all.
if (registered('{"hooks":{"PreToolUse":[{"matcher":"Artifact","hooks":[{"command":"node other.cjs"}]}]}}'))
  fail("6/6 VACUOUS: the registration predicate passed a settings file that does not name the hook");
else ok("6/6 registration predicate rejects a settings file missing the hook");

rmSync(tree, { recursive: true, force: true });
if (failed) { console.error("FAIL glass_harvest_hook_check"); process.exit(1); }
console.log("PASS glass_harvest_hook_check — the harvest rule fires at the moment of the publish");
