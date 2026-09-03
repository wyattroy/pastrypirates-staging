// One-liner helper: print the SHA-256 of the curtain word for stats.html.
//   node scripts/qa/_curtain_hash.mjs <word>
import { createHash } from "node:crypto";
const word = process.argv[2] || "sugarfish";
console.log(word, createHash("sha256").update(word).digest("hex"));
