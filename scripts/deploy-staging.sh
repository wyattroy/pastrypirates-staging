#!/usr/bin/env bash
#
# Publish the current working tree to STAGING — staging.playpastrypirates.com.
#
#   scripts/deploy-staging.sh "commit message"
#
# ============================================================================
#  WHY THIS SCRIPT EXISTS — read before "simplifying" it
# ============================================================================
#
# Two separate Claude sessions have now come within one command of publishing
# this repo's CNAME file into the staging repo. Both were hand-rolling an
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
# the staging repo IS a copy of this repo, so "copy everything across" is the
# obvious instinct, and CNAME is a 21-byte file nobody scrolls to in a
# 130-file diff.
#
# So the rule is mechanical, not remembered: DO NOT hand-roll this sync.
# Use this script. It refuses to copy CNAME, and it verifies afterwards that
# no CNAME reached the checkout — belt and braces, because the whole point is
# that the human/model doing the deploy is the part that failed twice.
#
set -euo pipefail

STAGING_REPO="wyattroy/pastrypirates-staging"
PROD_HOST="playpastrypirates.com"
STAGING_HOST="staging.playpastrypirates.com"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MSG="${1:-Update staging}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# SITE-IDENTITY FILES. None of these ever leave this repo: each one tells the outside world
# "this deployment is playpastrypirates.com", which is a lie on the preview and an actively
# harmful one. rsync protects --exclude'd paths from --delete, so the preview keeps its OWN
# versions of these rather than losing them.
#
# robots.txt/sitemap.xml were added after the first real run of this script republished them:
# the preview carries `Disallow: /` to stay out of search, and this repo's copy says `Allow: /`
# plus a sitemap pointing at the live domain. Copying them across would have invited Google to
# index the preview as duplicate content competing with the real game — the same failure as
# CNAME wearing different clothes, and it went unnoticed until the deploy diff was read.
#
# ============================================================================
#  THE SECOND HALF OF THE EXCLUDES IS DERIVED, NOT TYPED — added 2026-08-26
# ============================================================================
# This list was hand-kept, written 2026-08-02, and by 2026-08-26 it had rotted
# into a live hazard: the QA runs that landed after it produced
#   seed-drill-shots  4.1G
#   sea-trial-shots   3.1G
#   crew-phone-shots  546M
#   mp-rig-shots      6.5M
# — 7.7 GB of probe screenshots, every one of them ALREADY in .gitignore and
# none of them in this list. rsync copies the WORKING TREE, not the index, so
# `.gitignore` does not protect a preview deploy. Running this script that day
# would have pushed 7.7 GB into the staging repo.
#
# That is the same shape as the two faults found the same day (a doc-check
# scanning a hand-kept list of five files; a profile ignore listing three of
# seven names): A HAND-KEPT LIST OF WHAT TO EXCLUDE ROTS EXACTLY LIKE THE THING
# IT GUARDS, AND NOTHING SAYS SO. So the transient-output half is now derived
# from .gitignore itself — one place says what is junk, and this follows it.
#
# WHAT IS NOT DERIVED, AND MUST NEVER BE. The site-identity files and the
# tracked directories below are excluded EXPLICITLY, because they are NOT in
# .gitignore and never will be: CNAME/robots.txt/sitemap.xml are tracked on
# purpose (they identify the live site), and .planning/, .claude/ and
# art-review/ are tracked on purpose too. Deriving these away would be the
# outage this script exists to prevent.
EXCLUDES=(
  --exclude=CNAME          # ← THE ONE THAT MATTERS. See the header.
  --exclude=robots.txt     # preview must stay Disallow:/ — do not publish the live Allow:/
  --exclude=sitemap.xml    # lists playpastrypirates.com URLs; meaningless on the preview
  --exclude=.git/
  --exclude=.planning/
  --exclude=.claude/
  --exclude=art-review/
  --exclude=notes/
  --exclude=node_modules/
  --exclude=.DS_Store
)

# Everything .gitignore calls junk is junk here too. Comments and blank lines
# dropped; negations (!foo) skipped rather than mis-translated, because rsync's
# include/exclude ordering is not git's and a wrong guess here is silent.
while IFS= read -r pat; do
  case "$pat" in
    ''|'#'*|'!'*) continue ;;
  esac
  EXCLUDES+=( "--exclude=$pat" )
done < "$SRC/.gitignore"

echo "    excludes: ${#EXCLUDES[@]} (3 site-identity + tracked dirs + everything .gitignore lists)"

echo "==> staging deploy: $STAGING_REPO"
[ -f "$SRC/CNAME" ] && echo "    (this repo owns CNAME -> $(cat "$SRC/CNAME") — it will NOT be copied)"

git -C "$SRC" diff --quiet || echo "    note: working tree has uncommitted changes; deploying them as-is"

# GET THE STAGING CHECKOUT. `gh` when it exists, plain git when it does not.
# The CLOUD CONTAINER HAS NO `gh` (measured 2026-08-27) — so this line, which is the CTO's only
# route to publishing anything, failed on the only platform the CTO runs on. Plain HTTPS git does
# reach the repo there, through the session's authenticated proxy.
# THIS IS NOT HAND-ROLLING THE SYNC, and the difference matters: only the way the CHECKOUT is
# fetched changes. The rsync, the EXCLUDES, and every CNAME guard below are untouched — they are
# the parts that stop a preview deploy taking the live game down, and nothing here goes near them.
if command -v gh >/dev/null 2>&1; then
  gh repo clone "$STAGING_REPO" "$WORK/staging" -- -q
else
  echo "    no gh — cloning over https"
  git clone -q "https://github.com/$STAGING_REPO" "$WORK/staging"
fi
rsync -a --delete "${EXCLUDES[@]}" "$SRC/" "$WORK/staging/"

# --- THE GUARD. Never remove; this is the whole reason the script exists. ---
#
# IT CHANGED SHAPE ON 2026-08-26 AND THE REASON MATTERS. It used to be "a CNAME
# here at all is fatal", which was correct while the destination was an anonymous
# github.io preview owning no domain. Staging now HAS a domain, so it legitimately
# owns a CNAME — and the old guard would have refused every deploy forever.
#
# The danger was never "a CNAME exists". It is "THIS repo's CNAME reached the
# other repo", because two repos claiming ONE hostname makes GitHub unset the
# domain on one of them and the LIVE game goes down for real players. A SUBDOMAIN
# is a different hostname and does not contest the apex. So the guard now checks
# CONTENT: staging's CNAME must say the staging host and must never say the
# production host.
#
# rsync --exclude=CNAME already protects the destination's own file from --delete,
# so staging keeps its CNAME across every deploy. This verifies that it did.
if [ ! -e "$WORK/staging/CNAME" ]; then
  echo "FATAL: staging has no CNAME. It should contain $STAGING_HOST." >&2
  echo "       Without it GitHub serves staging at wyattroy.github.io and the" >&2
  echo "       custom domain silently stops working. Restore it; do not proceed." >&2
  exit 1
fi
GOT="$(tr -d '[:space:]' < "$WORK/staging/CNAME")"
if [ "$GOT" = "$PROD_HOST" ]; then
  echo "FATAL: staging's CNAME says '$PROD_HOST' — the PRODUCTION host." >&2
  echo "       Publishing this contests the live domain and can take the game" >&2
  echo "       offline for real players. This is the exact outage this script" >&2
  echo "       exists to prevent. Refusing to push." >&2
  exit 1
fi
if [ "$GOT" != "$STAGING_HOST" ]; then
  echo "FATAL: staging's CNAME says '$GOT', expected '$STAGING_HOST'." >&2
  echo "       Refusing to push something nobody intended." >&2
  exit 1
fi
echo "    guard passed: staging CNAME is '$GOT' (not the production host)"

# A STAGING BUILD MUST SAY IT IS STAGING, and this publisher forgot for a day.
# The retired /staging PATH publisher rewrote PP4_STAMP to <stamp>-STAGING/<branch>
# for exactly this reason — "a screenshot of staging can never be mistaken for
# production" — and THIS script, the one that publishes the real subdomain, shipped
# the stamp untouched. So on 2026-08-27
# staging.playpastrypirates.com served DIFFERENT CODE under an IDENTICAL stamp to
# production, which is worse than no stamp at all: the one tell Wyatt relies on to
# know which build he is looking at was actively lying.
# Stamped on the COPY, never the source, so the working tree stays clean.
# IN-PLACE sed, ON BOTH PLATFORMS. The BSD/macOS form needs an empty backup suffix as a separate
# argument; GNU sed (every Linux box, and every cloud container this project now runs in) reads
# that empty string as the SCRIPT and the real script as a FILENAME, and dies. Found 2026-08-27
# from a cloud session, where this script — the CTO's only sanctioned output channel — could not
# have published anything at all.
# Feature-detected, never guessed from `uname`: GNU sed answers --version, BSD sed does not.
if sed --version >/dev/null 2>&1; then sed_i(){ sed -i "$@"; }
else                                  sed_i(){ sed -i '' "$@"; }; fi

STAMPFILE="$WORK/staging/src/ui/stage.js"
if [ -f "$STAMPFILE" ]; then
  STAMP="$(grep -o 'PP4_STAMP = "[^"]*"' "$STAMPFILE" | head -1 | sed 's/.*= "//; s/"//')"
  BRANCH="$(git -C "$SRC" branch --show-current)"
  # ...AND THE COMMIT, because the branch name alone is not a build identity. Caught 2026-08-27:
  # staging carried the bake-off fix but NOT the End of Voyage footer, and its stamp was byte
  # identical to the build that had both — the branch had advanced and the stamp had not. Wyatt
  # would have played a stale build with no tell. The short SHA changes with every commit, so a
  # screenshot now names the exact build it came from.
  SHA="$(git -C "$SRC" rev-parse --short HEAD)"
  case "$STAMP" in
  # W0-3 (Wyatt, 2026-08-27): "staging appends -staging". The old suffix `-STAGING/<branch>@<sha>`
  # made the very stamp he asked to SHORTEN the longest thing on the line. The short SHA STAYS —
  # it was added this morning because staging once served different code under a stamp
  # byte-identical to production's, and he would have played a stale build with no tell. The
  # BRANCH name is what leaves the SCREEN; the deploy log below still prints it, so the log keeps
  # the full identity while the ☰ menu keeps the short one.
    *-staging@*) echo "    stamp already marked: $STAMP" ;;
    *) sed_i "s|const PP4_STAMP = \"$STAMP\";|const PP4_STAMP = \"$STAMP-staging@$SHA\";|" "$STAMPFILE"
       echo "    stamped: $STAMP-staging@$SHA   (from branch $BRANCH)" ;;
  esac
else
  echo "FATAL: $STAMPFILE missing — refusing to publish an unstampable staging build." >&2
  exit 1
fi

# THE BROWSER TAB SAYS STAGING TOO — because the build stamp lives in the ☰ menu, and on
# 2026-08-27 Wyatt played PRODUCTION for a while believing it was staging. The cause was not
# carelessness: typing a bare domain makes a modern browser try https://, staging has no
# certificate yet, that fails, and he lands back on his production bookmark. A tell that requires
# opening a menu is a tell that gets skipped.
#
# DELIBERATELY THE TITLE AND NOTHING ELSE. A banner ON the page was considered and rejected: the
# entire value of staging is being IDENTICAL to production, and an overlay could itself produce a
# false finding ("something is covering the board") — testing a game that differs from the one
# that ships is the failure this whole tier exists to prevent. The tab is outside the game.
INDEX="$WORK/staging/index.html"
if [ -f "$INDEX" ]; then
  if grep -q "<title>\[STAGING\]" "$INDEX"; then
    echo "    title already marked"
  else
    sed_i 's|<title>|<title>[STAGING] |' "$INDEX"
    echo "    tab title: $(grep -o '<title>[^<]*</title>' "$INDEX" | head -1)"
  fi
fi

cd "$WORK/staging"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "==> nothing changed; not pushing."
  exit 0
fi
git add -A
git status --short | sed 's/^/    /'
git commit -q -m "$MSG"
git push -q origin HEAD:main
echo "==> pushed. https://$STAGING_HOST/"
echo "    (GitHub Pages takes a minute or two to rebuild.)"
