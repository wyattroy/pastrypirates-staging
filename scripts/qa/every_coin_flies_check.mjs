/* every_coin_flies_check.mjs — EVERY COIN A CAPTAIN EARNS FLIES TO THEIR PURSE THE MOMENT IT IS EARNED, the buy waits for it, and
 * the battle box stays gone.
 *
 * HIS WORDS, 2026-09-14: "if you earn 3 coins, only 3 coins should fly to the hold ... every coin you earn should fly over --
 * including from working the docks ... the coins should enter your hold the moment you earn them -- not at the end of your turn
 * AFTER you've bought the ingredient ... they happen sequentially and both require player decisions, so they should be displayed
 * that way." And: "THe battle box covered this up. I want the battle box removed entirely."
 *
 * WHY IT EXISTS. The CEO review of 2026-09-15 found that build short in six places and guarded by nothing: a trade's coins and a
 * correct crow's-nest call's coins never flew; the dock's coin record was written twice (engine for bots, flow.js for humans) under
 * a comment saying once; the "Buy a crate?" question did not wait for the coins; a count could freeze for 60 seconds; and the box's
 * code and styles were left behind.
 *
 * WHAT IT IS: a REVERT ALARM on the source, not the behavioural proof. The behaviour is measured in a browser (the dock probe: the
 * flip paid N, N coins flew, the buy was offered after the last one landed; a crew pair of laptop host and phone guest).
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 *
 *   node scripts/qa/every_coin_flies_check.mjs                    this tree
 *   node scripts/qa/every_coin_flies_check.mjs --root=<checkout>  another tree — the red-proof: f77dbe1b, the build the CEO
 *                                                                 reviewed, must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rootArg = process.argv.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? path.resolve(rootArg.slice("--root=".length)) : HERE;
const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
const walk = (d) => fs.existsSync(path.join(ROOT, d))
  ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith(".js") ? [path.join(d, x.name)] : [])
  : [];

let fails = 0;
const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const check = (cond, pass, fail) => (cond ? ok(pass) : bad(fail));

/* The text of one function or method, from its head to its matching brace. */
function body(src, head) {
  const h = src.indexOf(head);
  if (h < 0) return "";
  let j = src.indexOf("{", h + head.length - 1), d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}

const engine = rd("src/engine/index.js"), flow = rd("src/ui/flow.js"), orch = rd("src/orchestrator.js"), board = rd("src/ui/board.js"), html = rd("index.html");
if (!engine || !flow || !orch || !board) { console.log(`FAIL — cannot read the game source under ${ROOT}`); process.exit(1); }
console.log(`every_coin_flies — reading ${ROOT}`);

console.log("\nA dock's coins are credited and recorded in ONE place");
const payDock = body(engine, "payDock(p,heads){");
check(/p\.coins\s*\+=/.test(payDock) && /t:"purse"/.test(payDock),
  "Game.payDock credits the purse and records the `purse` event together",
  "there is no Game.payDock that both credits the purse and records `purse`");
const srcFiles = walk("src");
const purseIn = srcFiles.filter((f) => /t:\s*"purse"/.test(rd(f)));
const purseCount = srcFiles.reduce((n, f) => n + (rd(f).match(/t:\s*"purse"/g) || []).length, 0);
check(purseCount === 1 && purseIn[0] === path.join("src", "engine", "index.js"),
  "exactly one place in the game writes a `purse` record",
  `\`purse\` is written ${purseCount} time(s), in ${purseIn.join(", ") || "nowhere"} — a second copy is how bots and humans drift apart`);
const doDock = body(engine, "doDock(p,port){"), humanDock = body(flow, "export async function humanDock(");
check(/this\.payDock\(/.test(doDock) && !/coins\s*\+=/.test(doDock), "a bot's dock pays through payDock", "Game.doDock credits coins itself instead of through payDock");
check(/\.payDock\(/.test(humanDock) && !/coins\s*\+=/.test(humanDock), "a human's dock pays through the same payDock", "humanDock credits coins itself instead of through Game.payDock");

console.log("\nEvery coin credited in the game is a coin that flies");
const EARNINGS = [["src/engine/index.js", "payDock(p,heads){"], ["src/engine/index.js", "doPass(p){"], ["src/engine/index.js", "settleTrade(p,q,offer,extra){"], ["src/ui/flow.js", "export async function settleSideBets("]];
const inEarnings = EARNINGS.reduce((n, [f, h]) => n + (body(rd(f), h).match(/\.coins\s*\+=/g) || []).length, 0);
const gameFiles = srcFiles.filter((f) => !f.endsWith(path.join("ui", "board.js")));   // board.js rolls a DISPLAYED count, it credits nothing
const everywhere = gameFiles.reduce((n, f) => n + (rd(f).match(/\.coins\s*\+=/g) || []).length, 0);
check(inEarnings === everywhere && inEarnings >= 4,
  `all ${everywhere} coin credits in the game sit in the four earnings that fly (dock, pass, trade sale, crow's-nest call)`,
  `${everywhere} coin credit(s) in the game but only ${inEarnings} inside the four that fly — a way to earn coins that nobody sees arrive`);
const consume = body(orch, "export async function consumeEvent(e){");
check(/treasureBurst\(/.test(consume) && /"purse"/.test(consume) && /"pass"/.test(consume) && /"sidebet"/.test(consume),
  "the one consumer flies a dock's, a pass's and a won call's coins to the captain's purse",
  "consumeEvent does not fly purse, pass AND won-call coins (treasureBurst)");
check(/paid\s*:\s*total/.test(body(engine, "settleTrade(p,q,offer,extra){")) && /coinsAcross\(/.test(consume) && /e\.paid/.test(consume),
  "a trade records the coins paid, and the consumer flies them from the payer's purse to the seller's",
  "a trade's coins do not fly: the trade event carries no `paid`, or consumeEvent has no coinsAcross for it");

console.log("\nThe buy waits for the coins");
const payAt = humanDock.indexOf(".payDock("), waitAt = humanDock.indexOf("eventDrawn("), buyLoop = humanDock.indexOf("for(;;)");
check(payAt >= 0 && waitAt > payAt && (buyLoop < 0 || waitAt < buyLoop),
  "a human's dock waits for its purse to be drawn before it asks to buy",
  "humanDock asks to buy without waiting for the coins it just earned (no eventDrawn between payDock and the buy)");

console.log("\nA held coin count is always released");
const tb = body(board, "export async function treasureBurst(");
const afterHold = tb.slice(Math.max(0, tb.indexOf("holdCoinRoll(seat,60000)")));
const unreleased = [...afterHold.matchAll(/\breturn\b/g)].filter((m) => !/holdCoinRoll\(seat,0\)\s*;\s*$/.test(afterHold.slice(Math.max(0, m.index - 40), m.index)));
check(tb.includes("holdCoinRoll(seat,60000)") && unreleased.length === 0,
  "every way out of treasureBurst after its long hold releases the count",
  "treasureBurst can return after holding the count without releasing it — the purse freezes");

/* ADDED 2026-09-15, after the host+phone pictures showed it and a posed dock measured it at both sizes: the count read 4 when three
   treasure coins landed and still read 4 when "Buy a crate?" asked him to spend them. treasureBurst shortens a 60s hold once the
   coins fly, but the roll's tick was already sleeping against the 60s, and nothing woke it. */
console.log("\nA shortened hold wakes the count");
const hold = body(board, "export function holdCoinRoll(");
check(/setTimeout\(\s*r\.tick/.test(hold) && /r\.tick\s*=\s*tick/.test(board),
  "holdCoinRoll re-schedules a waiting roll, so the count shows coins the moment they land",
  "holdCoinRoll only moves the hold; a roll already sleeping on a longer hold never wakes — the count lags the coins and the buy");

console.log("\nThe battle box stays gone");
const boxRefs = [];
for (const f of srcFiles) {
  const s = rd(f);
  if (/class=\\?"[^"\n]*\bbtl[\w-]*/.test(s)) boxRefs.push(`${f} draws a btl class`);
  if (/["'][^"'\n]*\.btl(Btn)?\b/.test(s)) boxRefs.push(`${f} has a selector for the box`);
  if (/export function battleFooter\(/.test(s)) boxRefs.push(`${f} still builds the box's footer`);
}
const cssRules = (html.match(/^\s*\.btl[\w-]*[\s.{:,]/gm) || []).length;
if (cssRules) boxRefs.push(`index.html still styles the box (${cssRules} rule line(s))`);
check(boxRefs.length === 0, "no code draws, looks for or styles the battle box", "the battle box is still in the code: " + boxRefs.join("; "));

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — every coin earned flies, the buy waits for it, and the battle box is gone\n");
process.exit(fails ? 1 : 0);
