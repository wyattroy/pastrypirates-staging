#!/usr/bin/env bash
#
# Deploy the current working tree to the TEMPORARY preview site.
#
#   scripts/deploy-preview.sh "commit message"
#
# ============================================================================
#  WHY THIS SCRIPT EXISTS — read before "simplifying" it
# ============================================================================
#
# Two separate Claude sessions have now come within one command of publishing
# this repo's CNAME file into the preview repo. Both were hand-rolling an
# rsync. The second one caught it only because `git status` was read carefully
# before pushing; there was nothing stopping it.
#
# WHAT WOULD HAVE HAPPENED. CNAME contains `playpastrypirates.com`. GitHub
# Pages treats a CNAME file as a claim on that custom domain. Two repositories
# claiming one domain does not "merge" or "fail safe" — GitHub unsets the
# domain on the loser, and the LIVE GAME goes down for real players. Recovery
# means re-adding the domain and waiting on DNS/certificate re-issue, which is
# not instant. This is a production outage caused by a preview deploy.
#
# It is an easy mistake precisely because everything about it looks right:
# the preview repo IS a copy of this repo, so "copy everything across" is the
# obvious instinct, and CNAME is a 21-byte file nobody scrolls to in a
# 130-file diff.
#
# So the rule is mechanical, not remembered: DO NOT hand-roll this sync.
# Use this script. It refuses to copy CNAME, and it verifies afterwards that
# no CNAME reached the checkout — belt and braces, because the whole point is
# that the human/model doing the deploy is the part that failed twice.
#
set -euo pipefail

PREVIEW_REPO="wyattroy/pastrypirates-v13-preview"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MSG="${1:-Update preview}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Never leaves this repo. CNAME is first and is the reason for the file.
EXCLUDES=(
  --exclude=CNAME          # ← THE ONE THAT MATTERS. See the header.
  --exclude=.git/
  --exclude=.planning/
  --exclude=.claude/
  --exclude=art-review/
  --exclude=notes/
  --exclude=node_modules/
  --exclude=.DS_Store
)

echo "==> preview deploy: $PREVIEW_REPO"
[ -f "$SRC/CNAME" ] && echo "    (this repo owns CNAME -> $(cat "$SRC/CNAME") — it will NOT be copied)"

git -C "$SRC" diff --quiet || echo "    note: working tree has uncommitted changes; deploying them as-is"

gh repo clone "$PREVIEW_REPO" "$WORK/preview" -- -q
rsync -a --delete "${EXCLUDES[@]}" "$SRC/" "$WORK/preview/"

# --- the guard. Never remove; this is the whole reason the script exists. ---
if [ -e "$WORK/preview/CNAME" ]; then
  echo "FATAL: a CNAME reached the preview checkout." >&2
  echo "       Publishing it would contest playpastrypirates.com and can take" >&2
  echo "       the LIVE game offline. Refusing to push. Fix the excludes." >&2
  exit 1
fi
if git -C "$WORK/preview" ls-files --error-unmatch CNAME >/dev/null 2>&1; then
  echo "FATAL: CNAME is tracked in the preview repo already — remove it there first." >&2
  exit 1
fi
echo "    guard passed: no CNAME in the preview checkout"

cd "$WORK/preview"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "==> nothing changed; not pushing."
  exit 0
fi
git add -A
git status --short | sed 's/^/    /'
git commit -q -m "$MSG"
git push -q origin HEAD:main
echo "==> pushed. https://wyattroy.github.io/pastrypirates-v13-preview/"
echo "    (GitHub Pages takes a minute or two to rebuild.)"
