# Retired instruments

Where a **measuring tool** goes when it is retired, not deleted — the balance and rules instruments
that live in `scripts/` but were never part of `npm test`. The sibling of
[`scripts/qa/gate_archive/`](../qa/gate_archive/README.md), which holds retired *gates*; the policy
is the same one, [`docs/GATE-RETIREMENT.md`](../../docs/GATE-RETIREMENT.md), applied to the things
that measure rather than the things that guard.

A file in this directory is **documentation, not code** — not imported, not run, not part of
`npm test`, and its imports are not expected to resolve. It exists so that if the question it
answered is ever asked again, the instrument that answered it once is one `git mv` away instead of
being reconstructed from memory.

**Everything moved here on 2026-09-18 came in for the same reason,** and it is worth stating once:
each one imported a tree the 2026-08-26 cutover deleted (`v2bakeoff/` or `3/`), so each threw
`ERR_MODULE_NOT_FOUND` on load and had not run since. That was three weeks during which
`docs/BOT-DESIGN-PRINCIPLES.md` §9 went on ordering every session to run one of them. **Not one of
them is here because the import was broken** — a broken import is a five-second fix. They are here
because, when the import was followed back to what the tool actually needed, the thing it measured
against had been deliberately deleted with a ruling behind it, and re-pointing would have produced
a number about a game nobody plays.

The gate that now catches the next one is section 12 of
[`scripts/doc_command_check.js`](../doc_command_check.js): every script the docs name must be able
to **load**, not merely to exist. It reads imports statically and never runs what it reads — a doc
may legitimately name a destructive command.
