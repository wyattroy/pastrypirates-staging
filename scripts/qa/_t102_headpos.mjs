// THROWAWAY RESIDUE — T-102, 2026-09-03. Untracked; safe to delete.
//
// This held a one-off check that every `<meta name="robots">` sits INSIDE <head> (Google ignores
// one that lands in the body, so "the string is in the file" is a weaker claim than it looks).
// It passed on all 22 served pages.
//
// ⚠ AN EARLIER VERSION OF THIS NOTE CLAIMED ITS FINDING WAS "now carried by the real gate,
// crawl_intent_check.mjs". THAT WAS FALSE WHEN WRITTEN — that gate regexed the whole file with no
// <head> scoping, so the stranded-meta case was caught by nothing standing. Found by CEO 183,
// finding 6. IT IS TRUE NOW: crawl_intent_check.mjs slices <head> before matching, and
// `--red=bodymeta` proves it fails on a meta moved into the body.
//
// Emptied rather than deleted: this session's sandbox refuses every file deletion. A session with
// delete rights should remove this and the three other `_t102_*` scratch files.
