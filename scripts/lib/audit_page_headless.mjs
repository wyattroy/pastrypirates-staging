// scripts/lib/audit_page_headless.mjs
//
// REVIEW TOOLING ONLY (see scripts/lib/tiny_dom.mjs's header for the zero-dependency stance and the
// shim's deliberate limits). This module RUNS art-review/narration-audit.html's own `<script
// type="module">` under plain `node`, against the tiny DOM, and hands back three facts nothing else
// in `npm test` could answer without a browser:
//
//   1. how many cards the page actually renders (and which ids),
//   2. what the page's OWN D-21 self-check says about them (`probeFailures`, verbatim),
//   3. whether any NODE_GROUP collapsed into an error card, and with what exception.
//
// ============================================================================
// THE ONE THING THIS FILE MUST NEVER DO
// ============================================================================
// It must not reimplement the page's card building. Every number it returns is read back off the
// page's own render and the page's own probe array — never re-derived here. A harness that computed
// its own expected card set would be a THIRD implementation of the card list, and "two copies drift"
// is the entire reason art-review/narration-core.js exists. The page's script text is loaded
// UNMODIFIED except for two mechanical rewrites, both narrow and both stated:
//
//   - relative import specifiers are made absolute, because the extracted module is evaluated from
//     the OS temp directory (writing a scratch .mjs into art-review/ would risk leaving a stray
//     file in Wyatt's repo if this crashed mid-run);
//   - one epilogue statement is appended that publishes the page's already-computed values on
//     globalThis. It reads; it never writes anything the page would see.
//
// If either rewrite ever needs to touch a line the page's logic depends on, this harness is the
// wrong tool and the gate should say so out loud rather than quietly measuring a mutated page.

// ============================================================================
// WHY IT RUNS IN ITS OWN PROCESS (`renderAuditPageHeadlessIsolated`)
// ============================================================================
// The page and scripts/narration_audit_check.js import the SAME art-review/narration-core.js. In one
// process that is one module instance, and two consumers then fight over its mutable state in two
// ways that both silently corrupt a measurement:
//
//   - `core.configure()`. The page injects its own `../assets/` path rewriter; the gate wants
//     identity. Whoever configures last wins, and assertion 7's table baseline started failing with
//     `assets/…` vs `../assets/…` for no reason of its own.
//   - `appState.game`. In a BROWSER the page sets its bootstrap first and the core's import-time
//     bootstrap (which adds the `tradeOpp`/`needs`/`ev` method stubs some prompt branches call)
//     lands second and wins. In-process, the core is already imported, so the page's stub-less
//     bootstrap wins instead — the opposite order from the real thing.
//
// Both are load-order artefacts, not findings, and a harness whose numbers depend on who imported
// what first is not evidence. So the render happens in a fresh `node` process where nothing has
// imported the core yet: module load order matches the browser exactly, and the gate's own core state
// is untouchable. One spawn per `npm test` run.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseDocument, cssEscape } from "./tiny_dom.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PAGE_REL = "art-review/narration-audit.html";
const PAGE_DIR = join(ROOT, "art-review");

const SCRIPT_OPEN_RE = /<script\s+type="module">/;

/** Pull the page's single module script out of the HTML, plus the HTML with that script removed. */
export function splitPage(pageText) {
  const open = SCRIPT_OPEN_RE.exec(pageText);
  if (!open) throw new Error(`${PAGE_REL}: no <script type="module"> found — the page's shape changed`);
  const bodyStart = open.index + open[0].length;
  const close = pageText.indexOf("</script>", bodyStart);
  if (close === -1) throw new Error(`${PAGE_REL}: module script is never closed`);
  const script = pageText.slice(bodyStart, close);
  const shell = pageText.slice(0, bodyStart) + pageText.slice(close);
  return { script, shell };
}

// `from "../x"` / `import("../x")` -> absolute file:// URL, resolved from art-review/.
function absolutiseSpecifiers(script) {
  return script.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
    (_m, lead, quote, spec) => `${lead}${quote}${pathToFileURL(resolve(PAGE_DIR, spec)).href}${quote}`,
  );
}

// Reads the page's own already-computed values. Appended verbatim; touches nothing.
const EPILOGUE = `
globalThis.__auditHeadless = (() => {
  const cards = document.querySelectorAll(".card");
  const errorCards = cards.filter((c) => c.classList.contains("errorCard"));
  return {
    cardElements: cards.length,
    cardIds: cards.map((c) => c.dataset.id),
    selfCheckFailures: probeFailures.map((f) => ({
      key: f.key,
      text: String(f.text == null ? "" : f.text),
      fields: f.fields || null,
    })),
    errorCards: errorCards.map((c) => ({
      id: c.dataset.id,
      detail: (c.querySelector(".rawSource pre") || { textContent: "" }).textContent,
    })),
    nodeGroupCount: NODE_GROUPS.length,
    inventoryCounts: {
      adhoc: (inv.adhoc || []).length,
      prompts: (inv.prompts || []).length,
      misc: (inv.misc || []).length,
      awards: (inv.awards || []).length,
    },
  };
})();
`;

/* ================= the browser globals the page touches ================= */

function installGlobals(doc) {
  const g = globalThis;
  const store = new Map();

  g.document = doc;
  g.CSS = { escape: cssEscape };

  const listeners = {};
  const win = {
    document: doc,
    scrollX: 0, scrollY: 0, innerWidth: 1440, innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener: (t, fn) => { (listeners[t] || (listeners[t] = [])).push(fn); },
    removeEventListener: () => {},
    scrollTo: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    location: { href: `file://${join(ROOT, PAGE_REL)}`, search: "", hash: "" },
    history: { replaceState: () => {}, pushState: () => {} },
  };
  g.window = win;
  g.self = win;
  g.getComputedStyle = win.getComputedStyle;
  g.matchMedia = win.matchMedia;
  // `navigator` is a read-only accessor on modern Node and this page never reads it; `location` /
  // `history` are only reachable through `window.` here. Defined defensively, never fatally — a
  // harness that dies setting up a global the page does not use would be its own bug.
  for (const [name, value] of [["location", win.location], ["history", win.history]]) {
    try { g[name] = value; } catch { /* read-only in this runtime; window.<name> still works */ }
  }

  g.localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  g.sessionStorage = g.localStorage;

  // Layout-deferred work (flow-chart edges, scroll restore) renders no cards — deliberately inert,
  // so a fake getBoundingClientRect() can never produce a fake finding.
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };

  g.alert = () => {};
  g.confirm = () => true;
  if (!g.Blob) g.Blob = class { constructor(parts) { this.parts = parts; } };
  if (!g.URL.createObjectURL) {
    g.URL.createObjectURL = () => "blob:headless";
    g.URL.revokeObjectURL = () => {};
  }

  // Local-file fetch. Resolved from art-review/ exactly as the browser resolves it when the page is
  // served from that directory, so the harness reads the same bytes the page does.
  g.fetch = async (url) => {
    const raw = String(url).replace(/^file:\/\//, "");
    const path = raw.startsWith("/") ? raw : resolve(PAGE_DIR, raw);
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      return { ok: false, status: 404, url: String(url), text: async () => "", json: async () => { throw err; } };
    }
    return { ok: true, status: 200, url: String(url), text: async () => text, json: async () => JSON.parse(text) };
  };

  return { window: win, listeners };
}

/**
 * Render the audit page headlessly.
 *
 * @param {{pageText?: string}} [opts] pageText overrides the on-disk page — used by --drill to run a
 *   synthetic violation (and a negative control) through the REAL harness rather than a mock of it.
 * @returns {Promise<{ok: boolean, fatal: string|null, cardElements: number, cardIds: string[],
 *   selfCheckFailures: object[], errorCards: object[], nodeGroupCount: number,
 *   inventoryCounts: object}>}
 */
export async function renderAuditPageHeadless(opts = {}) {
  const pageText = opts.pageText != null ? opts.pageText : readFileSync(join(ROOT, PAGE_REL), "utf8");
  const { script, shell } = splitPage(pageText);
  installGlobals(parseDocument(shell));

  const dir = mkdtempSync(join(tmpdir(), "narration-audit-headless-"));
  const file = join(dir, `page-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(file, absolutiseSpecifiers(script) + EPILOGUE, "utf8");

  const empty = {
    ok: false, fatal: null, cardElements: 0, cardIds: [], selfCheckFailures: [],
    errorCards: [], nodeGroupCount: 0, inventoryCounts: { adhoc: 0, prompts: 0, misc: 0, awards: 0 },
  };
  try {
    delete globalThis.__auditHeadless;
    await import(pathToFileURL(file).href);
    const out = globalThis.__auditHeadless;
    if (!out) return Object.assign(empty, { fatal: "the page's module finished but published no result — the epilogue did not run" });
    return Object.assign({}, empty, out, { ok: true, fatal: null });
  } catch (err) {
    // A throw here is THE historic failure mode: an exception escapes the page's render and the
    // browser shows a loading placeholder. Reported as fatal, never swallowed.
    return Object.assign(empty, { fatal: `${(err && err.stack) || err}` });
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir already gone */ }
  }
}

/* ================= process isolation ================= */

// A sentinel, because the page is free to console.log whatever it likes and the result must never be
// confused with the page's own chatter.
const RESULT_MARKER = "__AUDIT_HEADLESS_JSON__";

/**
 * Render the page in a FRESH node process (see this file's header for why) and return the same shape
 * `renderAuditPageHeadless` returns.
 *
 * @param {{pageFile?: string}} [opts] pageFile renders an alternative page file instead of the real
 *   one — how --drill red-proofs assertion 10 against a synthetic page without a browser.
 */
export function renderAuditPageHeadlessIsolated(opts = {}) {
  const args = [fileURLToPath(import.meta.url), "--json"];
  if (opts.pageFile) args.push("--page-file", opts.pageFile);
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, { cwd: ROOT, maxBuffer: 1e8, stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (err) {
    const stderr = (err && err.stderr && err.stderr.toString()) || "";
    return {
      ok: false,
      fatal: `the headless render subprocess exited non-zero:\n${stderr.trim() || (err && err.message) || String(err)}`,
      cardElements: 0, cardIds: [], selfCheckFailures: [], errorCards: [], nodeGroupCount: 0,
      inventoryCounts: { adhoc: 0, prompts: 0, misc: 0, awards: 0 },
    };
  }
  const line = stdout.split("\n").reverse().find((l) => l.startsWith(RESULT_MARKER));
  if (!line) {
    return {
      ok: false,
      fatal: `the headless render subprocess printed no result line — its output was:\n${stdout.slice(-2000)}`,
      cardElements: 0, cardIds: [], selfCheckFailures: [], errorCards: [], nodeGroupCount: 0,
      inventoryCounts: { adhoc: 0, prompts: 0, misc: 0, awards: 0 },
    };
  }
  return JSON.parse(line.slice(RESULT_MARKER.length));
}

/* ================= CLI (the subprocess entry point) ================= */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const pf = argv.indexOf("--page-file");
  const pageText = pf !== -1 && argv[pf + 1] ? readFileSync(argv[pf + 1], "utf8") : undefined;
  const result = await renderAuditPageHeadless(pageText === undefined ? {} : { pageText });
  if (argv.includes("--json")) {
    process.stdout.write("\n" + RESULT_MARKER + JSON.stringify(result) + "\n");
  } else {
    console.log(`cards rendered: ${result.cardIds.length} (${new Set(result.cardIds).size} distinct) across ${result.nodeGroupCount} moments`);
    console.log(`error cards: ${result.errorCards.length} · page self-check failures: ${result.selfCheckFailures.length}`);
    if (result.fatal) console.error("FATAL:\n" + result.fatal);
  }
  process.exit(0);
}
