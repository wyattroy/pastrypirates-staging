const gc = require(require("path").join(__dirname, "..", "..", ".claude", "hooks", "lib", "game-code.cjs"));
console.log("forward-slash rel:", gc.isGameCode("scripts/qa/foo.mjs"));
console.log("backslash rel:", gc.isGameCode("scripts\\qa\\foo.mjs"));
console.log("forward-slash .claude:", gc.isGameCode(".claude/hooks/foo.cjs"));
console.log("backslash .claude:", gc.isGameCode(".claude\\hooks\\foo.cjs"));
