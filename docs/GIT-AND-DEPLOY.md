# Git, deploying, and the files that can take the live game down

The rules themselves are stated in `.claude/CLAUDE.md` §3 and §4 — short, and load-bearing enough to
live in the file every session reads. **This document is the other half: what each rule cost when it
was broken, and the detail that does not need to be in front of you every session.**

If you are here because a rule in CLAUDE.md pointed you here, read only the section it named.

---

## 1. Site-identity files never leave this repo

**The rule:** `CNAME`, `robots.txt` and `sitemap.xml` never get copied to any other repo, gist,
artifact, bucket or deploy target. Deploy to the preview site with `scripts/deploy-preview.sh` only.
Never hand-roll the sync.

### Why CNAME is not a style preference

`CNAME` contains `playpastrypirates.com`. **GitHub Pages reads that file as a *claim* on the
domain**, so a second repo containing it does not fail safe — GitHub unsets the domain on one of
them and **the live game goes down for real players**, with DNS propagation and certificate
re-issue standing between you and recovery.

### It has nearly happened twice

Two separate Claude sessions came within one command of doing this. Both were writing their own
`rsync`/`cp` to publish a preview build. **That is the pattern to distrust:** the preview repo *is*
a copy of this one, so "copy everything across" feels obviously correct, and `CNAME` is a 21-byte
file nobody notices in a 130-file diff.

`scripts/deploy-preview.sh` excludes it and re-checks the checkout before pushing, **because the
part that failed twice was the judgement of whoever ran the command** — so the protection cannot
live in judgement.

### CNAME is not the only one

`robots.txt` and `sitemap.xml` are the same hazard in different clothes. Each asserts *"this
deployment is playpastrypirates.com"*, which is false anywhere else and harmful.

The very first run of the deploy script proved it: it republished this repo's live `robots.txt`
(`Allow: /`) over the preview's `Disallow: /`, and added a sitemap of live URLs — which would have
invited Google to index the preview as duplicate content competing against the real game. Caught
only by reading the deploy diff.

All three are excluded now. **When you add a file that identifies the live site, add it to
`EXCLUDES` in the same commit.**

If you are ever copying this repo wholesale anywhere, stop and either use the script or write down
explicitly why the destination cannot contest the domain.

---

## 2. Always fetch before you read git state

**The rule:** `git fetch origin` before you read, compare, or conclude anything about a branch. Not
once per task — once per time you are about to trust what git tells you.

Both `main` and `origin/main` are **local caches**. `origin/main` is not the remote; it is this
machine's last-downloaded snapshot of it, and it is stale until you fetch.

### What it cost

On 2026-08-02 the local `main` ref was parked at a v1.0 snapshot — **457 commits behind, with no
`src/` directory at all** — because nobody had pulled after merging on GitHub. Reading it produced a
confident and completely wrong conclusion ("main is a dead v1.0 snapshot; ignore it"), which was
then handed to **four parallel sessions as instructions**. GitHub was healthy the entire time. Only
the local copy was frozen.

### Tells that you are reading a stale ref

Stop and fetch before concluding, if you see any of these:

- A diff against the base is absurdly large (hundreds of commits).
- `src/` appears as *newly added* — it has existed since the v1.1 refactor.
- A milestone you know shipped looks unfinished or absent.
- A branch appears wildly behind for no reason anyone can explain.

**Never report git state from memory or from earlier in the session.** Re-run the command. Refs
move — including because of something you did yourself.

### The second-order version: a stale checkout serves stale RULES

**A session's context copy of `.claude/CLAUDE.md` is assembled from the working tree before that
session's first `git pull`.** So a behind checkout does not merely give you stale code — it gives you
an **old rulebook**, and nothing signals it. A shorter file has no gaps in it; it just looks complete.

Measured on 2026-08-18: a session opened with local `main` **171 commits behind**. Its context held
the CLAUDE.md from `a418cb3` (2026-08-01) — **457 lines**, missing eight sections added during the
`/4` era, including "ask with the question UI", "nothing is a constant", "read the graveyard" and the
whole `/4` deploy loop. Every section it *did* have was added 2026-08-02 or earlier; every section it
lacked was added 2026-08-05 or later. A clean cut at the stale ref, not a truncation.

It surfaced only because a research agent independently diffed the on-disk file against what the
session had been given. **Do not rely on that happening.** After the first pull:

```bash
git diff --stat HEAD@{1} HEAD -- .claude/CLAUDE.md docs/
```

If anything moved, re-read it from disk before trusting your own copy.

---

## 3. Keep local main and origin/main in sync

Wyatt, 2026-08-02: *"we are going to pull origin main back down into local main after every merge so
that we can keep our local main synced."* Restated the same day as a standing rule: **always keep
main in sync with origin/main.**

### Three moments, not one

The original rule said "after every merge". That was too narrow once worktrees were retired and
commits began landing directly on `main`:

1. **At the start of any session that will read or write `main`** — fetch before you trust any ref,
   then pull if behind.
2. **Immediately after anything that changes `main`** — a merge, a direct commit, a push. Not "at
   the end."
3. **Before reporting project status.** `.planning/` lives in the repo, so an out-of-date checkout
   reports an out-of-date project.

### The work is not finished when the push succeeds

```bash
git push origin main && git pull origin main
```

Then confirm both directions are zero before saying it is done:

```bash
git rev-list --count origin/main..main   # 0
git rev-list --count main..origin/main   # 0
```

This is the same wound as §2. A merge landed through the GitHub UI does not update this clone.
Pulling immediately means the stale ref never exists, rather than being something you have to
remember to distrust later.

---

## 4. Work in the main checkout — worktrees are retired

**The only working directory is `/Users/wyattroy/Documents/Projects/pastrypirates`.** Wyatt retired
worktrees on 2026-08-02; ten stale ones were removed that day. Do not create new ones, and do not
assume the directory you woke up in is the main checkout.

### Why this is not merely tidiness

**`.planning/` is a tracked directory, so it is branch-scoped.** A worktree sitting on a stale
branch shows that branch's frozen snapshot of `STATE.md`, `ROADMAP.md` and every workstream file —
with no error and no warning. It simply reports an older project.

On 2026-08-02 a `/gsd-progress` run inside `.claude/worktrees/gsd-skill-persistence-3252ba` reported
v1.3 as **"0 of 5 phases, nothing started."** The truth on `main` was four of five phases shipped and
live. Wyatt believed he was in the main checkout and was handed a confident, entirely wrong status
report — the same failure mode as §2, one level further out.

**Before reading any `.planning/` file or answering "where are we":**

```bash
cd /Users/wyattroy/Documents/Projects/pastrypirates && git rev-parse --show-toplevel
```

**The tell that you got this wrong:** a workstream `STATE.md` reading "Not started" for work you know
shipped.

---

## 5. THE RELEASE PROCESS — how work reaches Wyatt, and then reaches players

**Two environments, one source tree. Promotion is a MERGE, never a copy.**

| environment | address | what it is |
|---|---|---|
| **staging** | `staging.playpastrypirates.com` | where Wyatt plays work-in-progress. Published from ANY branch |
| **production** | `playpastrypirates.com` | the game real players are in the middle of. It is `main`, served from the repo root, with no build step |
| *(frozen)* | `playpastrypirates.com/classic` | v1, not developed |

### The four rules everything else follows from

1. **ONE SOURCE TREE.** There is exactly one copy of the game in this repo: `index.html` + `src/`.
   Never a second folder holding "the staging version" — that is two things kept in step by memory,
   and it drifted within twelve hours the one day it existed (2026-08-27).
2. **PROMOTE THE ARTIFACT, DO NOT REBUILD IT.** Production changes because the SAME COMMITS moved
   onto `main`. Copying files at release time ships something nobody tested.
3. **ENVIRONMENTS DIFFER BY CONFIGURATION, NOT CONTENT.** Staging is the same game at a different
   address, with its own `CNAME` and a `robots.txt` that says `Disallow: /`.
4. **A RELEASE IS REVERSIBLE.** Production moved by a merge, so a bad release is undone by
   reverting that merge — not by hand-editing the live game.

> **Staging is a STAGE, not a copy.** It is not consumed by a release and no new one is created
> afterwards. It is a permanent address whose contents are replaced each time you publish to it.

### The loop

```bash
git checkout -b aug28-whatever            # 1. a dated branch (monthDD-topic)

npm test                                  # 2. the gates — expect 20, exit 0
node scripts/qa/gear.mjs                  # 3. how deep must this change be tested?
node scripts/sea_trial.mjs                # 4. sail it, at whatever gear step 3 named

./scripts/deploy-staging.sh "what changed"   # 5. -> staging.playpastrypirates.com
```

**6. Wyatt plays staging.** The build stamp must read `<stamp>-staging@<sha>` — e.g.
`Build 2026.08.27.3-staging@a24c675`. If it reads a bare stamp he is looking at production and the
publish did not land. *(The suffix was `-STAGING/<branch>` until W0-3, 2026-08-27: he asked for a
shorter stamp, the sha stayed because it is what makes it a build identity, and the branch name
moved to the deploy log.)*

**7. On his approval — and only then:**

```bash
git checkout main && git merge aug28-whatever
git push origin main && git pull origin main
git rev-list --count origin/main..main    # 0
git rev-list --count main..origin/main    # 0
```

**8. Verify production actually moved.** Never assume; Pages takes a minute or two:

```bash
curl -s https://playpastrypirates.com/src/ui/stage.js | grep -o 'PP4_STAMP = "[^"]*"'
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/classic/    # 200
```

**The tell that a session skipped this: he reports an old build stamp.** It is never a cache —
there is no build step. If he cannot see it, it is not on `main`.

### Why the stamp matters more than it looks

`deploy-staging.sh` rewrites `PP4_STAMP` to `<stamp>-staging@<sha>` **on the published copy, not
the source**. On 2026-08-27 it did not, and staging served DIFFERENT CODE under a stamp IDENTICAL to
production — worse than no stamp, because the one tell Wyatt uses to know which build he is looking
at was actively lying. The script now refuses to publish at all if it cannot stamp the build.

### The checks that make this durable — and why each exists

**One cutover broke SIX instruments and not one of them said so.** A path is a claim about the
world, written once, that nothing re-checks. These re-check them, and every one is red-proofed:

| gate | the claim it re-checks | what it would have caught |
|---|---|---|
| `scripts/tree_health_check.js` | every gate the chain names exists; every static import resolves; no path is built into a directory that is gone | `sea_trial.mjs` reading `4/src/ui/stage.js`; a moved script importing one level above the repo |
| `scripts/game_url_check.js` | the browser fleet points at a page that actually contains the game | the whole fleet loading a **directory listing** at `/4/` — HTTP 200, no game |
| `scripts/doc_command_check.js` | every `node …` command and every link in every doc exists | 35 lines of docs telling sessions to edit deleted files |
| `scripts/gate_count_check.js` | the gates declared equal the gates run | a gate added or dropped without anyone noticing |
| `scripts/qa/gear.mjs` + `.claude/hooks/qa-gear-first.cjs` | what counts as game code, by EXCLUSION so a new directory is strict by default | the picker reporting `GEAR: NONE` for every change to the live game |

**The shared lesson, and it is the reusable one:** *a hand-kept list of what to guard rots exactly
like the thing it guards.* Every one of these derives its answer — from `.gitignore`, from the
directory listing, from `package.json`'s own chain — rather than from a list somebody typed.

### Where staging lives, and the one thing only Wyatt can do

Staging is a **separate repository**, `wyattroy/pastrypirates-staging`, because **GitHub Pages
serves one branch per repo at one domain** — pointing this repo's Pages at a staging branch would
take production down. It owns its own `CNAME` naming the SUBDOMAIN.

**That is safe, and the reasoning is not optional:** rule 14 is about two repos claiming ONE
hostname. `staging.playpastrypirates.com` and `playpastrypirates.com` are different hostnames.
`deploy-staging.sh`'s guard enforces exactly that — staging's CNAME must name the staging host, must
never name the production host, and must not be missing.

DNS lives at **Squarespace**: `CNAME` · host `staging` · value `wyattroy.github.io`.

## 6. Absolute paths, always — the two-trees hazard

The Bash tool's working directory resets, and announces it at the bottom of unrelated output.

**The repo contains more than one tree with an identical internal layout.** During the v2 era that
was `v2/`, `v2bakeoff/`, `3/` and `4/` all mirroring the root's `src/ui/util.js` shape; after the
cutover it will be the root and `/classic`. Either way, a relative path like `src/ui/util.js`
resolves in **both** trees — so a mis-rooted edit opens a real file, applies cleanly, passes
`node --check`, and modifies the wrong copy. **Every safety signal reports success.**

Run the constraint as a command after each batch of edits, naming whichever tree you are *not*
supposed to be touching:

```bash
git diff --name-only | grep -v '^4/'   # must print NOTHING when working in 4/
```

Full account: `docs/HARD-WON-LESSONS.md` §1.

---

## 7. Running a session in the CLOUD (claude.ai/code) — the recipe, and what is proven

Wyatt, 2026-08-21: *"the work should not be gated on my laptop"* — cloud sessions share the same
usage pool, keep running when the laptop closes, and are steerable from his phone with no 15-minute
remote-control timeout (§5 of CLAUDE.md's rule 4). **His laptop remains the place for HIS play and
anything Safari-specific; nothing in the cloud can reach his browser.**

### What carries over and what does not

| | Cloud has it | Why / what to do |
|---|---|---|
| `.claude/CLAUDE.md`, hooks, `docs/`, `.planning/` | **yes** — they are in the repo | nothing to do |
| GSD tools, workflows, agents | **yes, since 2026-08-21** — installed project-locally under `.claude/` (`gsd-core/`, `agents/`, `commands/`), **pinned to the same version the laptop runs** (`cat .claude/gsd-core/VERSION`) | a laptop/global install and this local one must move together — upgrade both in one commit, never one |
| GSD's own hooks (update check, context monitor, prompt guard, …) | **no** — the installer wires them into the untracked `settings.local.json`, with this Mac's node path | convenience only; no workflow depends on them. A cloud session that wants them runs `npx -y @opengsd/gsd-core@1.8.0 --claude --local` once — it rewrites identical tracked files and wires its own hooks. **Do not move them into the tracked `settings.json`**: they would run twice on the laptop (global + project) and carry a Mac-only path |
| `~/.claude/` memory notes | **no** — a cloud sandbox has no `~/.claude` from the laptop | every rule that lived only there is restated in `docs/HARD-WON-LESSONS.md` §8 |
| `.claude/settings.local.json` (permissions) | **no** — untracked, per-machine | the cloud has its own permission model; expect prompts |
| Chrome MCP / his Chrome, iOS simulator, Finder | **no** | all laptop-only tools |
| Safari | **no** | his laptop is the only Safari |

### Environment facts (checked against the docs 2026-08-21 — re-verify if the platform changes)

Ubuntu 24.04, Node 20–22, Python 3, chromedriver pre-installed (so a Chrome/Chromium binary is on
the image), 4 vCPU / 16 GB. **Network defaults to "Trusted" (an allow-list).** GitHub push goes
through the platform's proxy — no local keys.

### Network: the EXACT hosts, read from the code (2026-08-21)

**Essential — multiplayer cannot work without these two:**

```
www.gstatic.com
*.firebaseio.com
```

- `www.gstatic.com` — the Firebase SDK is two `<script>` tags in `index.html`
  (`firebase-app-compat.js` and `firebase-database-compat.js`, v12.15.0). Blocked, Firebase never
  loads and Host/Join do nothing at all.
- `*.firebaseio.com` — the database is `pastry-pirates-default-rtdb.firebaseio.com`
  (`src/net/index.js`). **The wildcard matters:** the Realtime Database redirects clients onto
  regional shard hosts (`s-usc1c-nss-####.firebaseio.com`), so an exact-host allowlist connects and
  then dies on the redirect — indistinguishable, from the seat, from "multiplayer is broken".

**Worth adding:** `*.googleapis.com` — `firebase-app` pings installations/config on init.

**For the rest of the loop, not multiplayer itself:** `playpastrypirates.com` (the live-stamp
check), `github.com` (push), `registry.npmjs.org` (npx/npm).

**NOT needed:** the config also carries `pastry-pirates.firebaseapp.com` (auth) and
`pastry-pirates.firebasestorage.app` (storage). The game calls neither.

**If the UI has no wildcards, set the network to Full.** A partial allowlist fails SILENTLY, which
is the worst possible failure mode for a QA run.

### Why this matters: a crew game and the live-stamp check fail silently without it

`4/` loads Firebase from Google's CDN and talks to the Realtime Database; the deploy loop `curl`s
the live domain to confirm a stamp. Under the default allow-list all of that fails **quietly** — a
guest that never joins looks exactly like a multiplayer bug, and a stamp check that cannot reach the
domain looks exactly like a build that did not land. Either set the session's network to **Full**,
or allow at least: `*.firebaseio.com`, `*.googleapis.com`, `*.gstatic.com`, `playpastrypirates.com`,
`github.com`, `registry.npmjs.org`.

**After ANY reinstall or upgrade of the local GSD, re-run this** — the installer writes the installing
machine's ABSOLUTE path into every command's `@file` reference (61 of 71 files on 2026-08-21), which
no other clone can resolve:

```bash
grep -rl "$PWD" .claude/commands .claude/agents .claude/gsd-core | xargs sed -i '' "s#$PWD/##g"   # GNU sed: drop the ''
```

### Setup script

Nothing beyond a clone — there is no build step and no `package-lock.json`, so no `npm ci`. The
root `npm test` and every `scripts/*_check.js` gate run on bare Node.

### Browser QA in the cloud

`scripts/mouse_qa.mjs` and `scripts/mp_rig.mjs` resolve Chrome from `$CHROME_BIN`, then the
PATH (`google-chrome`, `chromium`, `chromium-browser`), then the Mac bundle; on Linux they add
`--no-sandbox --disable-dev-shm-usage` (a container running as root cannot use Chrome's SUID
sandbox, and `/dev/shm` is tiny). The repo root is derived from the script's own location. Usage
is unchanged: `node scripts/mouse_qa.mjs <outdir> <W> <H> <port> <dbgport>`.

### WHAT A CLOUD CTO RUN FOUND, 2026-08-27 — seven things that only fail in a container

> **THE THREE HOSTS TO ADD TO THE ENVIRONMENT'S ALLOWLIST**, if cloud QA is ever to be complete:
>
> ```
> cdn.playwright.dev
> playwright.download.prss.microsoft.com
> staging.playpastrypirates.com
> ```
>
> The first two make the Safari-family sea-trial legs installable; the third lets a cloud session
> verify its own staging publish instead of taking it on trust. Set at
> **claude.ai/code → environment selector → settings icon → Network access → Custom → Allowed
> domains**, and **tick "Also include default list of common package managers"** — Custom REPLACES
> the Trusted list otherwise, which would cut off npm and the package registries.

Run from `claude/cloud-handoff-planning-a9ay1u` while Wyatt was away. Every one of these was
MEASURED here, and every one is invisible from a Mac. **THREE of them were in the same command** —
`deploy-staging.sh`, the CTO's only way to hand him anything — and it published successfully only
after all three were fixed.

| | what happens | status |
|---|---|---|
| ~~**WebKit cannot be installed**~~ **RESOLVED 2026-08-27 by Wyatt allowlisting the two hosts.** WebKit 26.5 downloads (102 MB), `npx playwright install-deps webkit` pulls the Linux libraries, and it **LAUNCHES — verified, not assumed**. Both `-wk` legs are runnable in a container for the first time. | Two gotchas for the next session: the browser lands in **`$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`)**, set by this repo's own session hook — NOT in `~/.cache/ms-playwright`, so "it isn't there" is usually a wrong place to look. And the install fails at `validateDependenciesLinux` until `install-deps` has run; that failure comes AFTER a successful 102 MB download, so read past the stack trace before concluding the download was blocked. | **STILL NOT SAFARI.** Playwright WebKit is the same engine family, a different build. Wyatt's own phone remains the only real Safari this project has, and no report may say "Safari passed". |
| **`gh` is not installed IN THE CONTAINER** — it IS on Wyatt's Mac, which is why this never showed up before | `deploy-staging.sh` cloned the staging repo with `gh repo clone`, so the CTO's only publishing route died on its first command. Measured in the container: `command -v gh` is empty and `/usr/bin/gh`, `/usr/local/bin/gh` and `/opt/gh` do not exist. Plain HTTPS `git` *does* reach `wyattroy/pastrypirates-staging` through the session proxy. | **FIXED** — the script feature-detects `gh` and falls back to `git clone`. Only the checkout changes; the rsync, the EXCLUDES and every CNAME guard are untouched. |
| **`rsync` is not installed** | `deploy-staging.sh` syncs the tree with rsync. Third blocker in the same command, after `gh` and `sed`. | **FIXED by installing the real tool** — `apt-get install -y rsync` works in the container. **DO NOT substitute `cp -r` or a hand-rolled copy.** rsync's `--exclude` list is what keeps `CNAME`, `robots.txt` and `sitemap.xml` out of the staging repo, and hand-rolling that sync is the exact move that twice came within one command of taking the live game down. |
| **`sed -i ''` is BSD-only** | Two sites in `deploy-staging.sh`. GNU sed reads the empty string as the SCRIPT and the real script as a FILENAME: `sed: can't read s\|hello\|bye\|`. It could not stamp a build. | **FIXED** — feature-detected (`sed --version` answers on GNU, not BSD). |
| ~~**A cloud CTO can publish but cannot check its own publish**~~ **RESOLVED 2026-08-27.** GitHub had never issued the certificate for the subdomain — the repo was built the night before in a commit whose own title says *"subdomain built and blocked on DNS"*, and it stayed blocked. Wyatt cleared the Custom domain in **`wyattroy/pastrypirates-staging`** → Settings → Pages, re-entered it, and the certificate issued; **Enforce HTTPS** is now on. VERIFIED from a container: `https://staging.playpastrypirates.com/` → **200**, serving `2026.08.27.3-staging@c9ce605e` under the `[STAGING]` title, with production still on `2026-08-26k-CUTOVER`. | **THE DIAGNOSIS IS THE REUSABLE PART, because it looked like a network fault for two days.** `http://` is refused by the egress proxy no matter what is allowlisted; `https://` was ALLOWED all along (`200 Connection Established`) and then died after the tunnel with no HTTP status. **The proxy re-terminates TLS, so the certificate `curl` validates is the PROXY's** — a clean handshake says nothing about the origin, and "tunnel opens, then silence" is what a certificate-less origin looks like from behind one. DNS was never at fault. **⚠️ AND THE NEAR-MISS WORTH MORE THAN THE FIX:** the instruction "go to the staging repo's Settings → Pages" was followed on **`wyattroy/pastrypirates`** — production — where the same **Remove** button would have unset the live domain and **taken the game down for real players**. He asked before clicking. **Name the full URL, never "the staging repo".** |
| **The container's local `main` is stale** | A fresh container clone left local `main` 50 commits ahead / 70 behind `origin/main` on an old lineage. `cto_supervise.mjs` correctly reports **NEEDS ATTENTION — something committed to main locally**, which in a container is a **false alarm**. | Fix it, do not chase it: confirm the extra commits exist on some remote branch, then `git branch -f main origin/main`. The supervisor goes green. |
| **`pkill -f chromium` kills your own shell, and the browsers are not called `chromium`** | Every Bash call runs under a wrapper that exports `CHROME_BIN=/usr/local/bin/chromium`, so `-f` matches the killing shell — the symptom is empty output and a strange exit code with the browsers still alive. And `/usr/local/bin/chromium` is a wrapper: the real processes are named **`chrome`**, so `pgrep -x chromium` reported **0 while ten live chrome processes were burning CPU**. | Match the process NAME and cover both: `pkill -9 -x chrome; pkill -9 -x chromium; pkill -9 -x headless_shell`. **A cleanup check that cannot see its subject reads exactly like a clean machine** — rule 17's whole point. |

### THE PROOF — RAN 2026-08-21, all four items passed.

Run by the first cloud session, branch `claude/pastry-pirates-cloud-qa-a9jkeg`. Item 3 passed only
after a two-part browser TLS fix — **now applied AUTOMATICALLY at session start** by
`.claude/hooks/cloud-session-start.sh` (a SessionStart hook in `.claude/settings.json`, added
2026-08-21 at Wyatt's ask: *"I want this to work, now and always"*). It no-ops on the laptop
(`CLAUDE_CODE_REMOTE` guard), is idempotent, and installs the fixed browser as `chromium` on PATH
so `scripts/lib/chrome.mjs` resolves it with no env var. The manual recipe stays below as the
fallback if the hook ever reports "skipped" — and as the record of what the fix IS.

1. **Project-local GSD works.** `node .claude/gsd-core/bin/gsd-tools.cjs validate health` ran —
   known-noise W019s only. Also verified: `state get`, `progress` and the full command list all
   respond; **zero laptop-absolute paths** remain in `.claude/commands`, `.claude/agents`,
   `.claude/gsd-core`; GSD **1.8.0 project-local**.
2. **Solo mouse-QA at 1400×900, past the bar.** `node scripts/mouse_qa.mjs <out> 1400 900 8611
   9611` — the bar was Day 6; the run played a full voyage to the end-of-voyage card at **Day 14**:
   1158 ticks, 72 real-mouse actions, 115 screenshots, **0 findings, 0 console errors**. The
   screenshots were verified readable by eye (the Day-1 board and the end-of-voyage card).
3. **Two-Chrome crew game via `mp_rig.mjs` — passed, after the environment fix below.** Host
   created real Firebase room **AGHR**, guest joined; both sides screenshotted and compared —
   rosters identical, each side's own seat highlighted, host showing "Start the voyage!" against
   the guest's "Waiting for the host…". Room torn down, processes killed.
4. **The live stamp reads.** *(Run on 2026-08-21, when the game was still at `/4/`; the same
   check today is `curl -s https://playpastrypirates.com/src/ui/stage.js`.)* `curl -s https://playpastrypirates.com/4/src/ui/stage.js | grep
   PP4_STAMP` returned **`2026-08-21g`**, the live stamp.

Also proven: the root `npm test` and all eight `4/scripts` static gates pass on bare Node in the
container, and the repo's `.claude/hooks` (read-the-doc-first) fire correctly in the cloud.

#### The environment fix — automatic via the SessionStart hook; manual fallback below

Without it, item 3 fails **exactly as this section's own "fails SILENTLY" warning predicts**: the
Firebase SDK never loads and a Host click produces **no room code at all**. The cloud container
routes HTTPS through Anthropic's TLS-inspecting egress proxy; `curl` works out of the box,
**Chromium does not, for two separate reasons**, both fixable in-container:

**(a) Chromium's cert store does not trust the proxy.** Install `libnss3-tools`, split
`/root/.ccr/ca-bundle.crt` into one file per certificate, and import each into
`sql:$HOME/.pki/nssdb` — the load-bearing certs are the Anthropic egress-gateway CAs:

```bash
apt-get update && apt-get install -y libnss3-tools
mkdir -p "$HOME/.pki/nssdb"
csplit -s -z -f /tmp/ccr-ca- /root/.ccr/ca-bundle.crt '/-----BEGIN CERTIFICATE-----/' '{*}'
for c in /tmp/ccr-ca-*; do
  certutil -A -n "ccr-$(basename "$c")" -t "C,," -i "$c" -d sql:$HOME/.pki/nssdb
done
```

**(b) The gateway RESETS Chromium's TLS 1.3 ClientHello mid-handshake** (net_error **-101**;
curl's TLS 1.3 passes; feature-flag disables for ML-KEM/ECH did not help). Workaround: launch
Chromium with `--ssl-version-max=tls1.2` — **TLS verification stays ON.** Cleanest as a two-line
wrapper exported via `CHROME_BIN` (the scripts' resolver honors it):

```bash
printf '#!/bin/sh\nexec /opt/pw-browsers/chromium --ssl-version-max=tls1.2 "$@"\n' > /tmp/chromium-tls12
chmod +x /tmp/chromium-tls12
export CHROME_BIN=/tmp/chromium-tls12
```

- **The real binary is `/opt/pw-browsers/chromium`** (a symlink to
  `chromium-1194/chrome-linux/chrome`); the image ships nothing matching on PATH. The hook fixes
  that by installing the wrapper as `/usr/local/bin/chromium` — so `CHROME_BIN` only needs setting
  when running WITHOUT the hook.
- **The network policy itself needed nothing**: gstatic, `*.firebaseio.com`, googleapis,
  `playpastrypirates.com`, and GitHub push were all reachable through the proxy.

The boundary that stands: the cloud is proven QA-capable for solo and crew browser QA — **Safari
and Wyatt's own play remain laptop-only**, as the top of this section already says.

---

## COMMIT MESSAGES: `-F -` AND A HEREDOC. NEVER `-m "…"`.

**This repo's commit messages are long, quote Wyatt, and cite code — so they are full of the three
characters that break a double-quoted shell argument: backticks, double quotes, and `$`.** On
2026-08-31 that cost **five** failed commits in one session, each one a mangled message or a shell
error like `step: command not found`, and each one re-typed by hand.

**The rule is about DOUBLE QUOTES, not about length.** A message short enough to look safe is
exactly the one that gets `-m "…"` and then contains a backtick.

```bash
git commit -F - <<'MSG'
subject line

Body with `backticks`, "quotes", $variables and 'apostrophes' — all literal,
because the heredoc delimiter is QUOTED ('MSG'). Nothing is interpolated.
MSG
```

**Two details that matter, both learned the hard way:**

- **Quote the delimiter — `<<'MSG'`, not `<<MSG`.** Unquoted, the shell still expands `$` and
  backticks inside the body, which is the whole failure again wearing a heredoc's clothes.
- **`-F -` reads the message from stdin.** `git commit -m "$(cat <<'MSG' … MSG)"` also works and is
  what several commits here used, but it puts the text back through a double-quoted expansion on
  its way to `-m`, so it only survives by luck. Prefer `-F -`.

**The same trap applies to any long text going through a shell argument** — `gh pr create --body`,
`--note`, an `echo` into a file. When the text contains prose, write it to a file or a heredoc and
point the flag at that.
