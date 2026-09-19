#!/usr/bin/env node
/* ONE ANSWER TO "DOES THIS CAPTAIN TAKE THIS CRATE?"
   The CEO's bot audit, 2026-09-15: the buy gate was written twice — `doDock` PLAYED one copy and planTurnV3's
   berth branch EVALUATED another, kept in step by a comment claiming they asked "exactly what doDock will ask".
   That is the same shape the previous CEO verdict found in the dock's PAYMENT (fixed then; this one was not), and
   the same shape as the battle double-write before it. A bot that evaluates one rule and plays another is not a
   bot anybody can reason about, and nothing would have gone red if the copies drifted.
   So: one method decides, both callers ask it, and this gate holds that.
   RED-PROOFED BELOW — each rule is re-run against a mutated copy of the source and must go red, because a
   structural check that cannot fail is decoration. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(REPO, "src/engine/index.js"), "utf8");

const rules = [
  ["the decision is defined exactly once", s => (s.match(/^\s*wantsCrate\(/gm) || []).length === 1,
   s => s.replace("  wantsCrate(p,ing,price){", "  wantsCrate(p,ing,price){\n  }\n  wantsCrate(p,ing,price){")],
  ["doDock asks it rather than deciding itself", s => /doDock\(p,port\)\{[\s\S]{0,2600}?this\.wantsCrate\(/.test(s),
   s => s.replace("const why=this.wantsCrate(p,ing,price)", "const why=this.needs(p).includes(ing)?\"needs\":\"\"")],
  ["the planner asks the same one", s => (s.match(/this\.wantsCrate\(p,port,price\)/g) || []).length === 1,
   s => s.replace("this.wantsCrate(p,port,price)", "this.needs(p).includes(port)")],
  ["the merchant's leverage clause exists in ONE place", s => (s.match(/hoardBias>=1\.4/g) || []).length === 1,
   s => s.replace("wantsCrate(p,ing,price){", "wantsCrate(p,ing,price){ if(PERSONALITY[p.strategy]&&PERSONALITY[p.strategy].hoardBias>=1.4){} ")],
  // 2026-09-18: the derivation moved OUT of coinTurns and into dockPay(), so that tour3 and
  // rivalPlan3 could stop writing it out for a second and third time. This rule follows it, and
  // now holds both halves — dockPay reads the berth, and coinTurns asks dockPay.
  ["the dock rate is derived from the dock, not from PLAN's frozen 4, and derived in ONE place",
   s => /dockPay\(\)\{[\s\S]{0,240}?dockHeads[\s\S]{0,120}?dockTails/.test(s) &&
        /coinTurns\(n\)\{[\s\S]{0,200}?this\.dockPay\(\)/.test(s),
   s => s.replace("coinTurns(n){ return n<=0?0:n/this.dockPay(); }",
                  "coinTurns(n){ return n<=0?0:n/PLAN.coinsPerDockTurn; }")],
];

let bad = 0;
for (const [name, ok, mutate] of rules) {
  const green = ok(SRC);
  const redWhenBroken = !ok(mutate(SRC));          // the check must be able to fail
  console.log(`  ${green && redWhenBroken ? "PASS" : "FAIL"}  ${name}${green ? "" : "  <- NOT TRUE OF THE SOURCE"}${redWhenBroken ? "" : "  <- the check cannot fail; it proves nothing"}`);
  if (!green || !redWhenBroken) bad++;
}
console.log(bad ? `\nFAIL — ${bad} of ${rules.length}` : `\nPASS — ${rules.length} rule(s), each red-proofed`);
process.exit(bad ? 1 : 0);
