// THROWAWAY RESIDUE — T-102, 2026-09-03. Untracked; safe to delete.
//
// This held the one-off that inserted `<meta name="robots" content="noindex, nofollow">` into the
// thirteen pages that were live and crawlable. It ran once, successfully, and its output is the
// committed diff.
//
// ITS OWN FIRST LINE USED TO SAY "removed before the commit" AND THAT WAS FALSE — it was still on
// disk, still executable, and it was the ONE piece of scratch this watch failed to disclose while
// disclosing the other two. Found by CEO 183, finding 6. The claim is corrected here rather than
// deleted, because a comment that was wrong is worth more as a correction than as an absence.
//
// It is emptied rather than deleted because THIS SESSION'S SANDBOX REFUSES EVERY FILE DELETION —
// `rm`, `git clean` and PowerShell `Remove-Item` were all blocked, on absolute and relative paths
// alike. A session with delete rights should remove this file, `scripts/qa/_t102_headpos.mjs`,
// `scripts/qa/_t102_shot.mjs` and `scripts/qa/_t102_expose.mjs`.
