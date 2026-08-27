#!/usr/bin/env bash
#
# Publish the working tree's game to  playpastrypirates.com/staging
#
#   scripts/publish-staging-path.sh
#
# ============================================================================
#  WHY A PATH AND NOT A SUBDOMAIN
# ============================================================================
# staging.playpastrypirates.com is the real destination and is half-built: the
# staging repo exists (wyattroy/pastrypirates-staging), it owns a CNAME for that
# host, and GitHub Pages is configured for it. It needs ONE DNS record at
# Squarespace that only Wyatt can add — CNAME  staging -> wyattroy.github.io.
# Until that exists, this publishes to a PATH on the live domain instead, which
# needs no DNS at all. Wyatt's call, 2026-08-26: "we'll set up
# staging.playpastrypirates.com tomorrow -- in the mean time, put it at
# playpastrypirates.com/staging".
#
# ============================================================================
#  WHY A FULL COPY, INCLUDING assets/ — read before "optimising" it
# ============================================================================
# The obvious saving is to share the root's 18 MB of art by rewriting every path
# to ../assets/. The game has FOUR separate places that would need it:
#     src/shared/index.js   ASSET_BASE="assets/"
#     src/ui/audio.js       SFX_DIR="sfx/"
#     src/ui/stage.js:1846  hardcoded  assets/boats/…   (does not use ASSET_BASE)
#     src/ui/stage.js:1861  hardcoded  assets/boats/…   (ditto)
#     index.html            27 more
# MISSING ONE IS SILENT. A 404 on an image renders as nothing, not as an error,
# and staging would look "mostly fine" while lying about what production shows.
# That is the failure mode this project keeps paying for. 20 MB is cheaper than
# a staging site that is subtly wrong, and git stores the art once and reuses it
# across publishes, so repeat cost is the source only.
#
# (The two hardcoded stage.js paths are a rule-9 violation in their own right —
# a constant re-typed beside the constant that exists. Worth converging, but not
# in the same commit as a deploy mechanism.)
#
# ============================================================================
#  WHAT THIS MUST NEVER DO
# ============================================================================
# staging/ is a SECOND TREE WITH THE SAME INTERNAL LAYOUT, which is exactly the
# hazard CLAUDE.md §3 names: a relative path resolves in BOTH, so a mis-rooted
# edit opens a real file, applies cleanly, and modifies the wrong copy with every
# safety signal reporting success. So: NOBODY EDITS staging/ BY HAND. It is
# generated, only ever by this script, and the check below fails if the root game
# is missing rather than publishing an empty shell.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$SRC/staging"

for f in index.html src assets; do
  [ -e "$SRC/$f" ] || { echo "FATAL: $SRC/$f missing — refusing to publish a broken staging copy." >&2; exit 1; }
done
grep -q 'choiceSolo' "$SRC/index.html" || { echo "FATAL: root index.html has no #choiceSolo — that is not the game." >&2; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST"
for f in index.html about.html src assets sfx favicon.ico favicon.png; do
  [ -e "$SRC/$f" ] && cp -R "$SRC/$f" "$DEST/"
done

# SITE-IDENTITY FILES NEVER COME ALONG (CLAUDE.md rule 14). They are not copied
# above, and this proves it rather than trusting the list.
for f in CNAME robots.txt sitemap.xml; do
  [ -e "$DEST/$f" ] && { echo "FATAL: $f reached staging/. Remove it from the copy list." >&2; exit 1; }
done

# A staging build must SAY it is staging, or a screenshot of it is unattributable.
STAMP="$(grep -o 'PP4_STAMP = "[^"]*"' "$DEST/src/ui/stage.js" | head -1 | sed 's/.*= "//; s/"//')"
BRANCH="$(git -C "$SRC" branch --show-current)"
sed -i '' "s|const PP4_STAMP = \"$STAMP\";|const PP4_STAMP = \"$STAMP-STAGING/$BRANCH\";|" "$DEST/src/ui/stage.js"

echo "==> staging/ published"
echo "    from branch : $BRANCH"
echo "    build stamp : $STAMP-STAGING/$BRANCH"
echo "    files       : $(find "$DEST" -type f | wc -l | tr -d ' ')  ($(du -sh "$DEST" | cut -f1))"
echo "    URL         : https://playpastrypirates.com/staging/   (once this is pushed to main)"
