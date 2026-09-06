/* SCRATCH — T-261. Does the SFX PRD's new comment mechanism actually WORK in a browser?
 *
 * Same pattern as _t076_row_ui_probe.mjs (which found the bug that ate his words on the live
 * Glass page): a fake `window.claude.use("artifact")` host installed BEFORE the page script
 * runs, a real click, and an assertion that a publish actually fires and the comment renders
 * back — not just that nothing crashed with no capability granted.
 *
 * ADDS ONE THING _t076 DIDN'T NEED: this page's buildDoc() is a hand-baked TPL/STATE quine
 * (build_annotatable_artifact.mjs), not glass.mjs's live generator — so this probe also feeds
 * the published output BACK into a second page load and confirms the comment survives a
 * round-trip, which is the one failure mode unique to a bake-once template (a token that
 * doesn't re-embed correctly looks fine on the FIRST save and corrupts on the second).
 *
 * ⛔ BOUNDED AND SELF-KILLING (rule 17). Every wait is a for-loop with a ceiling; the browser is
 * killed in a finally block; nothing is left on disk outside OUT.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS } from "../lib/chrome.mjs";

const PAGE = process.argv[2];
const OUT = process.argv[3] || ".";
if (!PAGE || !fs.existsSync(PAGE)) { console.log("usage: node _t261_prd_comment_probe.mjs <page.html> [outdir]"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const PORT = 9482;
const profile = path.join(process.env.TEMP || "/tmp", "chrome-t261probe");
fs.rmSync(profile, { recursive: true, force: true });
let proc = null, failed = 0;
const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => { console.log("  FAIL  " + m); failed++; };

async function driveOnce(fileToLoad, script) {
  proc = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=900,1400",
    "file:///" + fileToLoad.replace(/\\/g, "/")], { stdio: ["ignore", "pipe", "pipe"] });

  let ver = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { /* not up */ }
  }
  if (!ver) throw new Error("Chrome never came up on port " + PORT);

  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  }
  if (!target) throw new Error("the page never appeared as a target");

  const { WebSocket } = await import("node:worker_threads").then(() => ({ WebSocket: globalThis.WebSocket }));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); return true; }
    return false;
  };

  await send("Page.enable", {});
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__pubs = 0; window.__lastPub = null; window.__pageErrors = [];
    window.addEventListener("error", function(e){ window.__pageErrors.push(String(e.message)); });
    window.claude = { use: function(){ return Promise.resolve({
      publish: function(html){ window.__pubs++; window.__lastPub = html; return Promise.resolve({ ok: true }); }
    }); } };
  ` });
  await send("Page.navigate", { url: "file:///" + fileToLoad.split("\\").join("/") });
  await new Promise((r) => setTimeout(r, 1500));

  const result = await script({ evalJs, shot });
  try { ws.close(); } catch { /* closing */ }
  try { proc.kill("SIGKILL"); } catch { /* already gone */ }
  proc = null;
  await new Promise((r) => setTimeout(r, 300));
  return result;
}

try {
  // PASS 1 — load the real published page, save a comment on a section box and a question box,
  // confirm both publish and both render back, screenshot the picture (rule 19).
  const pass1 = await driveOnce(PAGE, async ({ evalJs, shot }) => {
    const counts = await evalJs(`JSON.stringify({
      boxes: document.querySelectorAll(".cbox[data-handle]").length,
      sectionBoxes: document.querySelectorAll('h2 ~ .cbox[data-handle^="s"]').length,
      questionBoxes: document.querySelectorAll('.q .cbox[data-handle^="q"]').length
    })`);
    const c = JSON.parse(counts || "{}");
    if (c.boxes === 13) ok(`13 comment boxes rendered (${counts})`); else bad(`expected 13 comment boxes, got ${counts}`);

    await shot("t261-loaded.png") ? ok("screenshot: page loaded with comment boxes") : bad("could not screenshot");

    const saved = await evalJs(`(function(){
      var bt = String.fromCharCode(96);
      function saveInto(handle, text){
        var box = document.querySelector('.cbox[data-handle="' + handle + '"]');
        var ta = box.querySelector(".cta");
        ta.value = text;
        box.querySelector(".csend").click();
        return {
          boxAfter: ta.value,
          told: box.querySelector(".csaid").textContent,
          mine: box.querySelectorAll(".cmine").length,
          mineText: box.querySelector(".cmine") ? box.querySelector(".cmine").textContent : null
        };
      }
      var s2 = saveInto("s2", "correct the Cannons mapping, it is wrong");
      var q1 = saveInto("q1", "Alarm.mp3 $5 test with a " + bt + "backtick" + bt);
      return JSON.stringify({ s2: s2, q1: q1, pubs: window.__pubs, errs: (window.__pageErrors||[]).slice(0,3) });
    })()`);
    const sv = JSON.parse(saved || "{}");
    console.log("  after two saves:", saved);
    if (sv.pubs === 2) ok("two saves fire two publishes"); else bad(`expected 2 publishes, got ${sv.pubs}`);
    if (sv.s2 && sv.s2.mine === 1 && /Cannons/.test(sv.s2.mineText)) ok("section comment (s2) renders back verbatim");
    else bad(`section comment did not render back: ${JSON.stringify(sv.s2)}`);
    if (sv.q1 && sv.q1.mine === 1 && /\$5/.test(sv.q1.mineText) && /backtick/.test(sv.q1.mineText)) ok("question comment (q1), with a literal $ and backticks, renders back verbatim");
    else bad(`question comment did not render back intact: ${JSON.stringify(sv.q1)}`);
    if (!sv.errs || sv.errs.length === 0) ok("no JS errors while saving"); else bad(`page threw: ${JSON.stringify(sv.errs)}`);

    await shot("t261-after-save.png") ? ok("screenshot: after saving two comments") : bad("could not screenshot");

    const lastPub = await evalJs("window.__lastPub");
    return lastPub;
  });

  if (!pass1 || typeof pass1 !== "string" || pass1.length < 1000) {
    bad("no usable published HTML captured from pass 1 — cannot test the round-trip");
  } else {
    ok(`captured ${pass1.length} bytes of published HTML from the fake host`);
    const roundTripFile = path.join(OUT, "t261-roundtrip.html");
    fs.writeFileSync(roundTripFile, pass1, "utf8");

    // PASS 2 — load what pass 1 PUBLISHED (not the original file). This is the real test of the
    // hand-baked TPL/STATE quine: does a page built from a PREVIOUS buildDoc() output still carry
    // both comments AND still work for a THIRD save?
    await driveOnce(roundTripFile, async ({ evalJs, shot }) => {
      const state = await evalJs(`(function(){
        var box2 = document.querySelector('.cbox[data-handle="s2"] .cmine');
        var box1 = document.querySelector('.cbox[data-handle="q1"] .cmine');
        return JSON.stringify({ s2: box2 ? box2.textContent : null, q1: box1 ? box1.textContent : null });
      })()`);
      const st = JSON.parse(state || "{}");
      console.log("  round-trip reload shows:", state);
      if (st.s2 && /Cannons/.test(st.s2)) ok("round-tripped page still shows the s2 comment after reload");
      else bad(`s2 comment lost on reload: ${state}`);
      if (st.q1 && /\$5/.test(st.q1)) ok("round-tripped page still shows the q1 comment (with $ intact) after reload");
      else bad(`q1 comment lost on reload: ${state}`);

      const thirdSave = await evalJs(`(function(){
        var box = document.querySelector('.cbox[data-handle="q7"]');
        var ta = box.querySelector(".cta");
        ta.value = "third save, second generation of the template";
        box.querySelector(".csend").click();
        return JSON.stringify({ mine: box.querySelectorAll(".cmine").length, pubs: window.__pubs, errs: (window.__pageErrors||[]).slice(0,3) });
      })()`);
      const ts = JSON.parse(thirdSave || "{}");
      console.log("  third save, on the regenerated template:", thirdSave);
      if (ts.pubs === 1) ok("a SECOND-generation page can still save and publish a THIRD comment");
      else bad(`second-generation save failed: ${thirdSave}`);
      if (ts.mine === 1) ok("…and it renders back, so the quine survives a second round"); else bad("third comment did not render");

      await shot("t261-roundtrip.png") ? ok("screenshot: second-generation page after a third save") : bad("could not screenshot round-trip");
    });
  }
} catch (e) {
  bad("probe error: " + String(e && e.message).slice(0, 200));
} finally {
  if (proc) { try { proc.kill("SIGKILL"); } catch { /* already gone */ } }
  await new Promise((r) => setTimeout(r, 300));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(failed ? `\nFAIL — ${failed} check(s)` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
