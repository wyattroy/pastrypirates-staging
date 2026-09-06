import fs from "node:fs";
import { execSync } from "node:child_process";
const OWN = /^⟨\s*`(T-\d{3})`\s*(?:·[^⟩]*)?⟩$/;

function audit(label, txt) {
  const lines = txt.split(/\r?\n/);
  const heads = [];
  lines.forEach((l, i) => { const m = /^## (T-\d{3}) — /.exec(l); if (m) heads.push({ id: m[1], i }); });
  let bad = 0;
  for (let k = 0; k < heads.length; k++) {
    const start = heads[k].i, end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    const own = lines.slice(start, end).map(l => OWN.exec(l.trim())).find(Boolean);
    const ownId = own ? own[1] : null;
    if (ownId !== heads[k].id) {
      bad++;
      console.log(`  MISMATCH ${label} line ${start + 1}: heading=${heads[k].id} bodyOwns=${ownId} :: ${lines[start].slice(0, 90)}`);
    }
  }
  console.log(`${label}: ${heads.length} archive heading(s), ${bad} mismatched`);
}

audit("WORKING", fs.readFileSync(".planning/CHART-LOG.md", "utf8"));
audit("HEAD    ", execSync("git show HEAD:.planning/CHART-LOG.md", { encoding: "utf8", maxBuffer: 64e6 }));
