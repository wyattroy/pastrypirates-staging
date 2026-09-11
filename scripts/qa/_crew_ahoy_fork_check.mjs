/* DOES EACH DEVICE ASK ITS OWN CAPTAIN "DO YE KNOW HOW TO PLAY?"
 *   node scripts/qa/_crew_ahoy_fork_check.mjs
 * Seen in the 2026-09-10 sea trial's crew-phone screenshots: the host's Ahoy card carried
 * "Do ye know how to play?" with ⚓ Yarrgh! / 🦜 Nah, and the guest's carried the SAME question with
 * ONE button, ⚓ Arrgh! — the host's question, sent to a guest who could not answer it. The Pilot is
 * per device (docs/INTENDED-BEHAVIOUR.md), so each device asks its own captain.
 *   case 1  a first-time host and a first-time guest: BOTH ask, each with two circles; the guest's
 *           "Nah" starts the guest's own ladder at the top, and the voyage goes on.
 *   case 2  a first-time host and a VETERAN guest: the guest's card is the plain Ahoy, no question.
 * A throwaway probe, prefixed `_`, NOT in the gate chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep, makeHost, makeGuest, startVoyage } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8760 + (process.pid % 30), DBG_H = 9760 + 2 * (process.pid % 30), DBG_G = DBG_H + 1;
/* a SERVER PER CASE: killAll() between cases takes the http server down with the browsers, and the
   second case's pages then had nothing to load (the first run died on it) */
let caseN = 0;
const CARD = `JSON.stringify((()=>{const ap=document.getElementById('actionPanel');if(!ap)return null;
  const msg=(ap.querySelector('.apMsg')||{}).textContent||'';
  const btns=[...ap.querySelectorAll('.apBtn')].map(b=>b.textContent.trim()).filter(Boolean);
  return {ahoy:/Ahoy! Choose a recipe/i.test(msg), asks:/know how to play/i.test(msg), btns};})())`;
const PILOT = `(()=>{try{return localStorage.getItem('pp4_pilot')}catch(e){return 'unreadable'}})()`;
const waitCard = async (C, ms = 40000) => { const t = Date.now();
  while (Date.now() - t < ms) { try { const c = JSON.parse(await C.ev(CARD)); if (c && c.ahoy && c.btns.length) return c; } catch {} await sleep(250); }
  return null; };
const tap = (C, re) => C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>${re}.test(x.textContent));if(b){b.click();return true}return false})()`);
let bad = 0;
async function runCase(label, veteranGuest) {
  const url = serve(PORT + 40 + (caseN++));
  launch(DBG_H, path.join(REPO, `.tmp-afork-h-${process.pid}-${label}`));
  launch(DBG_G, path.join(REPO, `.tmp-afork-g-${process.pid}-${label}`));
  const H = await attach(DBG_H), G = await attach(DBG_G);
  await H.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await G.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const code = await makeHost(H, url, "Host Hana");
  await makeGuest(G, url, code, "Guest Gus");
  if (veteranGuest) await G.ev(`(async()=>{const P=await import('/src/ui/pilot.js');P.pilotSkipToVeteran();return 1})()`);
  await startVoyage(H);
  const h = await waitCard(H), g = await waitCard(G);
  console.log(`\n${label}`);
  console.log(`  host : ${h ? (h.asks ? "ASKS" : "plain") : "no card"}  buttons [${h ? h.btns.join(" | ") : ""}]`);
  console.log(`  guest: ${g ? (g.asks ? "ASKS" : "plain") : "no card"}  buttons [${g ? g.btns.join(" | ") : ""}]`);
  const oneQuestionOneButton = g && g.asks && g.btns.length < 2;
  if (oneQuestionOneButton) { console.log("  ✗ the guest is asked a question it cannot answer"); bad++; }
  if (!veteranGuest && !(g && g.asks && g.btns.length === 2)) { console.log("  ✗ a first-time guest should be asked, with two circles"); bad++; }
  if (veteranGuest && !(g && !g.asks && g.btns.length === 1)) { console.log("  ✗ a veteran guest should see the plain Ahoy"); bad++; }
  // answer: host Yarrgh (or Arrgh), guest Nah where offered
  await tap(H, "/yarrgh|arrgh/i"); await tap(G, veteranGuest ? "/arrgh/i" : "/\\bnah\\b/i");
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) { await sleep(500); const c = JSON.parse(await G.ev(CARD)); moved = !(c && c.ahoy); }
  const gp = JSON.parse(await G.ev(PILOT) || "null");
  console.log(`  after answering: the voyage ${moved ? "went on" : "DID NOT go on"}; guest's own ladder ${gp ? `met=${gp.met}, off=${!!gp.off}, rungs seen ${JSON.stringify(gp.seen || {})}` : "(none)"}`);
  if (!moved) { console.log("  ✗ the barrier did not release"); bad++; }
  if (!veteranGuest && !(gp && gp.met)) { console.log("  ✗ the guest's answer did not reach the guest's own ladder"); bad++; }
  await killAll();
  await sleep(800);
}
try {
  await runCase("case 1 — first-time host, first-time guest", false);
  await runCase("case 2 — first-time host, VETERAN guest", true);
  console.log(bad ? `\nFAIL — ${bad}` : "\nPASS — each device asks its own captain, and the voyage goes on");
} catch (e) { console.log("PROBE FAILED: " + (e && e.message || e)); bad++; } finally { await killAll(); }
process.exit(bad ? 1 : 0);
