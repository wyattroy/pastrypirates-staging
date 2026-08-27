#!/usr/bin/env node
/* NAME CLAIM GATE — item 16 / D-19: a joining captain keeps the name they typed.
 *
 *   node scripts/name_claim_check.js
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A GREP. The plan's own inline check asked whether the word
 * "bot" appears inside joinRoom's body. That was a fair proxy while the rule was going to be written
 * inline — but the rule is written ONCE and named by three callers, so the word moved and the grep
 * went red on correct code. A check whose premise is the SHAPE of an implementation rather than its
 * BEHAVIOUR fails the moment the implementation is improved, and the only way to satisfy it is to
 * make the code worse. So this runs the rule instead.
 *
 * That is possible because applyNameClaim() is a PURE function over a seat map, living in
 * src/shared/index.js — the leaf tier that holds no DOM, no window, no Firebase and no clock. It
 * imports and executes under Node with nothing stubbed.
 *
 * IT RED-PROOFS ITSELF. docs/HARD-WON-LESSONS.md §2: "a check you have only ever seen pass is
 * indistinguishable from a check that cannot fail." The last block below re-runs the two load-bearing
 * assertions against a deliberately BROKEN rule (the pre-D-19 behaviour: write the typed name
 * verbatim, check nothing) and requires them to catch it. If the red-proof does not go red, this
 * gate reports FAIL — a silent instrument is worse than no instrument.
 */
import { applyNameClaim, seatHeldName, DEFAULT_NAMES } from "../src/shared/index.js";

let fails = 0, n = 0;
const ok = (name, got, want) => {
  n++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const pass = g === w;
  if (!pass) fails++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(66)} got=${g} want=${w}`);
  return pass;
};
const MY = "pp-me";
/* A real four-seat networked room, exactly as createRoom() writes one (src/orchestrator.js):
   seat 0 is the claimed host; 1-3 are bot seats with a BLANK name, which is the subtlety — nothing
   in the database says "Crustbeard", but pname() draws the seat default so that IS the name at the
   table. */
const room = (hostName = "Wyatt") => ({
  0: { name: hostName, id: "pp-host", bot: false },
  1: { name: "", id: "", bot: true, strat: "pirate" },
  2: { name: "", id: "", bot: true, strat: "pirate" },
  3: { name: "", id: "", bot: true, strat: "pirate" },
});
const names = s => [0, 1, 2, 3].map(i => seatHeldName(s, i));
const dupes = s => { const v = names(s); return v.filter((x, i) => v.indexOf(x) !== i); };

console.log("\nNAME-01/D-19 — a captain keeps the name they typed\n");

console.log("  -- controls, known before anything is measured --");
ok("CONTROL: the four default captain names are all distinct", new Set(DEFAULT_NAMES).size, 4);
ok("CONTROL: a fresh room has no two seats holding the same name", dupes(room()), []);
ok("CONTROL: an unnamed bot seat still HOLDS its seat default", seatHeldName(room(), 1), DEFAULT_NAMES[1]);
ok("CONTROL: a named seat holds the name it was given", seatHeldName(room("Bess"), 0), "Bess");

console.log("\n  -- a name nobody holds is simply kept --");
{
  const s = room();
  ok("an uncontested name is granted", applyNameClaim(s, 1, "Pegleg", 4, MY, true), "ok");
  ok("...and the seat carries exactly that name", s[1].name, "Pegleg");
  ok("...and the seat is now this captain's", s[1].id, MY);
  ok("...and no other seat was disturbed", [s[0].name, s[2].name, s[3].name], ["Wyatt", "", ""]);
  ok("...and nobody shares a name", dupes(s), []);
}

console.log("\n  -- a name another HUMAN holds is REFUSED, and nothing is written --");
{
  const s = room("Bess");
  const before = JSON.stringify(s);
  ok("a human-held name is refused", applyNameClaim(s, 1, "Bess", 4, MY, true), "taken");
  ok("...and the seat map is byte-identical afterwards", JSON.stringify(s), before);
  ok("...so the seat was NOT claimed", s[1].id, "");
}

console.log("\n  -- a name a BOT holds is GRANTED, and the bot swaps to accommodate --");
{
  const s = room();
  const botsOldName = seatHeldName(s, 2);            // "Dough Hook", held only by its seat index
  ok("CONTROL: the bot really does hold the name being claimed", botsOldName, DEFAULT_NAMES[2]);
  ok("a bot-held name is granted to the human", applyNameClaim(s, 1, botsOldName, 4, MY, true), "ok");
  ok("...the human gets the name they typed", s[1].name, botsOldName);
  ok("...the human's seat is claimed", s[1].id, MY);
  ok("...the bot has moved to a different name", seatHeldName(s, 2) !== botsOldName, true);
  ok("...the bot is still a bot", [s[2].id, s[2].bot], ["", true]);
  ok("...the bot kept its temperament", s[2].strat, "pirate");
  ok("...and NOBODY shares a name", dupes(s), []);
}

console.log("\n  -- a bot that already swapped once holds its WRITTEN name, not its index default --");
{
  const s = room();
  s[2] = { name: "Pegleg", id: "", bot: true, strat: "pirate" };
  ok("CONTROL: the renamed bot holds its written name", seatHeldName(s, 2), "Pegleg");
  ok("claiming that written name is granted", applyNameClaim(s, 1, "Pegleg", 4, MY, true), "ok");
  ok("...the human gets it", s[1].name, "Pegleg");
  ok("...the bot moved again", seatHeldName(s, 2) !== "Pegleg", true);
  ok("...and nobody shares a name", dupes(s), []);
}

console.log("\n  -- item 30: the collision is capitalization-normed — 'flaky jack' IS 'Flaky Jack' --");
{
  const s = room();
  const botsName = seatHeldName(s, 3);               // "Flaky Jack", Wyatt's own repro seat
  ok("a lowercase twin of a bot's name is granted", applyNameClaim(s, 1, botsName.toLowerCase(), 4, MY, true), "ok");
  ok("...the human keeps the case THEY typed", s[1].name, botsName.toLowerCase());
  ok("...the bot has moved off the colliding name", seatHeldName(s, 3) !== botsName, true);
  ok("...and no two seats read the same (case-normed)",
     (() => { const v = names(s).map(x => x.toLowerCase()); return v.filter((x, i) => v.indexOf(x) !== i); })(), []);
}
{
  const s = room("Bess");
  ok("a lowercase twin of a HUMAN's name is still refused", applyNameClaim(s, 1, "bess", 4, MY, true), "taken");
}

console.log("\n  -- a blank name still falls back collision-free (the pre-existing rule, unbroken) --");
{
  const s = room();
  ok("a blank name is resolved to an unused default", applyNameClaim(s, 1, "", 4, MY, true), "ok");
  ok("...to a real captain name", typeof s[1].name === "string" && s[1].name.length > 0, true);
  ok("...and nobody shares a name", dupes(s), []);
}

console.log("\n  -- the rejoin/rename shape keeps the record it is rewriting --");
{
  const s = room();
  s[1] = { name: "Pegleg", id: MY, bot: false };
  ok("a rename to an uncontested name is granted", applyNameClaim(s, 1, "Sparrow", 4, MY, false), "ok");
  ok("...and the seat now reads the new name", s[1].name, "Sparrow");
}

/* ---- RED-PROOF. Can these assertions actually go red? ---- */
console.log("\n  -- red-proof: the same assertions against the PRE-D-19 rule, which must FAIL --");
{
  // exactly what all three call sites did before this change: write the typed name, check nothing
  const brokenClaim = (s, seat, chosen, numSeats, myId) => {
    s[seat] = { name: chosen, id: myId, bot: false };
    return "ok";
  };
  const s = room("Bess");
  const before = JSON.stringify(s);
  const verdict = brokenClaim(s, 1, "Bess", 4, MY);
  const caughtRefusal = verdict !== "taken";
  const caughtWrite = JSON.stringify(s) !== before;
  const caughtDupe = dupes(s).length > 0;
  ok("the refusal assertion catches the old behaviour", caughtRefusal, true);
  ok("the nothing-was-written assertion catches it too", caughtWrite, true);
  ok("and two captains named Bess is visible as a duplicate", caughtDupe, true);
}

/* ---- THE WIRING INVARIANT. A correct rule nothing calls protects nothing. ----
   This is the half a behavioural test cannot see: there are THREE places a name reaches
   seats/$seat/name, and the fault this whole change fixes is that each of them had its own idea of
   what to write. Fixing two of three is the shape of the next regression, so the gate names all
   three rather than trusting a comment. */
console.log("  -- the wiring: every name-write path names the one rule --");
{
  const fs = await import("node:fs");
  const url = await import("node:url");
  const here = url.fileURLToPath(new URL(".", import.meta.url));
  const orch = fs.readFileSync(here + "../src/orchestrator.js", "utf8");
  const html = fs.readFileSync(here + "../index.html", "utf8");
  const lobby = fs.readFileSync(here + "../src/ui/lobby.js", "utf8");
  const nocom = t => t.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const body = (from, to) => { const i = nocom(orch).indexOf(from); const j = to ? nocom(orch).indexOf(to, i) : nocom(orch).length; return nocom(orch).slice(i, j); };
  const rename = body("export async function renameMySeat", "export async function joinRoom");
  const join = body("export async function joinRoom", "let _watchRoomAttachedFor");

  ok("CONTROL: renameMySeat's body was located and is non-trivial", rename.length > 200, true);
  ok("CONTROL: joinRoom's body was located and is non-trivial", join.length > 800, true);
  ok("renameMySeat routes through the one rule", /applyNameClaim\(/.test(rename), true);
  ok("joinRoom routes through the one rule, on BOTH of its paths",
    (join.match(/applyNameClaim\(/g) || []).length, 2);
  ok("every seat-name write in the file goes through it — none left writing a name verbatim",
    (nocom(orch).match(/name:\s*chosen/g) || []).length, 0);

  // T-02.2-23: a blocking alert() has frozen a page mid-probe in this project before.
  ok("the refusal is an inline warning, not an alert()", /setNameWarning\(/.test(join), true);
  ok("no alert() sits on the refusal path", /outcome\s*===\s*"taken"\s*\)\s*\{?\s*alert/.test(join), false);

  // T-02.2-22: the warning echoes a player-authored string back onto the page.
  ok("both name boxes have a warning mount in the markup",
    [/id="joinNameWarn"/.test(html), /id="nameModalWarn"/.test(html)], [true, true]);
  ok("the warning is written with textContent, never innerHTML",
    /Warn.*innerHTML|innerHTML.*nameWarn/i.test(lobby), false);
  ok("setNameWarning uses textContent", /el\.textContent\s*=/.test(lobby), true);
}

console.log(`\n  ${n} assertion(s), ${fails} failure(s)\n`);
if (fails) { console.error(`FAIL name_claim_check — ${fails} of ${n} assertions failed`); process.exit(1); }
console.log("PASS name_claim_check — a captain keeps the name they typed (item 16 / D-19)");
process.exit(0);
