# Retired gates

Where a per-bug gate goes when it is retired, not deleted — `git mv` it here in the same commit
that removes its line from `package.json`'s `scripts.test` and decrements `gates.total`.

Full policy: [`docs/GATE-RETIREMENT.md`](../../../docs/GATE-RETIREMENT.md).

A file in this directory is documentation, not code — it is not imported, not run, and not part of
`npm test`. It exists so that if the defect it guarded ever comes back, the check that proved it
once already is one `git mv` away from active again, instead of being reconstructed from memory.
