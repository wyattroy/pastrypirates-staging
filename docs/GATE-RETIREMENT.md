# Gate retirement — how the suite stays small enough to trust

Wyclau charter, risk 3: *"wyclau can die by growing, like its predecessors: monthly pruning pass;
any part that hasn't fired in a month justifies itself or goes."* This is that pass, applied to
`npm test`.

**Two mechanisms, kept deliberately separate — one is mechanical, one is never automated.**

## 1. The suite ceiling — mechanical, wired, red-proofed

`package.json`'s `gates` object carries `total` (what `gate_count_check.js` already enforced) and
now `ceiling`. `scripts/qa/gate_ceiling_check.mjs` fails the build the moment `total > ceiling`.

**The ceiling does not prevent growth. It prevents SILENT growth.** Hitting it is not an error in
the gate you just added — it is the suite asking you to make a conscious choice, in the same
commit: retire something first, or raise the ceiling and say why in the commit message. Exactly
the same discipline `gate_count_check.js` already applies to the total itself, extended one step
further.

The ceiling started at the exact current total (71) on purpose — so the very next gate anyone adds
is the first one to go through this loop, rather than the policy sitting unused until the suite has
already grown past whatever comfortable number someone picked.

## 2. Per-bug gate candidates — reported, never automated

`scripts/qa/quiet_gate_report.mjs` — **run it by hand, it is not in `npm test`.** It lists every
gate actually wired into `scripts.test` whose filename matches the project's per-bug naming
convention (`w<digits>_...` / `q<digits>_...`, one per numbered playtest finding), sorted by how
long it has been since the gate's own file last changed in git, and flags anything 14+ days quiet
as a candidate worth a human's five minutes.

**Why this cannot be the mechanism that retires anything.** `docs/HARD-WON-LESSONS.md` §12i,
written the same day as this policy: a gate that asserts against a copy of itself drifts silently
to green with nothing pushing back. An automated retirement script would be the exact same failure
aimed the other way — silently *removing* real protection with nobody ever having looked at what
it covered. So the report only reports. A human (or a fresh-context CEO review, per rule 25) reads
the candidate, opens the gate, opens the code it guards, and confirms the specific defect it
guards against can no longer occur — because the code path was deleted, or a broader structural
gate now covers the same ground — before anything moves.

**Structural/contract gates are never candidates.** `host_guest_parity_check.js`,
`engine_contract_check.js`, and the like guard a standing invariant that holds for the life of the
game, not one closed bug from one playtest session — the naming convention itself is what tells
the report apart from those, and it does not touch them.

## How to actually retire one

1. `node scripts/qa/quiet_gate_report.mjs` — find a candidate.
2. Read the gate and the code it guards. Confirm, in writing (the commit message, or the ledger),
   *why* the defect it protects against can no longer occur.
3. `git mv scripts/qa/<the_gate>.mjs scripts/qa/gate_archive/`
4. Remove its line from `package.json`'s `scripts.test`; decrement `gates.total` in the same edit.
5. `npm test` — confirms the count still matches the (now shorter) chain, and that nothing else
   broke.
6. Say what you retired and why in the commit message and the ledger — an append-only record,
   same convention as everything else in `.planning/CTO-LEDGER.md`.

**Never retire two gates in the commit that also adds a new one**, unless both retirements are
independently justified — the ceiling existing is not itself a reason to remove protection.
