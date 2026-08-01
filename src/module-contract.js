// src/module-contract.js
//
// A pure leaf module with no imports and no side effects. It exists solely
// to prove the module-loading contract this file's name describes: that a
// real ES module specifier resolves and its exports flow through a real
// import edge, both under plain Node and in the browser.
//
// This is NOT game code and is NOT the Phase 8 shared-constants module
// (SPLIT-02) — it is deliberately minimal per D-14, scoped to proving the
// loading contract only. Touches no browser global, no Node global, no DOM.

export const MODULE_OK_FLAG = "__pp_module_ok";
export const MODULE_CONTRACT_VERSION = 1;
