import fs from "node:fs";
const OWN = /^⟨\s*`(T-\d{3})`\s*(?:·[^⟩]*)?⟩$/;
const LOOSE = /⟨\s*`(T-\d{3})`\s*(?:·[^⟩]*)?⟩/;
for (const f of [".planning/CHART.md", ".planning/CHART-LOG.md"]) {
  const txt = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let rows = [], cur = null;
  for (const l of txt) {
    if (/^- \[[ xX]\]/.test(l)) { if (cur) rows.push(cur); cur = [l]; }
    else if (cur) cur.push(l);
  }
  if (cur) rows.push(cur);
  let disagree = 0, ownNone = 0, fallback = 0;
  for (const r of rows) {
    const own = r.map(l => OWN.exec(l.trim())).find(Boolean);
    const loose = r.map(l => LOOSE.exec(l)).find(Boolean);
    if (!own && loose) { fallback++; console.log("  FALLBACK-USED -> " + loose[1] + " :: " + r[0].slice(0, 100)); }
    if (!own && !loose) ownNone++;
    if (own && loose && own[1] !== loose[1]) { disagree++; console.log("  DISAGREE own=" + own[1] + " loose=" + loose[1] + " :: " + r[0].slice(0, 100)); }
  }
  console.log(f + ": rows=" + rows.length + " fallbackUsed=" + fallback + " noHandleAtAll=" + ownNone + " disagreements=" + disagree);
}
