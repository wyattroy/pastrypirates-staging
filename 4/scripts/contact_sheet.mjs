// contact_sheet.mjs — build ONE readable picture out of a folder of QA screenshots.
//
// WHY THIS IS ITS OWN FILE (2026-08-21): the playtest gate used to build its sheets inline, writing
// the HTML into its output folder and loading it over the run's own web server. That server is
// rooted at the REPO, and the output folder is usually somewhere else entirely — so every sheet
// came out as a 1700x1000 screenshot of a 404 page. Four of them, byte-identical, committed as
// evidence, and handed to Wyatt with "open the contact sheets before anything else". Nobody had
// opened one. Exactly the failure the gate exists to prevent, one level up: an artifact reported as
// delivered that was never looked at.
//
// So the sheet builder now serves the folder it is building FROM, is callable on its own against any
// folder of shots, and — the part that matters — VERIFIES that every image actually rendered before
// it claims to have produced anything.
//
// Usage: node 4/scripts/contact_sheet.mjs <shotsDir> [--out=FILE.png] [--title="..."]
//                                          [--findings=FILE.txt] [--port=N] [--dbg=N]
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { openChrome, sleep } from "./lib/cdp.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = path.resolve(process.argv[2] || ".");
const OUTFILE = path.resolve(arg("out", path.join(DIR, "contact-sheet.png")));
const TITLE = arg("title", path.basename(DIR));
const FINDINGS = arg("findings", "");
const PORT = +arg("port", 9101), DBG = +arg("dbg", 9501);

if (!fs.existsSync(DIR)) { console.error("no such folder: " + DIR); process.exit(1); }
const shots = fs.readdirSync(DIR).filter(f => /\.png$/i.test(f) && !/^contact-/i.test(f)).sort();
if (!shots.length) { console.error("no screenshots in " + DIR); process.exit(1); }

// findings file: lines like "solo-phone-004.png: what is wrong" — attach each to its shot
const notes = new Map();
if (FINDINGS && fs.existsSync(FINDINGS)) {
  for (const line of fs.readFileSync(FINDINGS, "utf8").split("\n")) {
    const m = line.match(/^([\w.-]+\.png)\s*:\s*(.+)$/);
    if (m) notes.set(m[1], (notes.get(m[1]) || []).concat(m[2].trim()));
  }
}

const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#12313d;color:#fff;font:13px/1.4 -apple-system,Helvetica,sans-serif">
<div style="padding:16px 18px 6px;font-size:17px;font-weight:700">${esc(TITLE)}</div>
<div style="padding:0 18px 10px;opacity:.75">${shots.length} screens · ${notes.size} with findings · ${new Date().toISOString().slice(0, 16).replace("T", " ")}</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:0 18px 20px">
${shots.map(f => {
  const bad = notes.has(f);
  return `<div style="background:#0a222c;border:2px solid ${bad ? "#ff2d55" : "#2f8f6f"};border-radius:9px;padding:8px">
    <div style="font-weight:700;margin-bottom:6px">${esc(f)}</div>
    <img src="./${encodeURIComponent(f)}" style="width:100%;display:block;border-radius:5px;background:#000">
    ${(notes.get(f) || []).map(n => `<div style="color:#ffa9bb;margin-top:5px">✗ ${esc(n)}</div>`).join("")}
  </div>`;
}).join("")}
</div></body>`;
const htmlFile = path.join(DIR, "_contact-sheet.html");
fs.writeFileSync(htmlFile, html);

// serve THE FOLDER WE ARE BUILDING FROM — the whole point. A server rooted anywhere else turns
// every <img> into a 404, which is what produced four identical screenshots of an error page.
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: DIR, stdio: "ignore" });
const cleanup = () => { try { srv.kill("SIGKILL"); } catch {}
  try { execSync(`pkill -f "http.server ${PORT}"`, { stdio: "ignore" }); } catch {}
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`, { stdio: "ignore" }); } catch {} };
process.on("exit", cleanup); for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { cleanup(); process.exit(1); });
await sleep(900);

const c = await openChrome({ W: 1700, H: 1000, dbgPort: DBG, httpPort: null, serveRoot: DIR, profileDir: path.join(DIR, "_sheet-profile") });
await c.nav(`http://127.0.0.1:${PORT}/_contact-sheet.html`);
await sleep(1200);
// wait for every image, then PROVE they loaded — a sheet nobody verified is how this file was born
await c.ev("Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r })))");
const ok = await c.ev("[...document.images].filter(i => i.naturalWidth > 0).length");
const total = await c.ev("document.images.length");
const h = await c.ev("document.documentElement.scrollHeight");
await c.send("Emulation.setDeviceMetricsOverride", { width: 1700, height: Math.max(400, Math.min(h || 0, 20000)), deviceScaleFactor: 1, mobile: false });
await sleep(500);
await c.shot(OUTFILE);
c.close(); cleanup();
try { fs.rmSync(path.join(DIR, "_sheet-profile"), { recursive: true, force: true }); } catch {}

if (ok !== total || !ok) {
  console.error(`FAILED: only ${ok} of ${total} images rendered — the sheet is not trustworthy`);
  process.exit(1);
}
console.log(`contact sheet: ${OUTFILE}  (${ok}/${total} images, ${h}px tall)`);
