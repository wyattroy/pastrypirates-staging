/* Q-18 — HOW FAR BEHIND THE HOST IS THE GUEST, SENTENCE BY SENTENCE?
 *
 *   node scripts/qa/q18_narr_lag_probe.mjs [--seconds=120]
 *
 * WHAT IT MEASURES AND WHY THIS SHAPE. CEO Review 24 found the first cut of Q-18 held the guest's
 * screen for the FULL grace period at the start of every crew game: `events.length-1` is -1 before
 * the engine has produced anything, `-1 != null` so it went out as a serial, and the guest's own
 * frontier was still undefined, which made the wait guard true whatever the value was. An ordering
 * fix manufacturing a guaranteed divergence. That is a TIMING bug, so a still frame cannot show it
 * and a state dump cannot either — the only instrument that can is a clock on both screens.
 *
 * IT WATCHES INSIDE THE PAGE, at 20ms, so there is no CDP round-trip per sample: each seat records
 * {t, text} every time its narration text changes, and the two logs are matched by sentence
 * afterwards. The first version of this probe polled `.pp4Bub` from outside and saw NOTHING for ten
 * seconds — the voyage's opening lines render in `#actionPanel`, and an instrument that cannot
 * reach its subject reports absence exactly the way a real fault does (rule 6).
 *
 * THE CLOCKS ARE THE SAME CLOCK: both seats stamp with performance.timeOrigin + performance.now(),
 * which is absolute wall-clock, and both browsers are in this container. So the gap is read raw.
 *
 * AND IT MATCHES BY OCCURRENCE, NOT BY SENTENCE. The first cut matched each line to the guest's
 * FIRST occurrence of the same words — and "How many coins?" is asked many times a voyage, so a
 * host line at 5s paired with a guest line at 68s and the probe reported a 63-SECOND hold that had
 * never happened. It now pairs the k-th occurrence with the k-th, which is the only alignment that
 * means anything on a game that repeats its own sentences.
 */
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage, driver } from "../mp_rig.mjs";

const PORT = 8514, DBG_H = 9416, DBG_G = 9417;
const SECONDS = Number(process.argv.find(a => a.startsWith("--seconds="))?.split("=")[1] || 120);
const url = serve(PORT);
launch(DBG_H, "/tmp/chrome-q18lag-host");
launch(DBG_G, "/tmp/chrome-q18lag-guest");
const H = await attach(DBG_H), G = await attach(DBG_G);
for (const C of [H, G]) await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* THE NARRATION, WHEREVER IT IS DRAWN. Both surfaces are read because the game uses both: the
   opening ceremony and prompts go through #actionPanel's .apMsg, the in-play lines through a
   .pp4Bub bubble. Reading only one is how the first cut of this measured nothing at all. */
const WATCH = `(()=>{
  if(window.__lag) return "already";
  const read=()=>{
    const bub=document.querySelector('.pp4Bub');
    const msg=document.querySelector('#actionPanel .apMsg')||document.getElementById('actionPanel');
    const t=(bub&&bub.textContent||'').trim()||(msg&&msg.textContent||'').trim();
    return t.replace(/\\s+/g,' ').slice(0,80);
  };
  window.__lag={log:[],last:null,timer:null};
  window.__lag.timer=setInterval(()=>{
    const t=read();
    if(t&&t!==window.__lag.last){window.__lag.last=t;
      window.__lag.log.push({t:Math.round(performance.timeOrigin+performance.now()),text:t});
      if(window.__lag.log.length>400)clearInterval(window.__lag.timer);}
  },20);
  return "watching";})()`;
const HARVEST = `JSON.stringify(window.__lag?window.__lag.log:[])`;

console.log(`Q-18 — narration lag, host against guest, ${SECONDS}s.\n`);
const code = await makeHost(H, url, "test1");
console.log(`  room ${code}`);
await makeGuest(G, url, code, "test2");
console.log("  watchers armed:", await H.ev(WATCH), await G.ev(WATCH));
await startVoyage(H);
await sleep(2500);
await driver(H, url); await driver(G, url);
console.log("  both seats driving\n");

/* BOUNDED — rule 17. */
for (let i = 0; i < Math.ceil(SECONDS / 2); i++) await sleep(2000);

const hLog = JSON.parse(await H.ev(HARVEST)), gLog = JSON.parse(await G.ev(HARVEST));
killAll();

console.log(`  host recorded ${hLog.length} line(s); guest recorded ${gLog.length}`);
if (!hLog.length || !gLog.length) {
  console.log(`\n=== NOT RUN — a seat recorded nothing, so there is nothing to compare. That is not a pass.`);
  process.exit(1);
}
/* MATCH THE k-TH OCCURRENCE TO THE k-TH. A line the guest never drew is reported separately and
   is NOT automatically a defect: narration carries per-seat `variants`, so "Ahoy, test1 — yer
   turn!" is deliberately worded differently on the seat it is addressed to. Only an unaddressed
   line going missing would mean something, and that is a judgement for a reader, not a threshold. */
const queues = new Map();
for (const r of gLog) { if (!queues.has(r.text)) queues.set(r.text, []); queues.get(r.text).push(r.t); }
const pairs = [], missed = [];
for (const r of hLog) {
  const q = queues.get(r.text);
  if (!q || !q.length) { missed.push(r.text); continue; }
  pairs.push({ text: r.text, gap: q.shift() - r.t });
}
if (!pairs.length) { console.log(`\n=== NOT RUN — no sentence appeared on both seats.`); process.exit(1); }
const gaps = pairs.map(p => p.gap).sort((a, b) => a - b);
const median = gaps[Math.floor(gaps.length / 2)];
const byGap = [...pairs].sort((a, b) => b.gap - a.gap);
console.log(`  ${pairs.length} sentence(s) drawn on BOTH seats; ${missed.length} only the host drew (expected for lines with a per-seat wording)`);
/* THE MEDIAN IS NOT A RESULT AND MUST NOT BE QUOTED AS ONE (CEO Review 25). Two 100-second games,
   two rooms, two seeds, n=1 each side, on a stochastic game — a median that moves from 82 to 61 is
   wire noise, and quoting it as an improvement is exactly the unearned confidence rule 6 exists to
   stop. It is printed as the BASELINE the held-line count is read against, and labelled as such. */
console.log(`  guest behind host by: median ${median}ms (this run's wire baseline — NOT a result, n=1)   min ${gaps[0]}ms   max ${gaps[gaps.length - 1]}ms`);
/* AND `missed` IS WHERE A REGRESSION WOULD HIDE, so it is reported beside the headline rather than
   only in the list below. This probe's own subject — the generation counter — DROPS lines by
   design when a newer one overtakes them, so "the host drew it and the guest never did" is the
   number that would show that going wrong. The first version computed it and never surfaced it. */
console.log(`  host-only lines: ${missed.length} of ${hLog.length} — the number a dropped-line regression would show up in`);
console.log(`\n  the five slowest lines to reach the guest:`);
byGap.slice(0, 5).forEach(p => console.log(`    ${String(p.gap).padStart(6)}ms   "${p.text.slice(0, 60)}"`));
if (missed.length) { console.log(`\n  drawn on the host only (check these read as per-seat wordings, not losses):`); missed.slice(0, 8).forEach(t => console.log(`    "${t.slice(0, 60)}"`)); }
const held = pairs.filter(p => p.gap >= 400).length;
console.log(`\n=== lines that reached the guest 400ms or later: ${held} of ${pairs.length}`);
console.log(`    The grace period is 450ms. A line the guard held to its ceiling lands at ~450 or more;`);
console.log(`    ordinary wire lag in this container measured ${median}ms.`);
process.exit(0);
