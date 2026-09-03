/* SCRATCH — WHY DOES EVERY SEA-TRIAL LEG DIE AT "solo card not clickable"?
 *
 * 10 of 10 voyages NOT RUN on 2026-09-03T18:31Z, every one failing on the FIRST click of the front
 * screen. `game_url_check.js` exists because this exact message once meant the fleet was pointed at
 * an empty directory — and it is green, so this measures the OTHER possibilities instead of
 * assuming: is the card there, is it visible, is something ON TOP of it, does the page even boot?
 *
 * ⚠ BOUNDED AND SELF-KILLING (rule 17): the server and the browser are both killed in a finally.
 * Own port, own profile — a trial or another probe on this machine is untouched.
 * ⚠ AND IT REPORTS WHAT IT SAW, never a theory. The point is to stop guessing at this.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, LINUX_ARGS, gameURL } from "../lib/chrome.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..", "..");
const PORT = 8791, DPORT = 9491;
const profile = path.join(process.env.TEMP || "/tmp", "chrome-soloprobe");
fs.rmSync(profile, { recursive: true, force: true });
let server = null, proc = null;

try {
  server = spawn("python", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] });
  const URL_ = gameURL(PORT);
  console.log("  serving:", URL_);

  proc = spawn(CHROME, [...LINUX_ARGS, "--headless=new", "--disable-gpu", "--mute-audio",
    `--remote-debugging-port=${DPORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", URL_],
    { stdio: ["ignore", "pipe", "pipe"] });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { await (await fetch(`http://127.0.0.1:${DPORT}/json/version`)).json(); break; } catch { /* not up */ }
  }
  let t = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const l = await (await fetch(`http://127.0.0.1:${DPORT}/json/list`)).json();
    t = l.find((x) => x.type === "page"); if (t) break;
  }
  if (!t) { console.log("  the page never appeared as a target"); process.exit(1); }

  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
  const send = (m, p) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send("Page.enable", {});
  await send("Runtime.enable", {});
  const errs = [];
  ws.addEventListener("message", (m) => {
    const j = JSON.parse(m.data);
    if (j.method === "Runtime.exceptionThrown") errs.push(j.params?.exceptionDetails?.text + " " + (j.params?.exceptionDetails?.exception?.description || "").slice(0, 200));
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ev("document.readyState === 'complete'")) break;
  }
  await new Promise((r) => setTimeout(r, 2000));   // let the module graph boot

  const seen = await ev(`(function(){
    var e = document.getElementById("choiceSolo");
    var out = { title: document.title, bodyLen: document.body.innerHTML.length,
                cards: document.querySelectorAll(".choiceCard").length };
    if (!e) { out.card = "NO #choiceSolo IN THE DOM"; return JSON.stringify(out); }
    var r = e.getBoundingClientRect();
    var cs = getComputedStyle(e);
    var mid = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
    out.card = {
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
      disabled: !!e.disabled,
      onScreen: r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0,
      whatIsAtItsCentre: mid ? (mid.id ? "#" + mid.id : mid.tagName + "." + String(mid.className).slice(0,40)) : "nothing",
      itIsTheTopElement: mid === e || (e.contains && e.contains(mid)),
    };
    return JSON.stringify(out);
  })()`);

  console.log("  " + String(seen).replace(/,"/g, ',\n    "'));
  console.log("  page errors:", errs.length ? errs.slice(0, 3) : "none");

  /* ⛔ NOW ASK THE DRIVER'S OWN GATE, AT THE DRIVER'S OWN SIZES. My reimplementation above is not
     the thing that failed — GATE_SRC is. It refuses an element whose rect falls outside the
     viewport AT ALL, and it never scrolls first, so a card below the fold is reported with the
     same words as a card that does not exist: "solo card not clickable". */
  const { GATE_SRC } = await import("../lib/player.mjs");
  console.log("");
  for (const [name, w, h] of [["desktop", 1280, 900], ["tablet", 820, 1180], ["phone", 390, 844]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: name === "phone" });
    await new Promise((r) => setTimeout(r, 900));
    await send("Runtime.evaluate", { expression: GATE_SRC });
    const v = await ev(`(function(){
      var e = document.getElementById("choiceSolo");
      var g = __gate(e);
      var r = e ? e.getBoundingClientRect() : null;
      return JSON.stringify({ ok: g.ok, why: g.why || "",
        bottom: r ? Math.round(r.bottom) : null, innerHeight: innerHeight,
        pageScrolls: document.documentElement.scrollHeight > innerHeight });
    })()`);
    const d = JSON.parse(v);
    console.log(`  ${name.padEnd(8)} ${w}x${h}  __gate: ${d.ok ? "CLICKABLE" : "REFUSED — " + d.why}`
      + `   (card bottom ${d.bottom} vs viewport ${d.innerHeight}${d.pageScrolls ? ", page scrolls" : ""})`);
  }
} finally {
  if (proc) { try { proc.kill("SIGKILL"); } catch { /* gone */ } }
  if (server) { try { server.kill("SIGKILL"); } catch { /* gone */ } }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
}
