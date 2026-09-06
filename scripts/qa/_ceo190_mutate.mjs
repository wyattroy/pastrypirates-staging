#!/usr/bin/env node
/* CEO 190 — my own mutations against analytics_consent_check.mjs, in an isolated copy under the OS
   temp dir. Never touches the live tree. Every mutation verified applied before its result is read.
   TEMPORARY: this file is deleted at the end of the review. */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "C:/Users/wyatt/Projects/pastrypirates";
const COPY = ["src", "classic", "scripts/qa/analytics_consent_check.mjs",
  "index.html", "about.html", "rules.html", "stats.html"];
const SKIP = new Set(["assets", "node_modules", ".git"]);

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ceo190-"));
  for (const rel of COPY) {
    const from = join(ROOT, rel);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, rel), { recursive: true, filter: (s) => !SKIP.has(s.split(/[\\/]/).pop()) });
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}
const restage = (dir) => spawnSync("git", ["add", "-A"], { cwd: dir });
function runGate(dir) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "qa", "analytics_consent_check.mjs")],
    { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const RAW = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-2KK6EZDZSP"></script>`;

const M = [
  { name: "M0  CONTROL, no mutation", apply() { return () => true; } },
  { name: "M1  GA tag injected from JAVASCRIPT in src/orchestrator.js (not an HTML tag)",
    apply(d) {
      const f = join(d, "src", "orchestrator.js");
      writeFileSync(f, readFileSync(f, "utf8") + `
if (typeof document !== "undefined") {
  const _s = document.createElement("script");
  _s.async = true;
  _s.src = "https://www.googletagmanager.com/gtag/js?id=G-2KK6EZDZSP";
  document.head.appendChild(_s);
}
`);
      return () => readFileSync(f, "utf8").includes("googletagmanager.com/gtag/js");
    } },
  { name: "M2  legacy Google Analytics from www.google-analytics.com in index.html",
    apply(d) {
      const f = join(d, "index.html");
      const t = readFileSync(f, "utf8"); const at = t.indexOf("</head>");
      writeFileSync(f, t.slice(0, at) + `<script async src="https://www.google-analytics.com/analytics.js"></script>\n` + t.slice(at));
      return () => readFileSync(f, "utf8").includes("google-analytics.com/analytics.js");
    } },
  { name: "M2b GA via a first-party proxy host (server-side tagging) in index.html",
    apply(d) {
      const f = join(d, "index.html");
      const t = readFileSync(f, "utf8"); const at = t.indexOf("</head>");
      writeFileSync(f, t.slice(0, at) + `<script async src="https://metrics.playpastrypirates.com/mp/js?id=G-2KK6EZDZSP"></script>\n` + t.slice(at));
      return () => readFileSync(f, "utf8").includes("metrics.playpastrypirates.com/mp/js");
    } },
  { name: "M3  a NEW tracked page promo.html carrying the raw snippet",
    apply(d) {
      writeFileSync(join(d, "promo.html"), `<!doctype html><html><head>${RAW}</head><body>hi</body></html>`);
      return () => existsSync(join(d, "promo.html"));
    } },
  { name: "M4  the same new page promo.html, NOT git add'ed (untracked)",
    noRestage: true,
    apply(d) {
      writeFileSync(join(d, "promo.html"), `<!doctype html><html><head>${RAW}</head><body>hi</body></html>`);
      return () => existsSync(join(d, "promo.html"));
    } },
  { name: "M5  raw snippet in an UNDERSCORE dir _next/page.html (servable() skips it)",
    apply(d) {
      mkdirSync(join(d, "_next"), { recursive: true });
      writeFileSync(join(d, "_next", "page.html"), `<!doctype html><html><head>${RAW}</head></html>`);
      return () => existsSync(join(d, "_next", "page.html"));
    } },
  { name: "M6  consent GRANT in scripts/consent_banner.js (scripts/ deliberately excluded)",
    apply(d) {
      mkdirSync(join(d, "scripts"), { recursive: true });
      writeFileSync(join(d, "scripts", "consent_banner.js"),
        `window.gtag("consent","update",{ analytics_storage: "granted" });\n`);
      return () => existsSync(join(d, "scripts", "consent_banner.js"));
    } },
  { name: "M7  consent GRANT built from a concatenated string in src/orchestrator.js",
    apply(d) {
      const f = join(d, "src", "orchestrator.js");
      writeFileSync(f, readFileSync(f, "utf8") +
        `\nconst _v = "gran" + "ted"; if (typeof window !== "undefined" && window.gtag) window.gtag("consent","update",{ analytics_storage: _v });\n`);
      return () => readFileSync(f, "utf8").includes('"gran" + "ted"');
    } },
  { name: "M8  a stray second gtag('config') for a DIFFERENT property in index.html",
    apply(d) {
      const f = join(d, "index.html");
      const t = readFileSync(f, "utf8"); const at = t.indexOf("</head>");
      writeFileSync(f, t.slice(0, at) + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('config','G-EVILEVIL1');</script>\n` + t.slice(at));
      return () => readFileSync(f, "utf8").includes("G-EVILEVIL1");
    } },
  { name: "M9  analytics_storage flipped to granted INSIDE src/analytics.js's default call",
    apply(d) {
      const f = join(d, "src", "analytics.js");
      const t = readFileSync(f, "utf8");
      writeFileSync(f, t.replace('analytics_storage: "denied"', 'analytics_storage: "granted"'));
      return () => readFileSync(f, "utf8").includes('analytics_storage: "granted"');
    } },
  { name: "M10 LIVE_HOST widened to a substring test so staging fires too",
    apply(d) {
      const f = join(d, "src", "analytics.js");
      const t = readFileSync(f, "utf8");
      writeFileSync(f, t.replace("return String(hostname) === LIVE_HOST;", "return String(hostname).includes(LIVE_HOST);"));
      return () => readFileSync(f, "utf8").includes("includes(LIVE_HOST)");
    } },
  { name: "M11 the consent denial moved AFTER the tag load (the core ordering fault)",
    apply(d) {
      const f = join(d, "src", "analytics.js");
      let t = readFileSync(f, "utf8");
      const m = t.match(/  gtag\("consent", "default", \{[\s\S]*?\n  \}\);\n/);
      if (!m) return () => false;
      t = t.replace(m[0], "");
      t = t.replace('  gtag("js", new Date());', m[0] + '  gtag("js", new Date());');
      writeFileSync(f, t);
      return () => {
        const s = readFileSync(f, "utf8");
        return s.indexOf('"consent", "default"') > s.indexOf("googletagmanager");
      };
    } },
  { name: "M12 the GATE ITSELF given a syntax error (does a crash read as a catch?)",
    apply(d) {
      const f = join(d, "scripts", "qa", "analytics_consent_check.mjs");
      writeFileSync(f, readFileSync(f, "utf8") + "\nthis is not javascript {{{\n");
      return () => readFileSync(f, "utf8").includes("this is not javascript");
    } },
  { name: "M13 a harmless page containing the word 'granted' in prose (false-positive probe)",
    apply(d) {
      writeFileSync(join(d, "credits2.html"), `<!doctype html><html><body><p>Permission "granted" by the artists.</p></body></html>`);
      return () => existsSync(join(d, "credits2.html"));
    } },
];

for (const m of M) {
  const dir = fixture();
  try {
    const verify = m.apply(dir);
    if (!verify()) { console.log(`  ERROR   mutation not applied: ${m.name}`); continue; }
    if (!m.noRestage) restage(dir);
    const { code, out } = runGate(dir);
    const fails = (out.match(/  FAIL {2}.*/g) || []).map((s) => s.trim().slice(0, 170));
    const verdict = code === 0 ? "PASS(blind)" : "CAUGHT     ";
    console.log(`  ${verdict}  ${m.name}`);
    for (const f of fails) console.log(`             ${f}`);
    if (code !== 0 && !fails.length) console.log(`             (exit ${code} with NO FAIL line — crash) ${out.trim().split("\n").slice(-2).join(" | ").slice(0, 200)}`);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}
