/* SCRATCH — rule 19 for `admin-console-where`: LOOK AT THE PAGE, don't reason about it.
   Three shots on a phone-sized screen, because that is where he opens things:
     1. the curtain as a stranger sees it
     2. the curtain refusing a wrong word
     3. the console open, drawing the REAL live numbers from the real database
   Also prints what the DOM actually holds before the curtain opens, so "nothing leaks" is
   measured and not asserted. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import fs from "node:fs";
import path from "node:path";

const PORT = 8547, DBG = 9447;
const TAG = process.argv[2] || "";                    // "" = the before pass, "-after" = the after
const DIR = path.resolve(".planning/posed");
fs.mkdirSync(DIR, { recursive: true });

const url = serve(PORT) + "/stats.html";
launch(DBG, "/tmp/chrome-stats-shots");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function shot(name) {
  // `send` resolves the RAW CDP message, so the bytes are at r.result.data — not r.data.
  const r = await C.send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) throw new Error("no screenshot bytes: " + JSON.stringify(r).slice(0, 200));
  const p = path.join(DIR, name.replace(/\.png$/, TAG + ".png"));
  fs.writeFileSync(p, Buffer.from(r.result.data, "base64"));
  console.log("wrote " + p);
}

await C.ev(`location.href=${JSON.stringify(url)}`); await sleep(2000);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(1800);

/* WHAT A STRANGER CAN SEE — the whole rendered text, and whether the console div is drawn. */
console.log("CURTAIN, what is on screen:", await C.ev(`(()=>{
  const con=document.getElementById('console');
  return JSON.stringify({
    bodyText: document.body.innerText.replace(/\\s+/g,' ').trim(),
    consoleHidden: con.hidden,
    consoleVisible: !!con.offsetParent,
    outHTML: document.getElementById('out').innerHTML.length
  });})()`));
await shot("stats-curtain-390w.png");

/* A WRONG WORD MUST BE REFUSED, and the refusal must be visible. */
await C.ev(`(()=>{document.getElementById('curtainWord').value='doubloons';
  document.getElementById('curtain').dispatchEvent(new Event('submit',{cancelable:true}));})()`);
await sleep(700);
console.log("WRONG WORD:", await C.ev(`JSON.stringify({msg:document.getElementById('curtainMsg').textContent, consoleHidden:document.getElementById('console').hidden})`));
await shot("stats-curtain-wrong-390w.png");

/* THE RIGHT WORD — and then the real numbers. */
// The word is an ARGUMENT, never a literal — CEO 159 found the first version of the hash helper
// carrying the live word as a default, in a public repo. It is not going back in a file here.
const WORD = process.argv[3] || "";
if (!WORD) { console.error("give me the curtain word as arg 2: node scripts/qa/_stats_shots.mjs <tag> <word>"); await killAll(); process.exit(2); }
await C.ev(`(()=>{document.getElementById('curtainWord').value=${JSON.stringify(WORD)};
  document.getElementById('curtain').dispatchEvent(new Event('submit',{cancelable:true}));})()`);
for (let i = 0; i < 40; i++) {                        // bounded, rule 17
  const ready = await C.ev(`(()=>{const o=document.getElementById('out');return !!(o&&o.querySelector('.cards'))})()`);
  if (ready === true) break;
  await sleep(300);
}
await sleep(900);
console.log("OPEN:", await C.ev(`(()=>{
  const cards=[...document.querySelectorAll('.card')].map(c=>c.querySelector('b').textContent+' = '+c.querySelector('span').textContent);
  return JSON.stringify({curtainHidden:document.getElementById('curtain').hidden, cards, rows:document.querySelectorAll('table tr').length-1});})()`));
await shot("stats-open-390w.png");

/* AND IT REMEMBERS — a reload must not ask again. */
await C.ev(`location.reload()`); await sleep(2200);
console.log("AFTER RELOAD:", await C.ev(`JSON.stringify({curtainHidden:document.getElementById('curtain').hidden, consoleHidden:document.getElementById('console').hidden})`));

await killAll();
