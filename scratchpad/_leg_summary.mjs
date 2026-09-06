import fs from "node:fs";
import path from "node:path";

const dir = "sea-trial-shots/legs";
const files = fs.readdirSync(dir).filter(f => f.endsWith("--2026.09.03.4.json"));

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const judged = j.judged || [];
  const fails = judged.filter(s => s.r && s.r.verdict === "FAIL");
  const findings = j.player?.findings || (j.seats || []).flatMap(s => s.player?.findings || []);
  console.log(`${f} | runId:${j.__runId} | finished:${j.finished} | screens:${judged.length} | consoleErrs:${(j.consoleErrs||[]).length} | FAILs:${fails.length} | structFindings:${(findings||[]).length}`);
  for (const fl of fails) {
    console.log(`   FAIL ${path.basename(fl.shot)} :: ${(fl.r.issues||[]).join("; ")}`);
  }
  for (const fnd of (findings||[])) {
    console.log(`   STRUCT-FINDING: ${JSON.stringify(fnd)}`);
  }
}
