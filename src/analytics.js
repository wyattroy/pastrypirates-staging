/* analytics.js — Google Analytics, COOKIELESS, on the three public pages Wyatt chose. ONE file,
 * loaded by each page in one line; never a snippet pasted three times.
 *
 * ==========================================================================================
 *  HIS TWO RULINGS, BOTH 2026-09-03, BOTH ANSWERED HERE
 * ==========================================================================================
 *
 *  WHICH PAGES — *"The public pages only — the game, About and Rules."* He declined "every page
 *  including /classic" (it would mix a frozen v1's traffic into the launch numbers) and declined
 *  "the game page only" (which leaves About and Rules measured by nothing, the actual gap).
 *
 *  COOKIE OR NO COOKIE — *"Cookieless, no banner — you keep the referrer, the geography and the
 *  per-page numbers, set no cookie, and no child is asked to consent."* He declined both banner
 *  options. **Children play this game, which is what makes this more than a formality.**
 *
 * ⛔ THE ORDER BELOW IS THE WHOLE SAFETY PROPERTY, NOT A STYLE CHOICE. The consent default must be
 *  pushed onto the dataLayer BEFORE googletagmanager's script is fetched. Load the tag first and it
 *  has already decided it may store, and the denial arrives too late to matter — a page that looks
 *  identical, passes every eye, and quietly writes a cookie onto a child's device. That is why this
 *  is one file with a fixed sequence rather than three hand-pasted copies that can each drift.
 *  `scripts/qa/analytics_consent_check.mjs` fails the build on the order, not merely the presence.
 *
 *  WHAT "COOKIELESS" ACTUALLY BUYS AND COSTS — verified against Google's live documentation
 *  2026-09-03, not remembered: with all four storage types denied, consent-aware tags store nothing
 *  on the device and send COOKIELESS PINGS instead. Page views, referrer and coarse geography still
 *  arrive; unique-visitor counts do not — which is exactly why it fits here, because his own
 *  player-count console already answers "how many people". Data still reaches Google. "No cookie"
 *  is not "no data", and saying otherwise to him would be the comfortable lie.
 *
 * ⛔ AND IT NEVER FIRES OUTSIDE THE LIVE DOMAIN. A sea trial sails ten voyages an evening and the
 *  driver loads these pages hundreds of times; staging exists precisely so he can play a build that
 *  is not the real one. Counting either would make the first number he ever reads from this
 *  property a fiction, and he would have no way to tell. Production hostname only — so his own
 *  testing can never inflate his own figures.
 */

/* THE ID LIVES HERE, ONCE. It also appears in `src/net/index.js`'s firebaseConfig, whose own header
   forbids retyping it — so rather than a second hand-typed copy, `analytics_consent_check.mjs`
   asserts the two agree and fails the build when they drift. One place is the ideal; two places a
   gate compares is the honest second best when neither file may import the other. */
export const MEASUREMENT_ID = "G-2KK6EZDZSP";

/* The live game, and nothing else. `staging.playpastrypirates.com` is a DIFFERENT hostname and is
   deliberately excluded by the equality — a substring test would have caught it, which is the bug
   this comparison is written to avoid. */
export const LIVE_HOST = "playpastrypirates.com";

export function analyticsShouldRun(hostname) {
  return String(hostname) === LIVE_HOST;
}

export function installAnalytics(win = typeof window !== "undefined" ? window : null) {
  if (!win || !win.document) return "no-document";
  if (!analyticsShouldRun(win.location && win.location.hostname)) return "not-live-host";
  if (win.__ppAnalyticsInstalled) return "already-installed";
  win.__ppAnalyticsInstalled = true;

  win.dataLayer = win.dataLayer || [];
  function gtag() { win.dataLayer.push(arguments); }
  win.gtag = win.gtag || gtag;

  /* ⛔ STEP 1, AND IT MUST BE STEP 1. All four storage types denied by default. There is no code
     path anywhere in this project that grants one — there is no banner, because he ruled there
     would not be one, so nothing exists to change its mind later. */
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });

  /* STEP 2 — only now is the tag allowed to load. */
  const s = win.document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  (win.document.head || win.document.documentElement).appendChild(s);

  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID);
  return "installed";
}

installAnalytics();
