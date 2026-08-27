// vision.mjs — the AUTOMATIC vision judge (Wyatt's pick, 2026-08-21): look at a screenshot the way
// a person does and say whether it "looks right", with NO per-bug rules. This is what makes the
// gate general instead of a growing list of yesterday's bugs — the model SEES an empty panel or a
// clipped name the same way Wyatt does at a glance, without anyone naming "empty tower" in code.
//
// Vehicle: the `claude` CLI in print mode (`claude -p`), which uses the machine's existing Claude
// auth — no API key to manage, works the same on the laptop and in a cloud session. Proven
// 2026-08-21 to catch the build-v empty tower + name/coin overlap from one general prompt.
import { execFile } from "node:child_process";
import fs from "node:fs";

export const RUBRIC = `You are a meticulous UI reviewer looking at ONE screenshot of the browser board game "Pastry Pirates".
Judge ONLY the visual layout and presentation — NOT the gameplay, and NOT which islands/ships/recipes appear (those are randomized and always fine).
Mark FAIL if you can see ANY of these:
- an element cut off or clipped by a screen edge, by the top ribbon, or by another element;
- text overlapping other text or icons, running into a neighbour, or spilling outside its own box;
- a panel/card/box with large EMPTY dead space — much taller or wider than the content inside it;
- a button, message, prompt, or bubble jammed into a corner or against an edge, floating detached from what it belongs to, or off-screen;
- anything unreadable, misaligned, doubled, or obviously broken.
ACCEPTED — these are DESIGNED behaviour, never a FAIL and never worth listing as an issue:
- a scrollable card or sheet may run past the bottom of the screen; being cut off at the bottom edge is how it tells you to scroll;
- board artwork (the map, islands, ships, logo, decorative art) may be clipped at the edge of the board itself — the board is a camera view of a larger map, so its contents are cut off by design.
Mark PASS if the screen looks clean, balanced and intentional.
Reply with ONLY a JSON object, no prose:
{"verdict":"PASS"|"FAIL","issues":["short concrete phrase", "..."],"confidence":0.0-1.0}`;

function extractJSON(text) {
  // the model may wrap the JSON in prose or a code fence — pull the first {...} object out
  const fence = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const raw = fence ? fence[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// judge ONE screenshot. Returns {verdict, issues, confidence, raw} or {verdict:"ERROR", ...}.
// context is a short label ("desktop 1920 — sail prompt") folded into the prompt so the model knows
// the size/mode without it changing the layout rules.
export function judgeScreen(imgPath, context = "", { model = "claude-sonnet-5", timeoutMs = 120000 } = {}) {
  const prompt = `${RUBRIC}\n\nContext (informational only, does not change the rules): ${context}\nRead the image file at ${imgPath} and judge it.`;
  return new Promise((resolve) => {
    const child = execFile("claude", ["-p", prompt, "--model", model, "--output-format", "json"],
      { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err && !stdout) return resolve({ verdict: "ERROR", issues: ["vision call failed: " + String(err.message || err).slice(0, 120)], confidence: 0 });
        let text = stdout;
        let outer = null;
        try { outer = JSON.parse(stdout); text = outer.result ?? stdout; } catch {}   // --output-format json wraps the reply in {result,...}
        /* AN ENVIRONMENT FAILURE IS NOT A BAD ANSWER, AND IT MUST NOT BE COUNTED AS ONE.
           2026-08-22: the machine's `claude` login expired. Every call returned a perfectly valid
           JSON envelope whose `result` was "Failed to authenticate: OAuth session expired and could
           not be refreshed" — so extractJSON found no verdict and this resolved "unparseable judge
           reply", SIXTY-SEVEN TIMES, once per screenshot, while the run ground on. The judge cannot
           work at all in that state, so the honest reading is FATAL: stop, say the one thing that
           is wrong, and let the caller abandon the whole vision pass instead of manufacturing 67
           findings-shaped non-findings. Anything that reads as a bad reply on EVERY screen is an
           instrument failure, not a game with 67 broken screens. */
        if (outer && outer.is_error === true) return resolve({ verdict: "FATAL", issues: ["the judge cannot run: " + String(text).slice(0, 160)], confidence: 0 });
        const j = extractJSON(String(text));
        if (!j || !j.verdict) return resolve({ verdict: "ERROR", issues: ["unparseable judge reply"], confidence: 0, raw: String(text).slice(0, 200) });
        resolve({ verdict: /fail/i.test(j.verdict) ? "FAIL" : "PASS", issues: Array.isArray(j.issues) ? j.issues : [], confidence: +j.confidence || 0 });
      });
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve({ verdict: "ERROR", issues: ["vision call timed out"], confidence: 0 }); }, timeoutMs);
    child.on("exit", () => clearTimeout(t));
  });
}

// judge many screenshots with bounded concurrency (each call is a full CLI/account inference).
export async function judgeAll(items, { concurrency = 3, model = "claude-sonnet-5", onEach } = {}) {
  const results = new Array(items.length);
  let next = 0;
  /* ONE FATAL STOPS THE WHOLE PASS. A FATAL means the judge cannot run at all (an expired login, a
     missing CLI) — it says nothing about the screen it was pointed at, so every further call is
     guaranteed to fail the same way and would only bury the one real message under a pile of
     identical ones. Screens never reached are left `undefined` rather than marked PASS: a screen
     that was not judged has NOT been cleared, and the caller must be able to tell those apart. */
  let fatal = null;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (fatal) return;
      const i = next++;
      results[i] = await judgeScreen(items[i].path, items[i].context || "", { model });
      if (results[i] && results[i].verdict === "FATAL" && !fatal) fatal = results[i];
      if (onEach) onEach(items[i], results[i], i);
    }
  }));
  results.fatal = fatal;
  return results;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   THE QUEUE HANDOFF — judging without a second credential (Wyatt, 2026-08-22)

   WHY THIS EXISTS. The judge used to shell out to `claude -p` once per screenshot. That reads the
   ONE OAuth credential in the macOS Keychain — the same one a running Claude Code session holds and
   periodically refreshes. Refreshing rotates it, so a gate launched from inside a session gets a
   token that has already been rotated out from under it and dies with "OAuth session expired and
   could not be refreshed". There is no per-tool login to escape this with: the CLI's own help says
   non-interactive auth is strictly ANTHROPIC_API_KEY or an apiKeyHelper, and in that mode the
   keychain is never read at all. Wyatt's ruling: no separately-billed key for a routine QA step.

   SO THE VEHICLE CHANGES. The gate stops trying to BE a judge and instead leaves a queue: every
   screenshot it wants looked at, the rubric to look with, and the context. Any Claude session — the
   one he already has open, on the laptop or in the cloud — reads the images directly and writes the
   verdicts back. Same model, same rubric, no CLI, no keychain, nothing to expire, nothing to bill.

   THE TRADE-OFF, STATED HONESTLY: it is not unattended. A run with nobody home still plays complete
   voyages and runs every structural check — which is what caught the recipe picker on 2026-08-22 —
   but the visual pass waits for a session. That is the right trade, because the unattended path is
   precisely the one that failed.

   THE QUEUE FILE CARRIES ITS OWN INSTRUCTIONS. A session that opens it should not need to be told
   what to do with it, and should not have to find this comment to find out.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
export function writeJudgeQueue(dir, entries, meta = {}) {
  const q = {
    what: "A vision-judging queue left by 4/scripts/playtest_gate.mjs.",
    how_to_use: [
      "You are a Claude session. Judge these screenshots yourself — do NOT shell out to `claude -p`;",
      "that path is what this file exists to replace (one shared OAuth credential, see vision.mjs).",
      "1. Read `rubric` below. It is the exact rubric the gate used to send.",
      "2. For EACH entry in `screens`, open the image at its `shot` path and judge it against the rubric.",
      "3. Write your verdicts to `judge-results.json` beside this file, as",
      "   {\"results\": [{\"shot\": \"<same shot path>\", \"verdict\": \"PASS\"|\"FAIL\", \"issues\": [\"...\"], \"confidence\": 0..1}]}",
      "4. Run: node 4/scripts/apply_judge_results.mjs <this directory>",
      "   It merges them into judge-findings.txt in the same shape the gate has always produced.",
      "A screen you do not judge stays UNJUDGED — it is not cleared. Never mark one PASS to finish the list."
    ],
    status: "pending",
    created_hint: "timestamps are not written here on purpose — the gate's own log carries them",
    meta,
    rubric: RUBRIC,
    screens: entries.map(e => ({ shot: e.shot, context: e.context || "" }))
  };
  fs.writeFileSync(dir + "/judge-queue.json", JSON.stringify(q, null, 1));
  return q.screens.length;
}
