const { isGameCode } = require("../../.claude/hooks/lib/game-code.cjs");
console.log("scripts/qa/foo.mjs ->", isGameCode("scripts/qa/foo.mjs"));
console.log("scripts\\qa\\foo.mjs ->", isGameCode("scripts\\qa\\foo.mjs"));
console.log(".claude/hooks/foo.cjs ->", isGameCode(".claude/hooks/foo.cjs"));
console.log(".claude\\hooks\\foo.cjs ->", isGameCode(".claude\\hooks\\foo.cjs"));
console.log("docs/FOO.md ->", isGameCode("docs/FOO.md"));
console.log("docs\\FOO.md ->", isGameCode("docs\\FOO.md"));
console.log("src/ui/stage.js ->", isGameCode("src/ui/stage.js"));
console.log("src\\ui\\stage.js ->", isGameCode("src\\ui\\stage.js"));
