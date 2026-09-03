// THROWAWAY RESIDUE — T-102, 2026-09-03. Untracked; safe to delete.
//
// This held a one-off that counted, per top-level folder, how many SERVED files can carry no meta
// tag at all. Its measurement is the evidence behind the robots.txt fences and is recorded in the
// ledger: scripts/ 376 non-HTML, art-review/ 117, docs/ 25, notes/ 2 — against assets/ 149 and
// src/ 28, which are the game and must stay crawlable.
//
// Its finding is now carried by a standing gate: crawl_intent_check.mjs clause 2, which classifies
// every top-level folder SHIPPED or WORKING and is STRICT BY DEFAULT, so an unclassified folder
// fails the build (`--red=newfolder` proves it).
//
// Emptied rather than deleted: this session's sandbox refuses every file deletion.
