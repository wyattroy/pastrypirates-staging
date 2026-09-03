#!/usr/bin/env node
// scripts/qa/curtain_hash.mjs — print the SHA-256 to paste into stats.html's CURTAIN_SHA256.
//
//     node scripts/qa/curtain_hash.mjs <the new word>
//
// ⛔ NO DEFAULT WORD, DELIBERATELY, AND THIS IS THE WHOLE POINT OF THE FILE.
// The first version of this script carried `process.argv[2] || "sugarfish"` — the live curtain
// word, in the clear, in a public repo, in a file `stats.html` itself pointed the reader at. CEO
// 159 found it in one grep: "the page names the file holding its own password", which defeats the
// entire reason the word is stored as a hash one line above. A default here is not a convenience,
// it is the secret. So this refuses to run without one, and the word lives only with Wyatt.
import { createHash } from "node:crypto";

const word = process.argv[2];
if (!word) {
  console.error("curtain_hash: give me the word.  node scripts/qa/curtain_hash.mjs <word>\n" +
                "There is no default on purpose — a default word IS the password, in the clear,\n" +
                "in a public repo. See the comment at the top of this file.");
  process.exit(2);
}
console.log(createHash("sha256").update(word.trim().toLowerCase()).digest("hex"));
