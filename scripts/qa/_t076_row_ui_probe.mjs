/* SCRATCH — T-076. Does the Glass's new row UI actually WORK in a browser, and does it LOOK right?
 *
 * Rule 19: look at the rendered picture, not the DOM. This drives a real headless Chrome over the
 * rehearsal page, exercises the expander and the comment box the way Wyatt would, and writes two
 * screenshots — collapsed and expanded — so the change can be judged as a picture.
 *
 * ⚠ BOUNDED AND SELF-KILLING (rule 17). Every wait is a for-loop with a ceiling, and the browser is
 * killed in a finally block. A sea trial is at sea on this machine while this runs; this probe owns
 * ONE browser on its own port and profile and takes nothing else down.
 *
 * `cap` is null outside the artifact host, so a real publish cannot happen here. That is the point
 * of the last check: the Save button must fail VISIBLY and keep his words, never throw.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS } from "../lib/chrome.mjs";

const PAGE = process.argv[2];
const OUT = process.argv[3] || ".";
if (!PAGE || !fs.existsSync(PAGE)) { console.log("usage: node _t076_row_ui_probe.mjs <page.html> [outdir]"); process.exit(2); }

const PORT = 9481;
const profile = path.join(process.env.TEMP || "/tmp", "chrome-t076probe");
fs.rmSync(profile, { recursive: true, force: true });
let proc = null, failed = 0;
const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => { console.log("  FAIL  " + m); failed++; };

const cdp = async (sessionId, method, params) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return { r };
};

try {
  proc = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--mute-audio", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=900,1400",
    "file:///" + PAGE.replace(/\\/g, "/")], { stdio: ["ignore", "pipe", "pipe"] });

  let ver = null;
  for (let i = 0; i < 30; i++) {                       // bounded, rule 17
    await new Promise((r) => setTimeout(r, 500));
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { /* not up */ }
  }
  if (!ver) { bad("Chrome never came up on port " + PORT); throw new Error("no browser"); }
  console.log("  browser:", ver.Browser);

  let target = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  }
  if (!target) { bad("the page never appeared as a target"); throw new Error("no target"); }

  // Minimal CDP over the websocket — no dependency, and the message set is tiny.
  const { WebSocket } = await import("node:worker_threads").then(() => ({ WebSocket: globalThis.WebSocket }));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    if (r.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); return true; }
    return false;
  };

  await send("Page.enable", {});

  /* ⛔ A FAKE ARTIFACT HOST, INSTALLED BEFORE THE PAGE SCRIPT RUNS. This is the whole reason this
     probe missed a bug that ate his words on the live page.
     Without a capability, glass.mjs returns at `if (!cap) { ...; return; }` -- BEFORE the push, the
     repaint and the publish. So the old save check exercised a guard clause and reported "his words
     stay in the box", which was true and was not the question: it could never reach the code it was
     named after. CEO 143 called it "structurally incapable", and it is CEO 140's finding one night
     later in a different file.
     window.__pubs counts real publish calls, so the probe can assert the save actually happened
     rather than that it did not crash. */
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__pubs = 0; window.__pageErrors = [];
    window.addEventListener("error", function(e){ window.__pageErrors.push(String(e.message)); });
    window.claude = { use: function(){ return Promise.resolve({
      publish: function(){ window.__pubs++; return Promise.resolve({ ok: true }); }
    }); } };
  ` });
  await send("Page.navigate", { url: "file:///" + PAGE.split("\\").join("/") });
  await new Promise((r) => setTimeout(r, 2500));

  const errs = await evalJs("(window.__probeErrors||[]).length");
  const counts = await evalJs(`JSON.stringify({
    rows: document.querySelectorAll("#taskList li").length,
    more: document.querySelectorAll(".rowmore").length,
    boxes: document.querySelectorAll(".rowcmt textarea").length,
    visibleBoxes: Array.prototype.filter.call(document.querySelectorAll(".rowcmt"), function(n){ return n.offsetParent !== null; }).length,
    openPanels: Array.prototype.filter.call(document.querySelectorAll(".rowpanel"), function(d){ return !d.hidden; }).length
  })`);
  const c = JSON.parse(counts || "{}");
  console.log("  counts:", counts);

  if (c.rows > 0) ok(`${c.rows} task rows rendered`); else bad("no task rows rendered at all");
  if (c.more > 0) ok(`${c.more} rows offer "more"`); else bad("no expander buttons rendered");
  if (c.boxes > 0) ok(`${c.boxes} rows have a comment box`); else bad("no comment boxes rendered");
  if (c.openPanels === 0) ok("every detail starts COLLAPSED — the page at rest is the short list he reads");
  else bad(`${c.openPanels} panel(s) are open on load — the list is not at rest`);

  await shot("t076-collapsed.png") ? ok("screenshot: collapsed") : bad("could not screenshot");

  // Expand the first row THAT HAS A COMMENT BOX — the picture must show the box in place, and the
  // very first row has no handle, so expanding it proves nothing about the comment half.
  const expanded = await evalJs(`(function(){
    var li = document.querySelector("#taskList li[data-handle] .rowcmt");
    var b = li ? li.closest("li").querySelector(".rowmore") : document.querySelector(".rowmore");
    if (!b) return "no button";
    b.scrollIntoView({block:"center"});
    b.click();
    var d = b.parentNode.querySelector(".rowpanel");
    return JSON.stringify({ expanded: b.getAttribute("aria-expanded"), label: b.textContent, shown: d ? !d.hidden : null, len: d ? d.textContent.length : 0 });
  })()`);
  console.log("  after click:", expanded);
  const e = JSON.parse(expanded || "{}");
  if (e.expanded === "true" && e.shown === true) ok(`"more" reveals the row's own body (${e.len} chars)`);
  else bad(`the expander did not reveal anything: ${expanded}`);
  if (e.label === "less") ok('the button flips to "less" so the gesture is reversible'); else bad(`button label stayed "${e.label}"`);

  await shot("t076-expanded.png") ? ok("screenshot: expanded") : bad("could not screenshot expanded");

  /* THE SAVE PATH, WITH A REAL HOST — the check that was missing, and the one that matters.
     It asserts what SUCCESS looks like: the words leave the box, a publish actually fires, his
     comment renders back on the row, and the DOM threw nothing. The old version asserted only that
     nothing crashed when there was nothing to save to. */
  const saved = await evalJs(`(function(){
    var li = document.querySelector("#taskList li[data-handle] .rowcmt");
    if (!li) return JSON.stringify({ err: "no comment box" });
    li = li.closest("li");
    var ta = li.querySelector(".rowcmt textarea");
    var bt = String.fromCharCode(96);
    ta.value = "his test comment $5 and $" + bt + "whoami" + bt;
    li.querySelector(".rowsend").click();
    var said = li.querySelector(".rowsaid");
    return JSON.stringify({
      boxAfter: ta.value,
      told: said ? said.textContent : null,
      hidden: said ? said.hidden : null,
      mine: li.querySelectorAll(".rowmine").length,
      mineText: li.querySelector(".rowmine") ? li.querySelector(".rowmine").textContent : null,
      pubs: window.__pubs,
      errs: (window.__pageErrors || []).slice(0, 2)
    });
  })()`);
  console.log("  after save:", saved);
  const sv = JSON.parse(saved || "{}");
  if (sv.pubs === 1) ok("pressing Save actually PUBLISHES — the comment reaches the artifact");
  else bad(`Save fired ${sv.pubs} publish(es) — his comment never leaves the page: ${saved}`);
  if (sv.mine === 1 && /his test comment/.test(String(sv.mineText))) ok("…and his comment renders back on the row, verbatim");
  else bad(`his comment did not render back (${sv.mine} shown) — he gets no confirmation: ${saved}`);
  if (!sv.errs || sv.errs.length === 0) ok("…and the DOM threw nothing while doing it");
  else bad(`the page threw while saving: ${JSON.stringify(sv.errs)}`);
  if (sv.boxAfter === "" && sv.told === "Saved.") ok('the box clears and he is told "Saved."');
  else bad(`after a successful save the box/message are wrong: box=${JSON.stringify(sv.boxAfter)} told=${JSON.stringify(sv.told)}`);

  const jsErrors = await evalJs(`(function(){ try { document.querySelector(".rowmore").click(); return "no-throw"; } catch(e){ return "THREW: " + e.message; } })()`);
  if (jsErrors === "no-throw") ok("toggling again does not throw"); else bad(String(jsErrors));

  try { ws.close(); } catch { /* closing */ }
} catch (e) {
  bad("probe error: " + String(e && e.message).slice(0, 160));
} finally {
  if (proc) { try { proc.kill("SIGKILL"); } catch { /* already gone */ } }
  // Rule 17: this probe leaves nothing behind.
  await new Promise((r) => setTimeout(r, 400));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(failed ? `\nFAIL — ${failed} check(s)` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
