# Running Pastry Pirates in a cloud container

**You are probably here because something broke and you went looking. It should not have cost you
that, and this page exists so it does not cost the next session.** Wyatt, 2026-09-19:

> *"There is documentation in the repo for how to set up the qa rig — you should have just looked
> for it and set it up yourself… then write that documentation in a way that they will find more
> easily."*

---

## The whole thing, in one command

```bash
node scripts/qa/cloud_rig.mjs             # what is here, what is missing, and the exact fix
node scripts/qa/cloud_rig.mjs --install   # install everything missing, then PROVE it works
```

**Run it before your first `npm test`, not after a gate goes red.** It is idempotent, it takes a
second when the rig is already complete, and the SessionStart hook prints its verdict at the top of
every cloud session — so if you saw *"rig complete"* up there, you have nothing to do.

---

## What the rig is, and what each piece fails like when it is missing

A cloud container is **not** a laptop with the repo on it. Five things have to be true, and **four
of the five fail LATER, in a way that looks like something else.** That is the whole hazard.

| piece | what it is for | how its absence presents |
|---|---|---|
| **chromium + a TLS 1.2 wrapper + the proxy's CAs** | every browser check | a crew game fails **silently** — Firebase never loads, Host/Join do nothing, and it reads as a multiplayer bug. *(The SessionStart hook does this one automatically.)* |
| **rsync** | `npm run deploy:staging` | the deploy dies mid-command. ⛔ **Never substitute `cp -r`**: rsync's `--exclude` list is what keeps `CNAME`, `robots.txt` and `sitemap.xml` out of the staging repo, and hand-rolling that sync is the move that twice came within one command of taking the live game down. |
| **the `playwright` npm package**, in `~/.pw` | `npm test` | **`npm test` dies at gate 36 of 177 and the 140 gates after it never run.** The message is a resolver's complaint, not "your machine is bare". Not `/tmp` — `/tmp` is cleared on reboot and that is exactly how the Safari legs died once. |
| **WebKit itself** (`npx playwright install webkit`) | the sea trial's two Safari-family legs | ⚠ **NOTHING FAILS.** The trial reports `solo-desktop-wk` and `solo-phone-wk` as NOT RUN, at the bottom of a long report, and every other leg passes. This is the one that got past a session on 2026-09-19: it installed the npm PACKAGE, assumed that was the browser, and ran a FULL trial that could never have sailed those legs. |
| **the network allowlist** | the WebKit download, and checking your own publish | `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, `staging.playpastrypirates.com`. See `docs/GIT-AND-DEPLOY.md` §7 for where to set them. |

---

## Three traps that are container-only

**1. `pkill -f <anything>` KILLS YOUR OWN SHELL.** Every Bash call runs under a wrapper whose
command line contains your pattern, so `pkill -f sea_trial` matches the shell running it. And the
browsers are **not** called `chromium` — `/usr/local/bin/chromium` is a wrapper and the real
processes are `chrome`, so `pgrep -x chromium` reports **0 while ten live browsers burn CPU**.

```bash
pkill -9 -x chrome; pkill -9 -x chromium; pkill -9 -x headless_shell    # match the NAME
node scripts/qa/stray_probe_check.mjs                                   # then ask, never assume
```

**2. A gate guarding a TOOL reads exactly like a gate that found a DEFECT.** When something goes red
on a machine you have not used before, **check the machine before you read the diff.**

**3. WebKit's install "fails" after a successful download.** `validateDependenciesLinux` throws
until `npx playwright install-deps webkit` has run — and that throw comes AFTER the 102 MB arrives.
**Read past the stack trace** before concluding the download was blocked. `cloud_rig.mjs --install`
runs the two in the right order.

---

## What the cloud can and cannot do

**Can:** the full 177-gate suite · solo, pass-and-play and real two-browser crew QA · a FULL sea
trial including the WebKit legs · publish to staging and verify its own publish.

**Cannot, ever:** **Safari.** Playwright's WebKit is the same engine family, a different build.
**Wyatt's own phone is the only real Safari this project has, and no report may say "Safari passed".**
His laptop also remains the only place for his own play.

---

## Where the measurements live

This page is the front door; it deliberately does not restate the evidence.

- **`docs/GIT-AND-DEPLOY.md` §7** — the cloud recipe: the exact network hosts read from the code, the
  seven things a 2026-08-27 CTO run found that only fail in a container, and the TLS diagnosis that
  looked like a network fault for two days.
- **`docs/DRIVING-THE-GAME.md` §8c** — why playwright lives in `~/.pw` and not `/tmp`.
- **`docs/HARD-WON-LESSONS.md`** — "A fresh cloud container cannot run 140 of the 177 gates".
