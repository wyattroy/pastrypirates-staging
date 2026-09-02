// SUPERSEDED, NEVER COMMITTED, AND THIS SESSION COULD NOT DELETE IT (the sandbox blocks file
// removal). The real gate is scripts/qa/rulings_triage_check.mjs.
//
// This was the first attempt at INBOX-20260901T1310Z: it put the rulings triage inside
// scripts/wyclau/glass.mjs. That file is VENDORED from claude-kit and vendor_check.mjs failed the
// build on the edit, correctly -- the kit lives on Wyatt's Mac and cannot be re-vendored from
// this machine. The lifecycle moved into the record (.planning/CHART.md) instead, which is what
// he asked for anyway: "there must be a process".
//
// Delete this file.
process.exit(0);
