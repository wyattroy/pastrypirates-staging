// scripts/analyze_classic.mjs
//
// Phase 11 static analysis — deterministic, no LLM, cannot stall. Produces the
// dependency-clustered inventory of the classic-script functions: call graph,
// net-call sites (criterion-1 risk), bridge-symbol reads, DOM coupling. This is
// the committed form of the phase-scratchpad analyzer used to produce
// 11-analysis.json during research; the only changes from that scratchpad
// version are path hygiene (no absolute/scratchpad paths survive a commit):
//   - the tokenizer import is now the relative "./lib/js_region_tokenizer.js"
//   - the net-function set is derived at runtime from src/net/index.js's own
//     export surface, instead of being read from a scratchpad netfns.txt —
//     src/net/index.js is the single source of truth for "what the net tier
//     publishes", so re-deriving it here can never drift stale the way a
//     frozen scratchpad list could
//   - the JSON report is written under this phase's directory (or, with
//     --stdout, to stdout only), never to a scratchpad path
//
// Run standalone: `node scripts/analyze_classic.mjs` reproduces the
// 183-function inventory used throughout 11-RESEARCH.md and 11-*-PLAN.md.

import { loadClassicScriptRegion, classify, maskNonCode } from "./lib/js_region_tokenizer.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NET_INDEX = path.join(ROOT, "src", "net", "index.js");
const OUT_FILE = path.join(
  ROOT,
  ".planning",
  "phases",
  "11-ui-extraction-orchestration-bridge-removal",
  "11-analysis.json"
);

const region = loadClassicScriptRegion();
const src = region.source;                 // classic <script> body
const masked = maskNonCode(src, classify(src)); // strings/comments blanked, code preserved
const startLine = region.startLine || 0;   // 1-based line of region start within index.html

const lines = masked.split("\n");
const rawLines = src.split("\n");

// --- bridge symbol surface (what the bridge publishes; reading these bare = bridge-coupled) ---
// Derived from src/net/index.js's own export surface at runtime — never a scratchpad file — so
// this list can never drift stale relative to what the net tier actually publishes.
const netNs = await import(pathToFileURL(NET_INDEX).href);
const NET_FNS = new Set(Object.keys(netNs));

// --- 1. find all top-level function declarations (brace-depth 0) with line ranges ---
const fnDeclRe = /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
const funcs = [];
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (depth === 0) {
    const m = line.match(fnDeclRe);
    if (m) {
      // capture body by brace matching from this line
      let d = 0, started = false, endLine = i;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) { if (ch === "{") { d++; started = true; } else if (ch === "}") d--; }
        if (started && d === 0) { endLine = j; break; }
      }
      funcs.push({ name: m[1], start: i, end: endLine,
        startAbs: startLine + i, endAbs: startLine + endLine,
        body: rawLines.slice(i, endLine + 1).join("\n"),
        bodyMasked: lines.slice(i, endLine + 1).join("\n") });
      i = endLine;
    }
  }
}

const fnNames = new Set(funcs.map(f => f.name));

// --- 2. per-function analysis on MASKED body (no string/comment false positives) ---
const idRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
for (const f of funcs) {
  const ids = f.bodyMasked.match(idRe) || [];
  const idSet = new Set(ids);
  f.calls = [...idSet].filter(n => fnNames.has(n) && n !== f.name);   // intra-classic calls
  f.netCalls = [...idSet].filter(n => NET_FNS.has(n));                // criterion-1 risk (direct net use)
  f.readsAppState = /\bappState\b/.test(f.bodyMasked);
  f.touchesDOM = /\bdocument\b|\bwindow\b|\$\(|\bel\(|\.innerHTML|\.appendChild|getElementById|querySelector|createElementNS/.test(f.bodyMasked);
  f.readsGame = /\bappState\.game\b|\broundCfg\b|\bGame\b/.test(f.bodyMasked);
  f.isAsync = /^\s*async\s+function/.test(f.body.split("\n")[0]);
}

// --- 3. reverse call graph (who calls me) ---
const callers = {};
for (const f of funcs) for (const c of f.calls) (callers[c] ||= new Set()).add(f.name);

// --- 4. classify each function ---
for (const f of funcs) {
  const netUser = f.netCalls.length > 0;
  if (netUser) f.tier = "orchestration (calls net directly — belongs in main OR invert)";
  else if (f.touchesDOM) f.tier = "ui (DOM)";
  else f.tier = "helper/logic";
}

// --- 5. summary ---
const totalFns = funcs.length;
const netUsers = funcs.filter(f => f.netCalls.length);
const domFns = funcs.filter(f => f.touchesDOM);
const pureFns = funcs.filter(f => !f.touchesDOM && !f.netCalls.length);

const out = {
  region: { startLineAbs: startLine, functionCount: totalFns },
  counts: {
    total: totalFns,
    netCallers_criterion1_risk: netUsers.length,
    domTouching: domFns.length,
    pureHelpers: pureFns.length,
    appStateReaders: funcs.filter(f=>f.readsAppState).length,
  },
  netCallers: netUsers.map(f => ({ name: f.name, line: f.startAbs, netCalls: [...new Set(f.netCalls)] })),
  functions: funcs.map(f => ({ name: f.name, line: f.startAbs, endLine: f.endAbs, lines: f.endAbs-f.startAbs+1,
    tier: f.tier, async: f.isAsync, dom: f.touchesDOM, net: [...new Set(f.netCalls)],
    calls: f.calls, calledBy: [...(callers[f.name]||[])] })),
};

if (process.argv.includes("--stdout")) {
  console.log(JSON.stringify(out, null, 2));
} else {
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
}

// console summary
console.log("FUNCTIONS:", totalFns);
console.log("net-callers (criterion-1 risk — UI must not import net):", netUsers.length);
console.log("DOM-touching:", domFns.length, "| pure helpers:", pureFns.length, "| appState readers:", out.counts.appStateReaders);
console.log("\n=== FUNCTIONS THAT CALL net* DIRECTLY (these decide UI/orchestration split) ===");
for (const f of netUsers) console.log(`  ${f.startAbs}  ${f.name}  ->  ${[...new Set(f.netCalls)].slice(0,6).join(", ")}${f.netCalls.length>6?" …":""}`);
