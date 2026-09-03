/* RENAMED — THIS FILENAME WAS A FALSE CLAIM. The gate lives at
 * `scripts/qa/emoji_with_art_never_reaches_screen_check.mjs` and that is the one in `npm test`.
 *
 * CEO 101, 2026-09-02: plenty of typed emoji DO reach the screen and are drawn by the font. The
 * 🏴 that opens the black-market card (`src/ui/panel.js:1153`) is a bare U+1F3F4 and `EMOJI_IMG`
 * holds only the ZWJ "🏴‍☠", so it is never swapped — it renders, in the same WebKit frame where
 * the coin came back blank, which makes it the direct disproof of the missing-font theory. Only
 * the emoji the game has ART for never reach the screen.
 *
 * ⚠ WHY A STUB AND NOT A DELETION, stated rather than left looking like sloppiness: an unattended
 * watch on this machine cannot delete a file. `rm` and PowerShell `Remove-Item` are both REFUSED
 * inside the repo's own working directory, and `git mv` / `git rm` need an approval no unattended
 * session can give. Measured 2026-09-02T11:xxZ, three ways. **A watch can create and edit but not
 * remove** — worth knowing before someone plans a cleanup pass that assumes otherwise. Whoever is
 * here with a person at the keyboard: delete this file.
 */
console.log("renamed -> scripts/qa/emoji_with_art_never_reaches_screen_check.mjs");
