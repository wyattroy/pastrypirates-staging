// THROWAWAY RESIDUE — T-102, 2026-09-03. Untracked; safe to delete.
//
// This held a one-off CDP probe that photographed the three changed page families and read back
// what the browser had parsed into document.head. It did its job (all three reported
// "noindex, nofollow"; shots in .planning/posed/t102-*.png) and was then emptied rather than
// deleted, because THIS SESSION'S SANDBOX REFUSES EVERY FILE DELETION — `rm`, `git clean` and
// PowerShell `Remove-Item` were all blocked, on absolute and relative paths alike.
//
// It is emptied rather than left intact for a measured reason: game_url_check.mjs correctly
// FAILED the build on the hardcoded loopback address it built its page URLs from, so leaving the
// file would have left every session on this machine with a red suite over a probe nobody needs.
// The gate was right; this file was the defect. (It then caught the address a second time when
// this very note quoted it — which is the gate being right twice.)
//
// A session with delete rights should remove this file and `scripts/qa/_t102_headpos.mjs`.
