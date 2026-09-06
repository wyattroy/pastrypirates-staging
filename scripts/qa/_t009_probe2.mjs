import { hashFiles } from "../lib/game_tree_hash.mjs";
import { legIsFresh } from "../lib/leg_cache_key.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// hashFiles: content-sensitivity and determinism, in a throwaway scratch dir (never touches
// the real repo, which a live sea trial is currently sailing).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t009-hashfiles-"));
fs.writeFileSync(path.join(dir, "a.js"), "one");
fs.mkdirSync(path.join(dir, "sub"));
fs.writeFileSync(path.join(dir, "sub", "b.js"), "two");

const before = hashFiles(dir, ["a.js", "sub/b.js"]);
const beforeAgain = hashFiles(dir, ["a.js", "sub/b.js"]);
console.log("same content, two calls agree:", before === beforeAgain);

fs.writeFileSync(path.join(dir, "a.js"), "ONE-CHANGED");
const afterEdit = hashFiles(dir, ["a.js", "sub/b.js"]);
console.log("editing a tracked file changes the hash:", before !== afterEdit);

const afterUnrelated = hashFiles(dir, ["sub/b.js"]); // simulate: a.js not in the "game" set at all
console.log("a file outside the given set never affects the hash:", afterUnrelated === hashFiles(dir, ["sub/b.js"]));

const missing = hashFiles(dir, ["a.js", "sub/b.js", "sub/does-not-exist.js"]);
console.log("a listed-but-missing (deleted-but-tracked) file changes the hash:", missing !== afterEdit);

// legIsFresh: the resume-gate function, in isolation
console.log("fresh record, matching hash -> reusable:", legIsFresh({ __treeHash: "abc" }, "abc") === true);
console.log("fresh record, mismatched hash -> NOT reusable:", legIsFresh({ __treeHash: "abc" }, "xyz") === false);
console.log("record with no __treeHash at all -> NOT reusable:", legIsFresh({ __stamp: "2026.09.04.2" }, "xyz") === false);
console.log("null record -> NOT reusable:", legIsFresh(null, "xyz") === false);

fs.rmSync(dir, { recursive: true, force: true });
