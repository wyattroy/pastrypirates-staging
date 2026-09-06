# The Cloudflare cutover — the steps, in order, and who does each one

**This is the list Wyatt follows.** Everything in the repo is built and green; what is left is
account and DNS work that only he can do, plus one field that has to be typed into Cloudflare's
dashboard by hand because no file in this repo can set it.

**Written 2026-09-06** after CEO 228 found the gap: *"He asked for staging first, and what he can
act on right now is a script and a green gate."*

> **THE ORDER IS THE SAFETY.** Staging moves first and lives on its own for a few days. Production
> is untouched the whole time, so if any of this is wrong, real players never see it. Nothing below
> step 8 touches the live game.

---

## What is already done — nothing here needs him

| | |
|---|---|
| `scripts/build-site.mjs` | assembles the publish set: **221 game files, 7.3 MB**, out of 3,355 tracked files |
| `scripts/qa/site_build_check.mjs` | gate 142 of 142. Proves every live URL survives, that `classic/`'s 24 files carry through, that `CNAME` never ships, and that a production build is **byte-identical** to the repo |
| `wrangler.toml` | the build contract, in the repo rather than only in a dashboard |
| the five staging tells | stamp `-staging@<sha>`, `[STAGING]` tab title, `Disallow: /`, no sitemap, `X-Robots-Tag: noindex` — all verified on a real branch build, and absent from production builds |

---

## STEP 1 — the staging Pages project *(his: ~5 minutes)*

`dash.cloudflare.com` → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → the
`wyattroy/pastrypirates` repository.

| field | value |
|---|---|
| Project name | `pastrypirates-staging` |
| Production branch | **`staging`** ← not `main`. This is the whole point |
| Framework preset | **None** |
| Build command | `node scripts/build-site.mjs` |
| Build output directory | `_site` |

> ⚠ **The build command is the one thing a diff cannot show you.** `wrangler.toml` cannot set it for
> a Pages project. If a deploy ever publishes the wrong files, check this field first.

## STEP 2 — create the `staging` branch *(either of us: 1 minute)*

```bash
git checkout -b staging && git push -u origin staging
```

Cloudflare builds it and serves it at `pastrypirates-staging.pages.dev`.

## STEP 3 — look at the .pages.dev URL before any DNS moves *(2 minutes)*

Open it and check three things: **the game loads**, the tab reads **`[STAGING]`**, and the ☰ menu's
build stamp ends in **`-staging@<sha>`**. Also open `/classic` — it should be v1.

**If any of that is wrong, stop here.** Nothing public has changed yet and there is nothing to undo.

## STEP 4 — move the nameservers to Cloudflare *(his: ~10 minutes, then waiting)*

Cloudflare → **Add a site** → `playpastrypirates.com` → **Free** plan. It scans the existing records
and shows you what it found. **Check the two TXT records are there before you continue:**

```
TXT  @   google-site-verification=QWA4b7b-vWs2-Blrgwmv51O72IBMg3NBpFvf3OYz2Cc
TXT  @   v=spf1 -all
```

Then at **Squarespace**, replace the nameservers with the two Cloudflare gives you.

> **Why this is safer here than it usually is — measured 2026-09-06, not assumed:** the domain has
> **no MX records**, so there is no email to break. The only records that matter are those two TXT
> lines and the web records Cloudflare is about to manage. Propagation is usually under an hour.
>
> ⚠ **Leave the existing A records pointing at GitHub Pages during this step.** Cloudflare copies
> them across, so production keeps serving from Pages exactly as it does now while the nameservers
> move. **This step does not move the live game.**

## STEP 5 — point staging at the staging project *(his: 2 minutes)*

Cloudflare → Pages → `pastrypirates-staging` → **Custom domains** → **Set up a custom domain** →
`staging.playpastrypirates.com`.

Cloudflare issues the certificate automatically — **no CAA record blocks it** (checked: the apex has
none, and the subdomains permit `letsencrypt.org`).

## STEP 6 — play staging *(his)*

Two tabs, host and guest, a real crew game. This is the actual proof, and it is why staging goes
first.

## STEP 7 — live on it for a few days

Nothing to do. If nothing goes wrong, continue. **Production is still on GitHub Pages this whole
time.**

---

## ⚠ EVERYTHING BELOW HERE TOUCHES THE LIVE GAME

## STEP 8 — the production Pages project *(his: 5 minutes)*

Exactly as step 1, but: project name `pastrypirates`, **production branch `main`**. Same build
command, same output directory.

Check `pastrypirates.pages.dev` loads and its stamp has **no** `-staging@` suffix.

## STEP 9 — move the apex *(his: 2 minutes, at a quiet hour)*

Pages → `pastrypirates` → **Custom domains** → add **`playpastrypirates.com`** and
**`www.playpastrypirates.com`**. Cloudflare replaces the GitHub Pages A records with its own.

**There is a window of a few minutes while the certificate is issued, during which HTTPS on the apex
can fail.** Pick an hour when nobody is playing.

**Verify, and do not take the dashboard's word for it:**

```bash
curl -s https://playpastrypirates.com/src/ui/stage.js | grep -o 'PP4_STAMP = "[^"]*"'   # no -staging
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/classic/          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/RULES-V2.md       # now 404
node scripts/where_is_my_work.mjs
```

**Rollback if anything is wrong:** put the four GitHub Pages A records back
(`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`). The repo is still public and Pages is
still configured, so production returns as soon as DNS propagates.

## STEP 10 — make the repo private *(his: 1 minute)*

**Only after step 9 is verified.** GitHub → Settings → Danger Zone → Change visibility.

Cloudflare keeps building, because it holds a GitHub App installation rather than public read access.

## STEP 11 — take down what is now unused *(either of us)*

1. Delete the `wyattroy/pastrypirates-staging` repository.
2. Delete `CNAME` from this repo — **not before step 9**, because while the apex resolves to GitHub
   Pages that file is the only thing holding the domain.
3. Retire `scripts/deploy-staging.sh` and its gate; rewrite `docs/GIT-AND-DEPLOY.md` §1 and §5 and
   `.claude/CLAUDE.md` rule 14, which stops being a rule the moment there is one repo.

---

## Not part of this, and bigger than it

**Firebase.** He is on **Blaze**, so multiplayer does not break at launch — 200,000 simultaneous
connections rather than 100. But `/rooms` answers an unauthenticated read and `src/net/writers.js`
writes live game state there with no sign-in step anywhere in `src/net/`. **On a pay-as-you-go plan
an open database is a billing exposure, not a privacy one.** The ten-minute version is a Google
Cloud budget alert. The real fix is scoped security rules, and nobody has claimed it.
