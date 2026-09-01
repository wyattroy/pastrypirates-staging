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
import os from "node:os";

/* ⚠ THE ACCEPTED LIST IS NOT WRITTEN HERE. It is read from docs/INTENDED-BEHAVIOUR.md.
 *
 * WHY. This rubric used to carry its own two-item list of designed behaviours, and the repo also
 * grew a document of the same thing — because four separate sessions reported a deliberate
 * behaviour to Wyatt as a bug and he finally said "you need to figure out a system... so that you
 * stop asking me every single time". Two lists of designed behaviour, kept in step by whoever
 * remembers, is precisely the drift rule 23 exists to prevent: the judge would have gone on
 * failing screens the document already excused.
 *
 * So there is ONE list and this file READS it. If the fence is missing or empty that is a fault in
 * itself — a judge running with no accepted list would fail every scrollable sheet on the board —
 * so this throws rather than quietly falling back to nothing.
 */
function loadAccepted() {
  const doc = new URL("../../docs/INTENDED-BEHAVIOUR.md", import.meta.url);
  const md = fs.readFileSync(doc, "utf8");
  const m = md.match(/```accepted\n([\s\S]*?)```/);
  const lines = m ? m[1].split("\n").map(l => l.trim()).filter(l => l.startsWith("- ")) : [];
  if (lines.length < 2) {
    throw new Error("vision.mjs: docs/INTENDED-BEHAVIOUR.md has no usable ```accepted fence — "
      + "the judge will not run without its accepted list, because it would fail designed behaviour.");
  }
  return lines.join("\n");
}
const ACCEPTED = loadAccepted();

export const RUBRIC = `You are a meticulous UI reviewer looking at ONE screenshot of the browser board game "Pastry Pirates".
Judge ONLY the visual layout and presentation — NOT the gameplay, and NOT which islands/ships/recipes appear (those are randomized and always fine).
Mark FAIL if you can see ANY of these:
- an element cut off or clipped by a screen edge, by the top ribbon, or by another element;
- text overlapping other text or icons, running into a neighbour, or spilling outside its own box;
- a panel/card/box with large EMPTY dead space — much taller or wider than the content inside it;
- a button, message, prompt, or bubble jammed into a corner or against an edge, floating detached from what it belongs to, or off-screen;
- anything unreadable, misaligned, doubled, or obviously broken.
ACCEPTED — these are DESIGNED behaviour, never a FAIL and never worth listing as an issue:
${ACCEPTED}
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

/* A TRANSIENT TLS FAILURE IS NOT AN EXPIRED LOGIN — ONE PLACE, BOTH PATHS.
   The single-screen path learned this on 2026-08-28 and grew its own two retries. The batched path
   shipped without them on 2026-08-30 and was caught by its own verification run within the hour:
   at 457s a `claude -p` came back "Self-signed certificate detected", the whole pass went FATAL,
   and all 16 screens of a leg were deferred to the queue — the same shape as the hiccup that lost
   the ENTIRE picture half of the 2026.08.29.2 trial. NODE_EXTRA_CA_CERTS was correctly set the
   whole time; the proxy's TLS interception simply hiccups.
   So the retry lives HERE, once, and both callers go through it. Two things that must agree are
   one thing, or they drift (CLAUDE.md rule 23) — and this one drifted inside a single session.
   A FATAL that is NOT cert-flavoured (expired OAuth, missing CLI) still stops everything at once,
   because there every further call genuinely fails the same way. */
export async function withCertRetry(attempt, isFatal, tries = 2) {
  let r = await attempt();
  for (let i = 0; i < tries; i++) {
    const f = isFatal(r);
    if (!f || !/certificate|SSL|TLS/i.test(String((f.issues && f.issues[0]) || ""))) break;
    await new Promise(w => setTimeout(w, 3000 * (i + 1)));
    r = await attempt();
  }
  return r;
}

/* WHERE A JUDGE CALL RUNS AND WHAT IT TRUSTS — ONE DOOR, because two callers now need it.
   Both judgeScreen (one image) and judgeBatch (several) shell out to `claude -p`, and both must
   get the cwd and the CA right or they fail in the two ways this file has already paid for. Kept
   as one function rather than two copies: a second copy is two things kept in step by discipline
   (CLAUDE.md rule 23), and the whole reason these two comments exist is that getting either wrong
   is silent — the run keeps going and produces nothing. */
function judgeEnv() {
  const CA = "/root/.ccr/ca-bundle.crt";
  const env = { ...process.env };
  if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(CA)) env.NODE_EXTRA_CA_CERTS = CA;
  return { cwd: os.tmpdir(), env };
}

/* ⚠ STAGE THE IMAGES WHERE THE JUDGE IS STANDING. THE FIX ABOVE IS WHY THIS IS NEEDED.
 *
 * The child runs from a temp dir on purpose (see judgeEnv's neighbours) so it cannot inherit this
 * repo's cwd, load .claude/settings.json and be hijacked by our own hooks — measured 2026-08-28,
 * 75 calls lost that way. AND THAT PROTECTION IS EXACTLY WHAT BLINDED IT: a child sitting in /tmp
 * is refused permission to open absolute paths inside the repo, so it answers in PROSE — "I don't
 * have permission to read those image files" — and prose is not JSON, so the caller files it as a
 * PARSING problem. A whole FULL trial on 2026-08-30 judged nothing: 1494 unparseable replies and
 * 120 hard failures, and not one of the three different wordings named the wall.
 *
 * Bisected with real calls: 0 images clean · 1 image by absolute path clean · 2 and 3 refused ·
 * 5 reported as a TLS error · THREE IMAGES COPIED INTO THE CHILD'S OWN CWD returned a correct
 * array of three verdicts. So the images move to the judge, not the judge to the images.
 *
 * Basenames are kept UNCHANGED because the reply is matched back by basename (see judgeBatch). Two
 * screenshots sharing a basename in one batch would collide — that was already true of the
 * matching before this existed, and is not introduced here. */
function stageImages(absPaths) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/ppjudge-");
  const names = [];
  for (const abs of absPaths) {
    const base = String(abs).split("/").pop();
    fs.copyFileSync(abs, dir + "/" + base);
    names.push(base);
  }
  return { dir, names, cleanup() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

// judge ONE screenshot. Returns {verdict, issues, confidence, raw} or {verdict:"ERROR", ...}.
// context is a short label ("desktop 1920 — sail prompt") folded into the prompt so the model knows
// the size/mode without it changing the layout rules.
export function judgeScreen(imgPath, context = "", { model = "claude-sonnet-5", timeoutMs = 120000 } = {}) {
  const stage1 = stageImages([imgPath]);        // see stageImages — the child cannot open repo paths
  const prompt = `${RUBRIC}\n\nContext (informational only, does not change the rules): ${context}\nRead the image file ${stage1.names[0]} in the current directory and judge it.`;
  return new Promise((rawResolve1) => {
    /* THE JUDGE MUST TRUST THE PROXY'S CA, OR IT CANNOT SEE ANYTHING.
       Measured 2026-08-27: in a cloud container every judge call died with
         "API Error: Unable to connect to API: Self-signed certificate detected."
       and the trial fell back to its queue — **30 screens went unjudged in one run**, reported as
       DEFERRED rather than passed, which is the honest behaviour and still means the eyes never
       opened. Cloud sessions route HTTPS through a policy proxy that re-terminates TLS, so the
       child process has to be told where the bundle is; the parent's own trust does not inherit.
       FEATURE-DETECTED, never assumed: the file exists in a container and not on Wyatt's Mac, so
       this is a no-op on the laptop rather than a second thing to keep in step. */
    /* THE JUDGE MUST NOT RUN INSIDE THIS REPO, OR THIS REPO'S OWN HOOKS JUDGE IT INSTEAD.
       Measured 2026-08-28 on the laptop: every screen came back `judge ERROR: vision call timed
       out`, 0 verdicts in 75 calls. Cause: a child `claude -p` inherits the trial's cwd, so it
       loads .claude/settings.json and runs this project's hooks. Each call is a NEW session, so
       playtest-checklist-last.cjs's once-per-session guard never applies -- it fired on every
       one, blocked the Stop, and sent the judge off to write a checklist instead of a verdict.
       The fingerprint was 75 `checklist-asked` markers in .claude/hooks/.read-state/.
       Same call, same image, only the cwd different: from the repo it was still running at 40s;
       from a temp dir it answered in 37s.
       imgPath is absolute (playtest_gate passes it that way), so the judge has no need of the
       repo cwd at all. Do not "restore" it. */
    const { env } = judgeEnv();
    const resolve = (v) => { stage1.cleanup(); rawResolve1(v); };
    const child = execFile("claude", ["-p", prompt, "--model", model, "--output-format", "json"],
      { maxBuffer: 16 * 1024 * 1024, env, cwd: stage1.dir }, (err, stdout) => {
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
        /* THE REPLY GOES IN THE ISSUES, NOT ONLY IN `raw`. On 2026-08-30 this resolved `raw` and
           the caller logged only the phrase, so 1494 failures produced NO evidence of why and the
           cause had to be found by hand-bisecting the judge. What it actually said was "I don't
           have permission to read those image files" — one line that would have ended it. An
           instrument that discards the evidence of its own failure cannot be debugged from its own
           output. */
        if (!j || !j.verdict) return resolve({ verdict: "ERROR", confidence: 0, raw: String(text).slice(0, 200),
          issues: ["unparseable judge reply: " + String(text).replace(/\s+/g, " ").trim().slice(0, 140)] });
        resolve({ verdict: /fail/i.test(j.verdict) ? "FAIL" : "PASS", issues: Array.isArray(j.issues) ? j.issues : [], confidence: +j.confidence || 0 });
      });
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve({ verdict: "ERROR", issues: ["vision call timed out"], confidence: 0 }); }, timeoutMs);
    child.on("exit", () => clearTimeout(t));
  });
}

/* JUDGE SEVERAL SCREENS IN ONE CALL — because one call per screenshot is most of what the eyes cost.
 *
 * MEASURED 2026-08-30, this container, real trial screenshots:
 *     one screen, one call     $0.049   8.7s   (another, same size, took 42.6s)
 *     five screens, one call   $0.103   31.3s
 * Every call is a whole `claude -p` session boot — a fresh system prompt and tool table — for a
 * ~500-token rubric and one image. A ten-leg fleet is ~300 of those: roughly $15, 25-40 minutes,
 * and 300 separate chances to be hit by the proxy hiccup that lost the ENTIRE picture half of the
 * 2026.08.29.2 trial. Batching is 5x fewer calls and ~2.4x cheaper, and it is what makes looking
 * at EVERY screen affordable rather than the first thirty (see JUDGE_CAP's removal).
 *
 * RED-PROOFED BEFORE BEING BELIEVED: a deliberately broken layout hidden among four real
 * screenshots came back FAIL, naming the overlap and the clipping. Batching did not make it lazy
 * on the one that mattered. (n=1 planted fault — evidence, not proof, and worth re-testing if the
 * batch size is ever raised.)
 *
 * A SCREEN THE REPLY DOES NOT MENTION IS NOT A PASS. It is left undefined, exactly as judgeAll
 * leaves screens it never reached, because the one thing this whole file exists to prevent is a
 * screen nobody looked at being counted as a screen that was fine.
 */
export function judgeBatch(items, { model = "claude-sonnet-5", timeoutMs = 300000 } = {}) {
  const stage = stageImages(items.map(it => it.path));
  const list = items.map((it, i) => `${i + 1}. ${stage.names[i]}${it.context ? `   (context, informational only: ${it.context})` : ""}`).join("\n");
  const prompt = `${RUBRIC}

You are judging ${items.length} screenshots, listed below. Read EVERY image file and judge each one
SEPARATELY against the rules above. Do not let one screen's verdict influence another's.
Reply with ONLY a JSON array, one object per image, in the same order, no prose:
[{"file":"<the file's basename>","verdict":"PASS"|"FAIL","issues":["short concrete phrase"],"confidence":0.0-1.0}]

Images:
${list}`;
  return new Promise((rawResolve) => {
    const { env } = judgeEnv();
    // the images are HERE now, so the child works from the staging dir and names them bare
    const resolve = (v) => { stage.cleanup(); rawResolve(v); };
    const child = execFile("claude", ["-p", prompt, "--model", model, "--output-format", "json"],
      { maxBuffer: 32 * 1024 * 1024, env, cwd: stage.dir }, (err, stdout) => {
        if (err && !stdout) return resolve({ unparseable: "batch call failed: " + String(err.message || err).slice(0, 120) });
        let text = stdout, outer = null;
        try { outer = JSON.parse(stdout); text = outer.result ?? stdout; } catch {}
        if (outer && outer.is_error === true)
          return resolve({ fatal: { verdict: "FATAL", issues: ["the judge cannot run: " + String(text).slice(0, 160)], confidence: 0 } });
        const fence = String(text).match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        const raw = fence ? fence[1] : (String(text).match(/\[[\s\S]*\]/) || [null])[0];
        let arr = null;
        try { arr = raw ? JSON.parse(raw) : null; } catch {}
        if (!Array.isArray(arr)) return resolve({ unparseable: "batch reply was not a JSON array: " + String(text).replace(/\s+/g, " ").trim().slice(0, 140), raw: String(text).slice(0, 200) });
        /* MATCH BY BASENAME, NOT BY POSITION. The model is asked for the same order and usually
           obeys, but a verdict attached to the wrong screenshot is worse than no verdict at all —
           it would send a reader to the wrong picture. Position is used only as a fallback when a
           row carries no recognisable filename. */
        const byName = new Map();
        for (const row of arr) {
          if (!row || !row.verdict) continue;
          const name = String(row.file || "").split("/").pop();
          if (name) byName.set(name, row);
        }
        const out = new Map();
        items.forEach((it, i) => {
          const base = it.path.split("/").pop();
          const row = byName.get(base) || (byName.size === 0 && arr[i] && arr[i].verdict ? arr[i] : null);
          if (!row) return;                       // never mentioned -> NOT judged, NOT cleared
          out.set(it.path, { verdict: /fail/i.test(row.verdict) ? "FAIL" : "PASS",
            issues: Array.isArray(row.issues) ? row.issues : [], confidence: +row.confidence || 0 });
        });
        resolve({ results: out });
      });
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve({ unparseable: "batch call timed out" }); }, timeoutMs);
    child.on("exit", () => clearTimeout(t));
  });
}

// judge many screenshots with bounded concurrency (each call is a full CLI/account inference).
export async function judgeAllOneByOne(items, { concurrency = 3, model = "claude-sonnet-5", onEach } = {}) {
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
      /* The cert-flavoured retry that used to be written out here now lives in withCertRetry(),
         above, because the batched path needs exactly the same protection and did not have it. */
      results[i] = await withCertRetry(
        () => judgeScreen(items[i].path, items[i].context || "", { model }),
        x => (x && x.verdict === "FATAL") ? x : null);
      if (results[i] && results[i].verdict === "FATAL" && !fatal) fatal = results[i];
      if (onEach) onEach(items[i], results[i], i);
    }
  }));
  results.fatal = fatal;
  return results;
}

/* THE PASS THE TRIAL ACTUALLY CALLS — batched, with one-by-one as the safety net.
 *
 * Same contract as before: an array parallel to `items`, holes left undefined for anything not
 * judged, and `.fatal` set when the judge cannot run at all. Only the vehicle changed.
 *
 * WHY A FALLBACK RATHER THAN A RETRY. If a batch's reply cannot be parsed, the five screens in it
 * have still not been looked at, and quietly dropping them is the failure this file was written
 * against. So that batch is re-judged ONE AT A TIME — slower, but it is the difference between
 * five screens seen and five screens silently missing. A FATAL is different and is not retried
 * here: it means no call can work, and judgeAllOneByOne's own cert-flavoured retry has already
 * had its two attempts inside the batch path's caller.
 *
 * BATCH SIZE: 5, measured (see judgeBatch). Not a magic number to tune blind — if it changes,
 * re-run the planted-fault red-proof, because the risk of a bigger batch is a lazier look at each
 * screen, which would be invisible in the timings and fatal to the point of the whole pass.
 */
/* `_batchFn` and `_oneByOneFn` exist ONLY so a gate can drive the loop below deterministically —
   the real ones shell out to `claude -p`, which a check cannot depend on. Nothing in production
   passes them. A seam this small is worth it: the behaviour underneath is what cost 80 minutes,
   and an untestable fix for an untestable bug is how that happens twice. */
export async function judgeAll(items, { concurrency = 3, batch = 5, model = "claude-sonnet-5", onEach,
  _batchFn = null, _oneByOneFn = null } = {}) {
  const results = new Array(items.length);
  const groups = [];
  for (let i = 0; i < items.length; i += batch) groups.push({ at: i, items: items.slice(i, i + batch) });
  let fatal = null, nextG = 0;
  /* THE CIRCUIT BREAKER, added 2026-09-01 after a trial spent 80 of its 111 minutes here.
     A BROKEN JUDGE IS NOT AN ABSENT ONE, and only an absent one used to stop this loop. A timeout
     resolves to {unparseable}/{verdict:"ERROR"} rather than FATAL, so a judge that answered nothing
     kept its `fatal` flag clear and every remaining group paid full price: the batch timeout (300s)
     and then five single-screen timeouts (120s each) in the "look at them singly rather than lose
     them" safety net below. Sixty screens is hours.
     The evidence that it is dead rather than unlucky: NOT ONE screen has produced a usable verdict
     yet, and a whole group has now failed. No threshold to tune — the condition is "nothing has
     ever worked", which is as strong as this can know and costs exactly one group to establish. */
  let sawGood = false;
  const noneUsable = (g) => g.items.every((_, k) => !results[g.at + k]);
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, async () => {
    while (nextG < groups.length) {
      if (fatal) return;
      const g = groups[nextG++];
      const runBatch = _batchFn || ((its) => judgeBatch(its, { model }));
      const r = await withCertRetry(() => runBatch(g.items), x => x && x.fatal);
      if (r.fatal) { if (!fatal) fatal = r.fatal; return; }
      if (r.unparseable) {
        // the safety net: these screens have NOT been seen, so look at them singly rather than lose them
        const one = _oneByOneFn
          ? await _oneByOneFn(g.items)
          : await judgeAllOneByOne(g.items, { concurrency: Math.min(3, g.items.length), model });
        if (one.fatal && !fatal) fatal = one.fatal;
        g.items.forEach((it, k) => { results[g.at + k] = one[k]; if (onEach && one[k]) onEach(it, one[k], g.at + k); });
        if (!sawGood && noneUsable(g) && !fatal) {
          fatal = { verdict: "FATAL", confidence: 0, issues: [
            "the judge produced no usable verdict for any screen in the first group it was given, " +
            "batched or one by one — treating it as dead rather than paying its timeout on every " +
            "remaining screen. The screens are kept and can be judged later.",
          ] };
          return;
        }
        if (g.items.some((_, k) => results[g.at + k])) sawGood = true;
        continue;
      }
      g.items.forEach((it, k) => {
        const v = r.results.get(it.path);
        if (!v) return;                              // not mentioned -> stays undefined, NOT cleared
        results[g.at + k] = v;
        sawGood = true;                              // the judge CAN answer — the breaker stands down
        if (onEach) onEach(it, v, g.at + k);
      });
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
    what: "A vision-judging queue left by scripts/playtest_gate.mjs.",
    how_to_use: [
      "You are a Claude session. Judge these screenshots yourself — do NOT shell out to `claude -p`;",
      "that path is what this file exists to replace (one shared OAuth credential, see vision.mjs).",
      "1. Read `rubric` below. It is the exact rubric the gate used to send.",
      "2. For EACH entry in `screens`, open the image at its `shot` path and judge it against the rubric.",
      "3. Write your verdicts to `judge-results.json` beside this file, as",
      "   {\"results\": [{\"shot\": \"<same shot path>\", \"verdict\": \"PASS\"|\"FAIL\", \"issues\": [\"...\"], \"confidence\": 0..1}]}",
      "4. Run: node scripts/apply_judge_results.mjs <this directory>",
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
