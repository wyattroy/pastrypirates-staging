# PRD — moving Pastry Pirates onto Cloudflare, and deleting the staging repository

**Status:** ready for Wyatt to execute, **with one thing that has to happen a day early — see P0.**
**Written 2026-09-06; revised the same night after an independent audit**, which found six things
this document had wrong and one that would have taken the whole domain offline. Supersedes
[`CLOUDFLARE-CUTOVER.md`](CLOUDFLARE-CUTOVER.md) — **that file is a checklist telling him to do two
things we now know are wrong, and it is deleted as part of this work, not kept for reference.**

> **The one-line version.** Today the game is served by GitHub Pages out of the repository root, and
> staging is a **photocopy** of the tree pushed by hand into a second GitHub repository. After this,
> Cloudflare serves both, `main` is production, **`dev` is staging**, and the second repository is
> deleted. Pushing to `dev` publishes staging by itself. Nobody copies anything, ever again.

---

## 1. Why this is happening

**1. The manual step already shipped an untested build to real players.** On 2026-09-06 two commits
reached production having never been on staging, because publishing staging is a separate command
somebody has to run in the right order. It was run in the wrong order and nothing caught it
(`.planning/HANDOFF-2026-09-06-RELEASE.md`, item 1). When `dev` publishes itself, that sequencing
error cannot be made.

**2. Traffic.** Wyatt: *"my traffic is about to increase 10000 fold — i'm pre-launch right now."*
GitHub Pages publishes a soft 100 GB/month bandwidth limit and documents itself as not for
high-traffic sites. Cloudflare states that **requests to Pages static assets are free and
unlimited** on the Free plan. *(Cloudflare does not publish a bandwidth figure for Pages at all —
"unlimited bandwidth" is received wisdom, not a documented commitment. The requests claim is
documented; that is the one to rely on.)*

**3. Parts of the repository are a public website.** Measured on the live domain, not assumed:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/RULES-V2.md
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/scripts/deploy-staging.sh
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/docs/GIT-AND-DEPLOY.md
```

All three answer **200**. **The honest size of this, corrected by the audit: 734 of 3,054 tracked
files are public today, not all 3,054.** GitHub Pages runs Jekyll, which silently skips any path
segment beginning with `.` or `_`, so `.planning/` — 1,744 files, the entire project record — has
never been served (`/.planning/…` answers 404, measured). What *is* public is `docs/`, `scripts/`,
`notes/`, `art-review/`, and four draft rulesets at the repo root. After the cutover **225 files**
reach a player and the other 2,829 do not.

---

## 2. What "done" looks like

| | before | after |
|---|---|---|
| production | GitHub Pages, repo root, `main` | Cloudflare Pages, `_site/` built from `main` |
| staging | a **copy** pushed to `wyattroy/pastrypirates-staging` by hand | Cloudflare Pages, built automatically from **`dev`** |
| repositories | two | **one** |
| how staging is published | `npm run deploy:staging -- "…"` | `git push origin dev` |
| what is public | 734 files | the **225** that are the game |
| the repo itself | public | **private** |
| DNS | Squarespace nameservers, **DNSSEC on** | Cloudflare nameservers |
| `CNAME` file | holds the domain; nearly took the game down twice | **deleted** |

**Acceptance, in one sentence he can check himself:** he pushes to `dev`, waits a minute, opens
`staging.playpastrypirates.com` and sees his own change with a `-staging@` stamp — with nobody
having run a deploy command.

---

## 3. Non-goals

- **Firebase security rules.** `/rooms` answers an unauthenticated read and the game writes live
  state there with no sign-in (`src/net/index.js:74-89` — no Auth, no App Check). On Blaze **that is
  a billing exposure, not a privacy one**, and a 10,000× traffic increase is when it bites. A Google
  Cloud budget alert is ten minutes and is **step 22** below — it has an owner and a number now,
  because the audit found it had neither.
- **Cloudflare Workers, Functions or KV.** This is a static site.
- **Rebuilding the release process.** `dev` → play it → merge to `main` is unchanged. Only the
  *publisher* changes.
- **Touching the game.** Not one byte of `index.html` or `src/` changes. `site_build_check.mjs`
  asserts a production build is byte-identical to the repo.

---

## 4. The architecture, and a claim this document got wrong

### Two Pages projects, one repository

| Cloudflare Pages project | production branch | serves |
|---|---|---|
| `pastrypirates` | `main` | `playpastrypirates.com`, `www.playpastrypirates.com` |
| `pastrypirates-staging` | **`dev`** | `staging.playpastrypirates.com` |

Two projects on one repository is explicitly supported (Cloudflare documents up to five per repo).

> ### ⚠ THE FIRST DRAFT OF THIS SECTION SAID TWO PROJECTS WERE FORCED. THEY ARE NOT.
> It read *"a custom domain cannot be attached to a preview branch"*. **That is false.** Cloudflare
> documents "Add a custom domain to a branch": you point the subdomain's CNAME at
> `dev.<project>.pages.dev` instead of `<project>.pages.dev`. One project could serve both.
>
> **Two projects is therefore a choice, and here is the reasoning, so it can be revisited.** The
> branch-alias route needs a successful deploy on the branch *before* the domain can be attached,
> needs the DNS record hand-edited afterwards, and silently falls back to serving **production** if
> that record is ever un-proxied — a failure whose symptom is "staging is showing me the live game",
> which is exactly the class of confusion this whole cutover exists to end. Two projects have two
> dashboards, two build logs and two production branches, and nothing to get subtly wrong.
>
> **The cost of the choice is P2 below.** One project would keep `wrangler.toml`.

### Why `dev` and not a new `staging` branch

Wyatt: *"dev will just stay as a branch on main that is playable through cloudflare."* The first
draft created a third branch whose only job was to be a copy of `dev` — the photocopy problem in new
clothes. It is gone.

`scripts/build-site.mjs:73-76` already decides context from `CF_PAGES_BRANCH`: `main` is production,
**anything else is staging**. `dev` gets that with no code change. *(Confirmed by the audit.)*

### What tells staging apart — five things, all automatic

Stamp ends `-staging@<sha>` · tab title `[STAGING]` · `robots.txt` says `Disallow: /` · `sitemap.xml`
removed · `X-Robots-Tag: noindex`. A production build has none of them. Both halves are asserted by
`scripts/qa/site_build_check.mjs`, in `npm test`.

---

## 5. Pre-flight — everything that must land before Wyatt touches Cloudflare

### P0 — TURN OFF DNSSEC AT SQUARESPACE, **A DAY BEFORE ANYTHING ELSE** (blocking, his, 5 minutes)

**This is the finding that reshapes the schedule, and the first draft of this document did not
mention it at all.** Measured tonight:

```bash
dig DS playpastrypirates.com +noall +answer    # Mac / Linux ONLY
```

```
playpastrypirates.com.  86400  IN  DS  65222 8 2 FA2F0181...1A566698
```

**DNSSEC is live on this domain.** If the nameservers move to Cloudflare while that record is still
published at the registry, every validating resolver — 1.1.1.1, 8.8.8.8, Quad9, most ISPs — sees a
broken chain of trust and answers **SERVFAIL for the entire domain.** Not a certificate warning: the
name stops resolving. Cloudflare's own instruction is unambiguous: *"If your domain has DNSSEC
active, you must turn it off at your registrar before replacing nameservers… Changing nameservers
while DNSSEC is active can cause your domain to become unreachable."*

**And the rollback in §8 cannot fix it**, because DNS itself is what is failing.

**The TTL on that DS record is 86,400 seconds — twenty-four hours.** So this is not a "do it first
on the day" step. Disable DNSSEC at Squarespace, then wait until

```bash
dig DS playpastrypirates.com +short    # Mac / Linux ONLY
```

On the Windows laptop that command does not exist; the same question there is `Resolve-DnsName -Name playpastrypirates.com -Type DS` (verified on Wy-Blade, 2026-09-12 — it returned one DS record, so DNSSEC was still live).


**returns nothing at all**, before going anywhere near step 7. Re-enable it later from Cloudflare's
own DNS panel if wanted.

### P1 — add a `404.html` (blocking, mine)

Cloudflare Pages' documented behaviour with no `404.html` is to assume the site is a single-page app
and **serve `/` for every unmatched path**. So with nothing changed:

- `playpastrypirates.com/anything` returns **the game, HTTP 200**, not a 404.
- The verification below — `/RULES-V2.md` should 404 — would be **wrong**; it would return the game.
- **And the audit found the sharp edge:** `robots.txt` carries **13 `Allow:` lines** pointing at
  `/scripts/`, `/art-review/`, `/notes/` and `/4/` — paths that stop existing. Google already holds
  those URLs. Without a `404.html`, **each one becomes another 200 serving the front door**: a dozen
  duplicate copies of the game at URLs already in the index.

**Two requirements, not one.** The page must carry
`<meta name="robots" content="noindex, nofollow">` in its `<head>`. This was tested, not assumed:
adding a `404.html` without it turns `scripts/qa/crawl_intent_check.mjs` **red** —
*"404.html — is served, is not in sitemap.xml, declares no crawl intent and is not Disallowed"*.
With it, `npm test` stays green at 226 files. **The wording of the page is Wyatt's; the noindex tag
is not optional.**

### P2 — remove `wrangler.toml` (blocking, mine)

**The first draft's argument for this was wrong and the audit was right to say so.** It claimed
Cloudflare *requires* the `name` field to match the project; no Pages documentation says that, and
the pull-request auto-fix cited is a **Workers Builds** feature, not a Pages one. The real reasons
are documented and are better:

- **The file is already opted in.** `wrangler.toml:30` sets `pages_build_output_dir`, and Cloudflare
  states that once that key is present *"you can not edit the same fields in the dashboard"* — so
  one file at the root now governs both projects' build output, from a file that names one of them.
- **`[env.<x>]` sections in a Pages `wrangler.toml` target the same project**, so there is no
  supported way for one file to describe two.
- **The build command is not a supported Pages key at all** — it exists only in the dashboard. The
  file's headline value was never available.

Its real worth is the *reasoning* it carries, and that moves here and into
[`GIT-AND-DEPLOY.md`](GIT-AND-DEPLOY.md). Delete the file; keep the argument.

### P3 — pin the Node version (mine)

Build image v2 ships Node 18.17.1, v3 ships 22.16.0. Add a `.nvmrc` holding a **bare version number**
— v3 explicitly rejects codenames like `lts/hydrogen`, and does not read `package.json` `engines`.
`.nvmrc` is already excluded from the publish set twice over. Confirm each project is on **Build
System v2 or later**; two projects on one repository requires it, and new projects default to v3.

### P4 — decide the `.html` question (optional, safe to skip on day one)

**Cloudflare Pages redirects `/about.html` to `/about`.** Documented behaviour, not configurable.
*(The first draft said the redirect is a 308. The audit could find no status code in the Pages docs;
the Workers successor documents **307**. Neither of us has measured it here — the check is in §8.)*

Three things name the `.html` form: `sitemap.xml`'s five `<loc>` entries, the canonical tags on four
pages, and the internal links in `index.html`. Moving the sitemap and canonicals to the
extension-less form tells Google the URL Cloudflare actually serves. Three gates read that set and
must move in the same commit: `sitemap_list_derived_check`, `sitemap_lastmod_check`,
`crawl_intent_check`. If it is taken, `stats.html` should gain the canonical tag it is missing.

**Skipping this costs SEO tidiness, not a working game.** It is here so the decision is deliberate.

### P5 — fix the caching rules for the shape Cloudflare actually serves (mine)

`build-site.mjs` generates a `_headers` file matching `/`, `/*.html`, `/src/*`, `/assets/*`,
`/sfx/*`. The audit found two gaps that only appear under Cloudflare:

- After the extension-less redirect, the pages are served as `/about`, `/rules`, `/classic/` —
  which match **neither** `/` (exact) nor `/*.html`. They fall through to no rule.
- `/src/*` is anchored at the root, so **`/classic/src/` — the 21 modules of the v1 game — gets no
  `Cache-Control` at all.** GitHub Pages currently gives everything `max-age=600`.

Low blast radius, and precisely the failure that header block exists to prevent: *a stale module
against fresh HTML is a broken game with no error message.*

### P6 — the teardown commit, written now, landed at step 23

Retiring `scripts/deploy-staging.sh` also retires `scripts/qa/deploy_rsync_paths_check.mjs`, and
`scripts/gate_count_check.js` compares gates declared against gates run — **so the script, the gate,
the `package.json` chain (`gates.total: 104 → 103`) and the docs move in a single commit or `npm
test` goes red.** The audit verified this bites on the Mac too, not only on the Blade:
`deploy_rsync_paths_check.mjs:103-124` sources the shell script before its non-Windows skip, so
deleting the script alone is four failures and exit 1 here. The full list is §11.

---

## 6. The sequence

**The order is the safety.** Staging moves first and lives alone for days. Production is untouched
until Phase B.

### PHASE A — staging, with production untouched

| # | who | what |
|---|---|---|
| **0** | **Wyatt** | **Disable DNSSEC at Squarespace. At least 24 hours before step 7.** P0. |
| 1 | me | Land the pre-flight commit (P1, P2, P3, P5, and P4 if taken). `npm test` exit 0. Push `dev`. |
| 2 | **Wyatt** | Cloudflare account, email verified, 2FA on. Authorise the **Cloudflare Workers & Pages GitHub App** on `wyattroy/pastrypirates` — a consent screen the first draft never mentioned. |
| 3 | **Wyatt** | Create the Pages project `pastrypirates-staging`: **production branch `dev`**, preset None, build command `node scripts/build-site.mjs`, output `_site`. |
| 4 | **Wyatt** | Set that project's **preview branches to None**. §7. |
| 5 | **Wyatt** | Read the first build log. §8 names the one line to look for. |
| 6 | **Wyatt** | Open `pastrypirates-staging.pages.dev` — four checks. **Stop here if any fails; nothing public has changed.** |
| 7 | **Wyatt** | Confirm `dig DS playpastrypirates.com` is empty. **Screenshot or export the whole Squarespace DNS zone first** — Cloudflare warns its quick scan *"is not guaranteed to find all existing DNS records"*. Then add the site to Cloudflare (Free), check the scan found both TXT records, and **set every imported A and CNAME record to DNS-only (grey cloud)**. |
| 8 | **Wyatt** | Replace the four Squarespace nameservers with Cloudflare's two. **Cloudflare says wait up to 24 hours; Squarespace says up to 48.** The `.com` delegation TTL is 172,800s, measured. |
| 9 | **Wyatt** | When the zone is Active: confirm the game is still up, and that **both TXT records resolve from the new nameservers** — not merely that the scan preview listed them. Check SSL/TLS mode is **not Flexible** (new zones default to Automatic). |
| 10 | **Wyatt** | Attach `staging.playpastrypirates.com` to the `pastrypirates-staging` project. |
| 11 | **Wyatt** | Play staging — two tabs, host and guest, a real crew game to the end card. |
| 12 | — | Live on it for a few days. |

**About step 7's grey cloud, and why the first draft was wrong here.** It said moving nameservers
*"does not move the live game"* because Cloudflare copies the GitHub Pages records across. It copies
them — but **Cloudflare proxies imported records by default**, which puts Cloudflare's edge in front
of GitHub Pages. Two consequences: GitHub's certificate renewal check sees *"records not pointing to
the IP addresses for GitHub Pages"* and quietly stops working, degrading the rollback this plan leans
on for the next several steps; and a proxied origin that force-redirects HTTP→HTTPS, which GitHub
Pages does, can loop under Flexible SSL. **Grey-clouding every imported record makes the original
claim true.**

**What is genuinely safe here, measured:** no MX records, so no email to break. No CAA record, so
nothing blocks certificate issuance later. *(The CAA records that appear when you query the staging
subdomain belong to `github.io` and are being read through the CNAME pointing there. They vanish at
the cutover.)*

### PHASE B — production. Everything below touches the live game.

| # | who | what |
|---|---|---|
| 13 | **Wyatt** | Create the Pages project `pastrypirates`: **production branch `main`**, same build command and output, preview branches **None**. |
| 14 | **Wyatt** | Check `pastrypirates.pages.dev` loads and its stamp has **no** `-staging@`. |
| 15 | **Wyatt** | **Create the `www` → apex redirect rule now, before the domain moves.** The audit's improvement on the first draft: the rule runs on the zone, so it can fire against the proxied `www` record *before* `www` is ever attached to Pages — which removes the window in which two identical copies of the game are live. |
| 16 | **Wyatt** | At a quiet hour: attach `playpastrypirates.com` and `www.playpastrypirates.com` to the `pastrypirates` project. **A window of minutes where HTTPS on the apex can fail.** |
| 17 | **Wyatt** | Turn on **Always Use HTTPS**. Today GitHub 301s `http://` → `https://` (measured); Cloudflare Pages custom domains have no documented automatic equivalent. **Leave HSTS off** — production sends no HSTS header today and it cannot be undone quickly. |
| 18 | me | Verify from the wire, not the dashboard. §8. |
| 19 | — | Soak. Days. **The GitHub Pages rollback lives exactly as long as the repository is public.** |

### PHASE C — teardown, after the soak

| # | who | what |
|---|---|---|
| 20 | **Wyatt** | **Clear the custom domain in `wyattroy/pastrypirates` → Settings → Pages first**, then make the repository private. GitHub's own warning: *"you should remove or update your DNS records before making the repository private, to avoid the risk of a domain takeover."* **This closes the rollback window.** |
| 21 | **Wyatt** | **Immediately push a no-op to `dev` and watch the staging build.** No Cloudflare document states that Pages builds survive a repository going private — this is the cheap proof, and flipping back to public is the cheap undo. |
| 22 | **Wyatt** | Delete the GitHub repository `wyattroy/pastrypirates-staging`. |
| 23 | me | Land the teardown commit — §11. |
| 24 | **Wyatt** | The Firebase budget alert. Not part of the cutover; it now has a step number because the audit found it had none. |

> ⚠ **`pastrypirates-staging` is now a CLOUDFLARE PROJECT NAME as well as a GitHub repository name.**
> The repository is deleted at step 22; the project is not. On 2026-08-27 an instruction reading
> *"go to the staging repo's Settings → Pages"* was followed on **production**, where the same
> button would have taken the live game down. Name the system and the full URL, every time.

---

## 7. Settings that are not obvious

**Preview branches → None, on both projects.** Cloudflare defaults to building every non-production
branch. *(The first draft justified this by saying `physical-board` would get a public URL. **The
audit measured that and it is wrong:** `scripts/build-site.mjs` exists on only **2 of 17 branches**,
so on the other 15 the build command fails and nothing is published. The real cost is failed-build
noise against the 500-builds-a-month cap, not exposure. The setting is still right; the reason was
overstated.)*

**The `www` redirect rule.** Today GitHub Pages answers `https://www.playpastrypirates.com/` with a
**301** to the apex (measured). Cloudflare will not. Use the wildcard form Cloudflare's own worked
example gives — request `http*://www.playpastrypirates.com/*`, target
`https://playpastrypirates.com/${1}`, status 301, preserve query string on. **Single Redirects
require the hostname to be proxied**, which attaching it to Pages makes true. Free plan allows 10.

**`pastrypirates.pages.dev` will be publicly reachable and indexable.** A production build carries no
`noindex`, correctly. Every game page carries a `<link rel="canonical">` naming
`playpastrypirates.com`, which is the mitigation and is already in place. Accepted, not fixed.

**Analytics and dev flags are off on the bare `.pages.dev` URLs.** `src/shared/host.js:29-40` lists
the live hosts and the dev hosts by name, and `*.pages.dev` is in neither. So the checks at steps 6
and 14 are not quite the checks he runs on the real hostnames. Harmless; worth knowing.

**`staging.playpastrypirates.com` sends HSTS with a one-year max-age** (measured; production sends
none). His browser has that pinned, so **HTTPS must work on the very first request after step 10** —
a failure there is a hard browser error, not a warning he can click through.

**Free plan headroom, against the real numbers:** 500 builds/month against a dozen pushes a week;
20,000 files per deployment against **225**; 25 MiB per file against a 7.5 MB whole site. Both
Cloudflare limits and a 25 MB ceiling are already asserted in `npm test`.

---

## 8. How each phase is proved — from the wire, never the dashboard

**The first build log is the one thing to actually read.** `build-site.mjs` gets its file list from
`git ls-files` and fails hard rather than falling back to a filesystem walk. If Cloudflare's build
container does not give the build a usable checkout, the log says:

> `build-site: FATAL — 'git ls-files' failed, and there is no fallback on purpose.`

**The audit downgraded this risk and the evidence is worth keeping:** Hugo's and Quartz's official
documentation both instruct users to run `git` commands *inside a Cloudflare Pages build command*,
Cloudflare documents a "Cloning git repository" build stage, and it injects `CF_PAGES_COMMIT_SHA`.
The clone is shallow, which does not matter — `ls-files` reads the index, and the index is complete
at HEAD. **Very likely fine; still the first thing to look at, because it fails at step 5 with
nothing public touched.**

**A good build log ends with a line naming the count and size** — `225 files, 7.5 MB`.

**Staging, at step 6 (his eyes):** the game loads · the tab reads `[STAGING]` · the ☰ stamp ends
`-staging@<sha>` · `/classic` loads v1. Also worth one command while nothing has moved:

```bash
curl -sI https://pastrypirates-staging.pages.dev/about | head -5
```

which answers P4's open question — the redirect's real status code — and shows whether `_headers`
reached the extension-less URLs (P5).

**Production, at step 18:**

```bash
curl -s https://playpastrypirates.com/src/ui/stage.js | grep -o 'PP4_STAMP = "[^"]*"'
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/classic/
curl -s -o /dev/null -w "%{http_code}\n" https://playpastrypirates.com/RULES-V2.md
curl -sI https://playpastrypirates.com/ | grep -i "server\|cache-control"
curl -sI https://www.playpastrypirates.com/ | grep -i "^HTTP\|^location"
node scripts/where_is_my_work.mjs
```

Expected: a stamp with **no** `-staging@` · `/classic/` **200** · `RULES-V2.md` **404** *(only if P1
landed)* · `server: cloudflare` and the `must-revalidate` header from `_headers` *(a `_headers` file
in the wrong place does nothing at all, silently)* · `www` **301**.

### Rollback — corrected, because the first draft's recipe restored half the domain

It listed only the four apex `A` records. **`www` and `staging` are CNAMEs.** All three, with their
current values, measured tonight:

| name | type | value |
|---|---|---|
| `playpastrypirates.com` | A ×4 | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `www` | CNAME | `wyattroy.github.io` |
| `staging` | CNAME | `wyattroy.github.io` |

Restoring the apex alone leaves `www` and staging broken, under exactly the pressure that makes that
hard to notice. **And no DNS edit rolls back P0** — if DNSSEC was left on, the domain is unreachable
until the DS record's 24-hour TTL expires.

---

## 9. What this document corrects — in the first draft, and in itself

**In [`CLOUDFLARE-CUTOVER.md`](CLOUDFLARE-CUTOVER.md), which is deleted at step 23:**

1. It creates a `staging` branch. Wyatt has ruled that `dev` is the staging branch.
2. It never mentions `404.html`, so its own verification step fails.
3. It keeps `wrangler.toml`.
4. Its CAA claim is about `github.io`, read through a CNAME — not about this domain.
5. **It never mentions DNSSEC**, which is live and would take the domain offline.

**In this document's own first draft, found by the audit and corrected above:** the branch-alias
claim in §4 · the "nameservers don't move the game" claim in §6 · the half-a-domain rollback in §8 ·
the preview-branch hazard in §7 · the `wrangler.toml` evidence in P2 · "308" in P4 · "the whole
repository is public" in §1 · and `deploy-staging.sh`'s length, which is **351 lines, not 612.**

---

## 10. Risks, ranked by what a player would feel

| risk | likelihood | what it does | what stops it |
|---|---|---|---|
| **DNSSEC left on at the nameserver change** | **certain if skipped** | **the entire domain stops resolving, for up to 24h, un-rollbackable** | **P0, a day early** |
| certificate window on the apex at step 16 | certain, briefly | HTTPS fails on the live domain for minutes | quiet hour; rollback is a DNS edit |
| every unmatched URL serves the game with a 200 | certain without P1 | broken links stop failing visibly; 13 indexed URLs become duplicate front doors | P1 |
| imported records left proxied | likely | GitHub's cert renewal quietly breaks, degrading the rollback | grey-cloud at step 7 |
| rollback restores the apex only | likely, under pressure | `www` and staging stay broken | the three-row table in §8 |
| `www` stops redirecting | certain without the rule | two live copies of the game | step 15, before the move |
| repo made private too early | possible | the GitHub Pages rollback closes while still wanted | step 20 is after the soak |
| Pages stops building on a private repo | unknown, undocumented | staging and production both freeze | step 21's no-op push |
| `git ls-files` unavailable in the build container | low | the cutover stops dead | fails at step 5, nothing public touched |
| stale module against fresh HTML on `/classic/` | low | v1 breaks with no error message | P5 |
| Firebase billing under 10,000× traffic | real, outside this work | a bill, not an outage | step 24 |

---

## 11. What is deleted at the end — the full list

The first draft named four things. **The audit found nine more, every one measured with a
file:line**, and several would have kept `npm test` green while telling a session something false.

| what | why it has to go |
|---|---|
| the GitHub repository `wyattroy/pastrypirates-staging` | the point of the exercise |
| `CNAME` | **at step 20, with the GitHub Pages custom domain, not at 23** — GitHub's domain-takeover warning |
| `scripts/deploy-staging.sh` (**351 lines**) + `scripts/qa/deploy_rsync_paths_check.mjs` | the publisher and its gate |
| `wrangler.toml` | P2 |
| `docs/CLOUDFLARE-CUTOVER.md` | **a second cutover checklist in `docs/`, telling him to do two wrong things.** Two checklists, one wrong, is the exact shape of the 2026-08-27 near-miss |
| `.claude/hooks/staging-is-not-main.cjs:16-18, 71-90` | prints *"Staging is a DIFFERENT REPOSITORY… there is no ancestry to measure"* into **every session, forever**. After this, `dev` is a branch and ancestry does answer it |
| `.claude/memory/DECISIONS.md:8-45` | the how-to-publish runbook, quoting the deleted script by line number. CLAUDE.md says *"answer from them"* |
| **`scripts/qa/crawl_sets.mjs:29-41`** | **the real subject.** It defines "what this site serves" as *every tracked `.html` Jekyll would publish* — **26 pages**, against Cloudflare's **9**. Four gates import it and would keep passing green about 17 pages that no longer exist. The first draft named only one of them |
| `scripts/qa/analytics_consent_check.mjs:76-78` | its disclaimer describes rsync and Jekyll's `.`/`_` rule |
| `robots.txt` | 6 `Disallow:` and 13 `Allow:` lines aimed at `/scripts/`, `/art-review/`, `/notes/`, `/4/` — none of which will exist |
| `.claude/settings.json:11-12` | permissions for the deleted deploy commands |
| `package.json` | `deploy:staging`, the gate chain entry, `gates.total: 104 → 103` |
| `scripts/where_is_my_work.mjs` | tells its reader staging is *"published by COPY"* |
| `docs/HARD-WON-LESSONS.md:184, 971` + `GIT-AND-DEPLOY.md` §1 + `.claude/CLAUDE.md` | **`doc_command_check.js` derives its doc list from the `docs/` directory**, so anything still naming the deleted script turns the gate red the moment it goes |

**And two internal pages leave the sites the moment Cloudflare serves them**, because
`build-site.mjs` excludes both by name: `cloudflare-cutover.html` and `two-machines.html`. Both
answer **200 on production today** — which also means `build-site.mjs:139`'s comment, *"curl
two-machines.html → HTTP 404"*, became false last night when `dev` merged to `main`. **A comment is
not a measurement.** The checklist Wyatt actually follows is therefore an Artifact, not a file in
this repository.

### One thing this cutover does NOT fix, and should be said out loud

**`npm run bump` is still manual.** This document's own reason #1 is a forgotten manual step, and
this one survives untouched: after the cutover, a push to `dev` publishes automatically carrying
whatever stamp date was last committed. The `@sha` will be unique, so the build is never ambiguous —
but the **date** is the half he reads at a glance, and a stamp carrying somebody else's date is the
stamp failing at its one job. Worth its own small piece of work, and it is not this one.

**The whole point, in one line:** after this, the way to show Wyatt something is to push it, and the
way to ship it to players is to merge it. There is no third thing to remember.
