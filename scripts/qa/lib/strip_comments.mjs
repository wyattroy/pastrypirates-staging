/* THE ONE COMMENT STRIPPER, because eight copies of a wrong one is eight blind gates.
 *
 * WHAT IT COST, MEASURED 2026-08-29 (found while following gate 42 to the moved `subjectOf` rule).
 * Every text gate carried this line, copied from the one before it:
 *
 *     const strip = s => s.replace(BLOCK_RE, "").replace(LINE_RE, "$1")
 *       where BLOCK_RE matches slash-star, anything lazily, star-slash — and LINE_RE matches
 *       slash-slash to end of line. (Written out in words on purpose: spelling the block pattern
 *       literally inside a block comment ends the comment, which is this bug in one line.)
 *
 * It deletes BLOCK comments first. So a LINE comment containing the two characters that open one
 * silently opens a block comment — and `src/orchestrator.js:17` says `src/flow/<star>.js` inside a
 * `//` comment. The stripper therefore swallowed everything from line 17 to the next `*<slash>` at
 * line 168: **152 lines, including the ENTIRE import block**, invisible to all eight gates that
 * read that file. An assertion about an import there could only ever report absence, which reads
 * exactly like a real failure and is worth no more than a real pass (rule 6: an instrument that
 * reports NOT FOUND has told you something about ITSELF).
 *
 * THE FIX IS TO READ LEFT TO RIGHT, which is the only order in which "which comment started first"
 * has an answer. Strings are tracked too, so `"a /* b"` no longer opens one either.
 *
 * WHAT IT STILL CANNOT DO, said plainly rather than left to be discovered: it does not detect
 * REGULAR EXPRESSION LITERALS, so a pattern containing the characters that open a comment —
 * `/[/*]/` — would confuse it. That gap is stated rather than claimed away: an earlier version of
 * this header also asserted "no gate in this repo reads a file where that appears", and CEO Review
 * 25 was right to treat that as a claim nobody had measured. The nested-template gap it found is
 * fixed below; the regex-literal one is real and open, and this is the one place to fix it.
 */
export function stripComments(src) {
  let out = "", i = 0;
  const n = src.length;
  /* A STACK, BECAUSE TEMPLATE LITERALS NEST AND THE FIRST VERSION DID NOT KNOW IT (CEO Review 25).
     `${h ? `A` : `B`}` inside a backtick string: scanning to "the next backtick" ends the string in
     the middle of it, the parser's idea of inside-vs-outside flips, and comment lines further down
     leak through as if they were code. MEASURED on the real tree: 3 lines leaked in src/ui/flow.js
     (around the U+2212 note at :1488), 7 in src/ui/recipe.js and 20 in index.html. The leak is in
     the SAFER direction — prose appearing where it should not, rather than code disappearing — but
     "safer" is not "correct", and an assertion grepping for a word can be answered by a comment.
     Entries: "`" = inside a template literal, "${" = inside its interpolation, back to code. */
  const stack = [];
  const inTemplate = () => stack[stack.length - 1] === "`";
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inTemplate()) {                                  // inside `...` — only ${ and ` matter
      if (c === "\\") { out += c + (d || ""); i += 2; continue; }
      if (c === "$" && d === "{") { out += "${"; stack.push("${"); i += 2; continue; }
      if (c === "`") { out += c; stack.pop(); i++; continue; }
      out += c; i++; continue;
    }
    if (c === "/" && d === "*") {                        // block comment: drop to the closer
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "/" && d === "/") {                        // line comment: drop to the newline
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;                           // keep the newline itself
      continue;
    }
    if (c === "`") { out += c; stack.push("`"); i++; continue; }
    if (c === '"' || c === "'") {                        // a plain string is not a comment
      out += c; i++;
      while (i < n) {
        if (src[i] === "\\") { out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        out += src[i];
        if (src[i] === c) { i++; break; }
        if (src[i] === "\n") break;                      // an unterminated quote ends at the line
        i++;
      }
      continue;
    }
    if (c === "}" && stack[stack.length - 1] === "${") { out += c; stack.pop(); i++; continue; }
    out += c; i++;
  }
  return out;
}
