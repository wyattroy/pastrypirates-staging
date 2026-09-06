#!/usr/bin/env node
/* hook_gear_override_reachable_check.mjs — CEO 180 finding 1, closed for real.
 *
 * "You can lower the gear on the record" is only true if the FIRST place a session meets the gear
 * decision -- .claude/hooks/qa-gear-first.cjs, which fires before anyone thinks to run
 * `node scripts/qa/gear.mjs` by hand -- actually says so. gear.mjs already prints the override
 * note; this check drives the HOOK ITSELF (spawn it with a real PreToolUse-shaped stdin such as
 * Claude Code sends) and asserts the denial reason it returns mentions --gear=, --reason= and
 * --explain, for both gears the hook ever names (FULL and PLUMBING).
 *
 * A second, separate assertion lives here too: on Windows, tool_input.file_path arrives with
 * backslash separators, and isGameCode()'s exclusion list is forward-slash regexes -- found live
 * while writing this very file (see below). Kept in the same check because both live in the exact
 * code path the reachability fix touches, and a fix to one without the other still lies to Wyatt
 * about what counts as game code on this machine.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..", "..");
const hookPath = path.join(repo, ".claude", "hooks", "qa-gear-first.cjs");

function runHook(hookFile, { relPath, content, sessionId }) {
  const payload = JSON.stringify({
    session_id: sessionId,
    tool_name: "Edit",
    tool_input: { file_path: path.win32.join(repo, relPath), new_string: content },
  });
  const res = spawnSync(process.execPath, [hookFile], { input: payload, encoding: "utf8" });
  let reason = "";
  try {
    const out = JSON.parse(res.stdout || "{}");
    reason = out?.hookSpecificOutput?.permissionDecisionReason || "";
  } catch { /* leave reason empty -- treated as a failure below */ }
  return { reason, stderr: res.stderr, status: res.status };
}

function cleanupMarker(sessionId) {
  const dir = path.join(repo, ".claude", "hooks", ".read-state", sessionId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function checkOverrideReachable(hookFile, label) {
  const cases = [
    {
      name: "FULL gear (board-drawing file, no plumbing marker)",
      relPath: "src\\ui\\stage.js",
      content: "function camFitSeats(seats) { /* draws captains */ }",
      gear: "FULL",
    },
    {
      name: "PLUMBING gear (lobby room-code file)",
      relPath: "src\\ui\\lobby.js",
      content: "function netCreateRoom() { /* room code plumbing */ }",
      gear: "PLUMBING",
    },
  ];

  const results = [];
  for (const c of cases) {
    const sessionId = `hookcheck-${label}-${c.gear}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cleanupMarker(sessionId);
    const { reason, status } = runHook(hookFile, { relPath: c.relPath, content: c.content, sessionId });
    cleanupMarker(sessionId);

    const hasGearFlag = /--gear=/.test(reason);
    const hasReasonFlag = /--reason=/.test(reason);
    const hasExplainFlag = /--explain/.test(reason);
    const gearNamedCorrectly = reason.includes(`GEAR: ${c.gear}`);
    const ok = hasGearFlag && hasReasonFlag && hasExplainFlag && gearNamedCorrectly && status === 0 && reason.length > 0;
    results.push({ name: c.name, ok, hasGearFlag, hasReasonFlag, hasExplainFlag, gearNamedCorrectly, reasonLen: reason.length });
  }
  return results;
}

function checkNotGameOnWindowsPaths(hookFile, label) {
  const cases = [
    { name: "scripts/qa file (backslash path) must NOT be game code", relPath: "scripts\\qa\\some_check.mjs", content: "// a QA gate, not the game" },
    { name: ".claude/hooks file (backslash path) must NOT be game code", relPath: ".claude\\hooks\\some-hook.cjs", content: "// tooling, not the game" },
    { name: "docs file (backslash path) must NOT be game code", relPath: "docs\\SOME-DOC.md", content: "docs are never game code" },
  ];
  const results = [];
  for (const c of cases) {
    const sessionId = `hookcheck-${label}-notgame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cleanupMarker(sessionId);
    const { reason } = runHook(hookFile, { relPath: c.relPath, content: c.content, sessionId });
    cleanupMarker(sessionId);
    const wronglyDenied = reason.length > 0;
    results.push({ name: c.name, ok: !wronglyDenied, reasonLen: reason.length });
  }
  return results;
}

function runAll(hookFile, label) {
  return [...checkOverrideReachable(hookFile, label), ...checkNotGameOnWindowsPaths(hookFile, label)];
}

const results = runAll(hookPath, "live");
const allOk = results.every(r => r.ok);

console.log(`hook_gear_override_reachable_check -- ${hookPath}`);
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.ok) {
    console.log(`        reason text length: ${r.reasonLen}`);
    if ("hasGearFlag" in r) {
      console.log(`        gear named correctly: ${r.gearNamedCorrectly}`);
      console.log(`        mentions --gear=:     ${r.hasGearFlag}`);
      console.log(`        mentions --reason=:   ${r.hasReasonFlag}`);
      console.log(`        mentions --explain:   ${r.hasExplainFlag}`);
    }
  }
}

process.exit(allOk ? 0 : 1);
