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

## 5. How the work reaches Wyatt's phone

Wyatt, 2026-08-14: *"The design we have been using is that playpastrypirates.com continues serving
its normal version; but playpastrypirates.com/4 is serving the version that we are working on."*

He asked for this to be written down so he never has to explain it to a new session again.

### The shape of it

`playpastrypirates.com` is GitHub Pages serving **`main`, from the repo root, with no build step and
no deploy workflow.** What is on `main` *is* what is live — there is nothing in between.

| URL | Served from | What it is |
|---|---|---|
| `playpastrypirates.com` | repo root (`index.html`, `src/`) | **the game under development AND the game real players play — the same files** |
| `playpastrypirates.com/classic` | `classic/` | v1, frozen |

> ### ⚠ THE CUTOVER (2026-08-26) INVERTED WHAT THIS SECTION USED TO SAY
>
> The old table had `/4` as a separate milestone tree, and the paragraph under it read: *"Merging
> does not touch the root game, because the root game is different files. Do not treat a merge to
> `main` as a scary outward-facing act requiring ceremony."*
>
> **That reassurance was load-bearing on the two-tree layout, and the two-tree layout is gone.**
> `4/` was promoted to the root; there is no separate development copy any more. Every push to
> `main` is served to real players immediately, because there is no build step between `main` and
> the domain.
>
> This section carried its own instruction to be updated in the cutover commit. **It was not**, and
> it sat wrong for the rest of the day — including telling sessions to bump `PP4_STAMP` in
> `4/src/ui/stage.js`, which the cutover deleted. A doc that tells you to edit a file that does not
> exist is the same failure as a gate pointed at the wrong tree: not silent, *reassuring*.

**Pushing to `main` is still the normal way the work reaches him**, and still his only route when he
is away from the laptop — so this is not an argument for pushing less. **It is an argument for
knowing what is in the diff, and for sailing the trial BEFORE the push rather than after.** The diff
is still the thing to read; it is simply no longer the thing that makes the push safe.

### The loop, every time

1. Develop and commit on the session's designated branch.
2. **Bump the build stamp** — `PP4_STAMP` in `src/ui/stage.js` (**not `4/src/…` — the cutover moved it**), shown in the hamburger menu as
   `v4 · build 2026-08-13g`. It is how he tells at a glance whether he is looking at your work.
3. **Prove the merge touches only the milestone.** Run this and read it — empty output is the
   licence to push:
   ```bash
   git diff --name-only origin/main..HEAD -- ':(exclude)4/' ':(exclude)scripts/' ':(exclude)docs/' ':(exclude).claude/' ':(exclude).planning/'
   ```
   Anything printed there changes the live game real players are in the middle of. Stop and ask.
   `CNAME`, `robots.txt` and `sitemap.xml` must never appear — see §1.
4. Fast-forward, push, pull, and verify both directions are zero (§3).
5. Go back to the working branch. Tell him the build stamp to look for, and that Pages takes a
   minute or two.

### The tell that a session skipped this

**He reports an old build stamp.** On 2026-08-14 he sent a screenshot of `build 2026-08-13a` and said
he could not see `13g` even in an incognito window — and he was completely right. Fourteen commits of
playtest fixes were sitting on a branch nobody had merged, so `/4` was still serving a build from
before the session started. He had spent the morning testing work that was never deployed.

**It was not a cache. Nothing is ever a cache here, because there is no build step.** If he cannot
see it, it is not on `main`.

---

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
root `npm test` and every `4/scripts/*_check.js` gate run on bare Node.

### Browser QA in the cloud

`4/scripts/mouse_qa.mjs` and `4/scripts/mp_rig.mjs` resolve Chrome from `$CHROME_BIN`, then the
PATH (`google-chrome`, `chromium`, `chromium-browser`), then the Mac bundle; on Linux they add
`--no-sandbox --disable-dev-shm-usage` (a container running as root cannot use Chrome's SUID
sandbox, and `/dev/shm` is tiny). The repo root is derived from the script's own location. Usage
is unchanged: `node 4/scripts/mouse_qa.mjs <outdir> <W> <H> <port> <dbgport>`.

### THE PROOF — RAN 2026-08-21, all four items passed.

Run by the first cloud session, branch `claude/pastry-pirates-cloud-qa-a9jkeg`. Item 3 passed only
after a two-part browser TLS fix — **now applied AUTOMATICALLY at session start** by
`.claude/hooks/cloud-session-start.sh` (a SessionStart hook in `.claude/settings.json`, added
2026-08-21 at Wyatt's ask: *"I want this to work, now and always"*). It no-ops on the laptop
(`CLAUDE_CODE_REMOTE` guard), is idempotent, and installs the fixed browser as `chromium` on PATH
so `4/scripts/lib/chrome.mjs` resolves it with no env var. The manual recipe stays below as the
fallback if the hook ever reports "skipped" — and as the record of what the fix IS.

1. **Project-local GSD works.** `node .claude/gsd-core/bin/gsd-tools.cjs validate health` ran —
   known-noise W019s only. Also verified: `state get`, `progress` and the full command list all
   respond; **zero laptop-absolute paths** remain in `.claude/commands`, `.claude/agents`,
   `.claude/gsd-core`; GSD **1.8.0 project-local**.
2. **Solo mouse-QA at 1400×900, past the bar.** `node 4/scripts/mouse_qa.mjs <out> 1400 900 8611
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
