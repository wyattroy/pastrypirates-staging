# Module-Loading & Local-Dev Contract

Pastry Pirates loads native ES modules with **no build step and no bundler**. This
document is the contract: what's required to run the game locally, how module
scripts are ordered relative to Firebase, and the `src/` layout Phases 8–11 will
fill in. Read this before touching `index.html`'s `<script>` tags or adding a new
file under `src/`.

## An HTTP server is required

Module scripts (`<script type="module">`) only load over an HTTP(S) origin. The
canonical local dev server is:

```bash
# `python3` on Mac / Linux; on WINDOWS the interpreter registers only as `python`.
python -m http.server 8000
```

Chosen because it ships with macOS and needs no install — this is the
no-dependency path and works even for a reader without npm. A convenience alias
is also available:

```bash
# BROKEN ON WINDOWS: `npm start` runs `python3` (package.json:21) — use the `python` line above.
npm start
```

Both start the same static file server rooted at the repo root. Visit
`http://localhost:8000/index.html` (or `http://localhost:8000/`) after starting
either one.

**One exception, for browser-verification passes only:** use a port you have
never loaded in that session, not 8000. Both Chrome and Safari cache ES modules
per URL, so reusing a port hands you the old `src/**/*.js` even after a hard
reload — and you then "verify" code that is not on disk. See
`docs/DRIVING-THE-GAME.md` §1. Port 8000 remains right for ordinary local dev.

## `file://` is unsupported, and why

Opening `index.html` directly from the filesystem (`file:///path/to/index.html`)
does **not** work for the module entry. Module scripts require a real HTTP
origin; loading from `file://` gives the page an opaque origin, and the browser
refuses to fetch the module graph from it. This is a **deliberate exclusion**,
recorded in `REQUIREMENTS.md`'s Out of Scope table — it is not a bug and not an
unimplemented feature, so please don't file it as either. Always use the HTTP
server above for local testing.

## `.js` MIME type expectations

Two environments serve this project's `.js` files today, and both are already
correct with no configuration needed:

- **Local dev** (`python3 -m http.server`) returns `text/javascript`.
- **Production** (this project's live host) returns `application/javascript; charset=utf-8`.

Both are valid JavaScript MIME types accepted by `<script type="module">` in
every evergreen browser. Do not change server configuration to "fix" the MIME
type — neither host needs it.

**The failure mode to know about:** if a host ever serves `.js` files as
`text/plain`, `application/octet-stream`, or any other non-JavaScript type, the
browser will refuse to execute the module. Safari does this more silently than
Chromium — often with no visible console error at all, just a page that never
finishes initializing. This is exactly why the load-order tripwires below exist:
they give you a page-load-time signal instead of a silent failure discovered
mid-game.

## The classic-before-module load-order rule

Module scripts (`<script type="module">`) are **always deferred** — they execute
only after the HTML parser finishes, and only after every non-deferred classic
script that precedes them has already run. Non-deferred classic scripts execute
synchronously, in document order, as the parser reaches them.

This project relies on that ordering directly: the Firebase compat script tags
at `index.html:25-26` (`firebase-app-compat.js`, `firebase-database-compat.js`)
are classic scripts, and they stay classic and stay ahead of the module entry
tag. That guarantees `firebase` is a defined global before any module code runs
— no init race, no timing dependency to get wrong.

**Standing tripwires catch a regression at page load, not mid-game:**

- `src/main.js` checks `typeof firebase === "undefined"` and logs a
  `console.error` naming itself if the Firebase global is missing when the
  module runs — a load-order violation reports itself immediately instead of
  surfacing as a broken multiplayer lobby.
- `src/main.js` sets `window.__pp_module_ok = true` (guarded by
  `typeof window !== "undefined"` so the same file also imports cleanly under
  plain Node with no DOM present). This is the machine-checkable marker that
  confirms the module entry actually executed — check it from a Chrome MCP
  session or the browser console.

## The extraction hazard — script tags must carry attributes

Any new `<script>` tag added to `index.html` **must carry attributes**
(`type="module"`, `src="..."`, etc.). This rule protected the classic
`<script>` region throughout Phases 8–11: several Node harnesses and standing
gates (`scripts/lib/js_region_tokenizer.js` and everything built on it —
`scripts/migrate_app_state.js`, `scripts/state_contract_check.js`,
`scripts/ui_contract_check.js`) located that region by searching for a bare,
attribute-less `<script>` open tag. Writing a second attribute-less `<script>`
anywhere in the file did not throw an error — it would silently become the
*first* match and every consumer would start extracting the wrong region.

**Phase 11 (11-07) deleted the bare `<script>` tag pair entirely** — the last
classic function moved out, the strangler-fig bridge came down with it, and
`index.html` now holds only markup, the Firebase compat classic scripts, the
JSON-LD block, and the one `<script type="module" src="src/main.js">` entry
(D-08). `locateClassicScriptRegion()` treats "no bare `<script>` tag found at
all" as the expected terminal state — an empty region, not an error — so
`ui_contract_check.js`'s classic-region-empty assertion and
`state_contract_check.js`'s per-name scans all degrade gracefully rather than
throwing. **The rule itself still stands going forward:** a bare, unattributed
`<script>` tag added to `index.html` today would be picked up by that same
"first bare tag" search and treated as a (spuriously non-empty) classic
region, so any future `<script>` tag must still carry attributes.

## The `src/` layout

Phase 7 shipped only `src/main.js` (the module entry) and
`src/module-contract.js` (a trivial proof-of-contract leaf import). Phase 8
filled in the first two tiers of this shape:

- `src/main.js` — the module entry point (exists since Phase 7) and, since
  Phase 11 (11-07), the sole composition root: imports every tier, wires the
  UI's injected-handler seam to real `src/orchestrator.js` functions, sets the
  one deliberate retained global (`window.revealMyRecipe`, D-05) and the
  standing debug hooks, and calls `boot()` directly — see "Startup order"
  below
- `src/shared/index.js` — the **leaf tier** (Phase 8): pure constants and pure
  helpers with no engine dependency — `ING_ALL`, every `*_IMG` image-path map,
  `EMOJI_IMG`/`emojify`, the `DIRS` family, `TET`, ingredient-label helpers,
  `man`, and friends. 120 named exports.
- `src/engine/index.js` — the **engine tier** (Phase 8): `rollStorm`,
  `PERSONALITY`/`AW`/`TW`/`DW`/`FISH_BASE`, `class Game`, `roundCfg`. 8 named
  exports. Imports from `src/shared/index.js`; **never** the reverse — shared
  is a leaf by construction, and `scripts/engine_contract_check.js` (see
  below) fails the build if that direction is ever violated.
- `src/ui/` — extracted rendering/UI code (Phase 11, 11-01 through 11-06):
  `recipe.js`, `util.js`, `board.js`, `panel.js`, `lobby.js`, `handlers.js`,
  `flow.js`, barreled through `src/ui/index.js`. Never imports `src/net/`
  (D-07), enforced by `scripts/module_graph_check.js` and
  `scripts/ui_contract_check.js`.
- `src/orchestrator.js` — the 44 net-caller/orchestration functions (sync,
  broadcast, battle, room-lifecycle, prompt/recovery/turn-flow, `boot`)
  extracted in Phase 11 (11-06). Its own tier is `main`, the same tier
  `src/main.js` occupies — the one place in the graph allowed to import both
  `src/net/` (to drive sync) and `src/ui/` (to render results) without
  tripping the `ui` tier's "never import `net`" rule, since `src/ui/` itself
  can never import a `main`-tier file.
- `src/net/` — extracted Firebase networking code (Phase 9). Five files:
  - `src/net/registry.js` — the `WatcherRegistry`. **The only file in the
    whole repository permitted to call `ref.on()` or `ref.off()`.** This is
    mechanically enforced, not conventional — see "The net contract check"
    below. No import of UI code, the engine tier, or any state belonging to
    a caller.
  - `src/net/watchers.js` — the eighteen `netWatch*` transport wrappers. Each
    builds the Firebase `Reference`, chooses a scope and a label, and hands
    the caller's own handler straight to `registry.attach()` as the callback
    itself. Contains no `.on()`/`.off()` call of its own.
  - `src/net/writers.js` — one function per Firebase write: a `set`, `push`,
    `update`, or `remove` on a path built the same way the pre-extraction
    call site built it, plus an optional caller-supplied error reporter.
  - `src/net/readers.js` — one-shot reads (`.get()`/`.transaction()`)
    returning the raw promise, so every caller's own `.val()` extraction,
    existence check, and error handling stays exactly where it was.
  - `src/net/index.js` — barrel plus Firebase app construction: the
    `firebaseConfig` object (copied byte for byte from the pre-extraction
    declaration), `cfgReady()`, `netInit()`, `netLeaveRoom()`, and re-exports
    of every watcher/writer/reader/registry-surface name, all `net`-prefixed.
- `src/state/index.js` — the app-state module (Phase 10). One file, one
  export: the single mutable `appState` object holding all 46 de-globalized
  app-state names. See "The `src/state/` module" below for the full account.

**Import specifiers must carry an explicit `.js` extension** — browser ESM
performs no extension resolution, unlike Node's CommonJS `require()`. An
extensionless specifier resolves under Node but 404s in the browser, which is
exactly the kind of silent-skip failure this contract exists to prevent.

## The networking handler-injection seam

This is the design decision a future reader is most likely to undo by
accident, so it is stated here as a rule with a reason.

`src/net/` owns transport only: building `Reference`s, attaching and
detaching listeners, reading, and writing. Every watcher callback's *body* —
every UI call (`setFlipCoin`, `showNarration`, `renderBattleFromSnap`, and
friends), every read of `game`/`mySeat`/`isHost`/`replaying` — stays exactly
where it was, in the classic script, and is handed into `src/net/`'s
`netWatchX(db, room, handler)` functions as a plain function argument.
`src/net/` therefore executes UI and app-state logic indirectly, once
removed, through a caller-supplied function — never through an import.

**The direction is explicit and one-way: the UI may import `src/net/`;
`src/net/` may never import the UI.** `scripts/net_contract_check.js` (below)
makes that direction a standing build failure, not a review comment.

**Dispatch is synchronous, and that is load-bearing, not incidental.** The
wrapped callback calls the caller's `handler` directly, in the same tick as
the raw Firebase callback fires — no emitter, no `Promise`, no microtask
between them anywhere in `src/net/`. This matters because a guard flag
(`replaying`, for instance) checked inside a handler could otherwise change
value between the Firebase callback firing and the handler actually running,
which would corrupt a replay rebuild with no visible symptom at the moment
it happens. An event emitter was considered and rejected for the same
reason `src/net/` avoids one everywhere else: it would be technically
synchronous too, but it adds an indirection layer with no benefit here,
since every watcher has exactly one consumer, and it makes an accidental
deferral easy to introduce later without anyone noticing at the call site.

## The ui -> orchestration injected-handler seam (src/ui/handlers.js)

Distinct from the net -> UI handler injection described above (that's `src/net/`'s watchers
calling a caller-supplied handler; this is the reverse direction). `src/ui/handlers.js` exports a
tiny `setNetHandlers(h)` / `netHandlers()` pair — a plain object, populated once by
`src/main.js`, read via a function (never the object directly) so every caller always sees the
live handler set regardless of module-load order.

**Why it exists at all:** `src/ui/` may never import `src/net/` (D-07) or `src/orchestrator.js`
(main tier — the composition root that itself imports `src/net/`) — `scripts/module_graph_check.js`
makes both directions a standing build failure. But UI code legitimately needs to TRIGGER several
`src/orchestrator.js` operations (broadcast a narration, log a decision, begin a game, broadcast a
coin flip, render a battle, …). `src/main.js` — which imports every tier — wires each of these as
a named key on the shared handler object; the UI function calls `netHandlers().onXxx(...)` instead
of importing `orchestrator.xxx` directly.

**11-07 (bridge deletion) also uses this SAME mechanism for a second, non-net-adjacent case:** a
few `src/ui/util.js` functions need to call a rendering function that lives in a SIBLING ui module
(`src/ui/panel.js`'s `liveRender`/`flash`/`setClockUI`/`narrateLastEvent`, `src/ui/board.js`'s
`popEmoji`/`render`) — but `util.js` is itself imported BY those sibling modules, so importing them
back would close a cycle `module_graph_check.js`'s "no import cycle" assertion forbids. Routing
through this same seam adds no import edge at all (it's a runtime property lookup on a plain
object), so it resolves the cycle risk identically to the ui->orchestration case, even though
nothing net-adjacent is involved. See `src/main.js`'s own `setNetHandlers({...})` call for the
full, current key -> function mapping, and `src/ui/handlers.js`'s/`src/ui/util.js`'s own header
comments for the reasoning behind each addition.

## The two listener scopes

Exactly two scopes exist, and the distinction is the single most likely
well-intentioned mistake a later phase could make here.

- **`"room"`** — every watcher tied to a specific room's lifetime. Torn down
  together, all at once, when a room is left (`netLeaveRoom()` /
  `registry.detachRoom()`).
- **`"session"`** — the connection and presence watchers
  (`netWatchConnected`, `netWatchPresence`). Attached once per page life and
  **must survive a room leave**, because they track the browser's connection
  to Firebase itself, not any particular room. Tearing them down alongside
  room-scoped listeners would be a regression dressed as a fix —
  `registry.detachRoom()` only ever touches `"room"`-scoped entries by
  construction, precisely to prevent that.

## The eighteen-watcher count, and why it isn't fourteen

`src/net/watchers.js` exports eighteen `netWatch*` transport wrappers,
attaching through the registry with exactly eighteen `registry.attach()`
calls. This figure was corrected from a stale "fourteen watchers, one torn
down" in the roadmap and requirements docs after a direct grep of
`index.html` on 2026-07-24 turned up eighteen live `.on()` call sites and two
`.off()` call sites. Both planning documents were corrected at that time.
`scripts/net_contract_check.js` now pins the figure mechanically: if a
document elsewhere in this repository is ever found to still say fourteen,
this section — and the check's own hardcoded inventory list, sourced from
the corrected count — is the current number.

## `window.__pp_net_debug`

A third standing browser tripwire, alongside `window.__pp_module_ok` and
`window.__pp_boot_count` (see "Standing browser tripwires" below). Set in
`src/main.js` inside the same `typeof window` guard as the other two. Shape:

```
{ size(scope) -> number, list() -> array, detachRoom() -> number, detachAll() -> number }
```

It exposes the registry's own bookkeeping directly. Because the registry is
mechanically the only file permitted to attach or detach a Firebase
listener (enforced by `scripts/net_contract_check.js`'s sole-listener-site
assertion), that bookkeeping *is* the listener ground truth — there is no
other source of truth for "how many listeners are actually live right now"
to disagree with it.

**It carried no bridge-removal token, deliberately.** Phase 11 (11-07)
removed the temporary bridge by grepping for that token on every line that
carried it; this hook was built to outlive that removal, and did. It is the
named, documented seed for GLOBAL-03's "single documented debug mechanism"
requirement in Phase 10, so that phase did not need to invent or rename one.

## The net contract check

`scripts/net_contract_check.js` is the standing, `npm test`-wired gate for
SPLIT-04, NET-01, and NET-02 — mirroring `scripts/engine_contract_check.js`'s
structure (multiple named assertions, one run reports every failure, fixed
scope excluding `scripts/` itself) with one deliberate difference from that
predecessor: **it performs no comment stripping, anywhere.**
`engine_contract_check.js` strips from the first `//` to end of line before
matching, and its own header asks for that assumption to be reconfirmed if a
URL-bearing string is ever added to the files it scans. `src/net/index.js`
now contains the Firebase `databaseURL`, which makes that exact false
negative live rather than theoretical — a real violation appearing after a
`://`-bearing literal on the same physical line would be silently truncated
away by that stripping approach before the match pattern ever reached it.
`scripts/net_contract_check.js` matches raw, unstripped lines instead and
accepts the occasional false positive inside a comment on purpose.

Five assertions, all run before the script exits so one run reports every
problem: the registry is the sole file in the repository permitted to touch
the Firebase listener API; `src/net/` references no UI name; `src/net/`
references no app-state global; `src/net/` imports neither `src/ui/` nor
`src/engine/`; and `src/net/watchers.js` exports all eighteen watchers with
exactly eighteen `registry.attach()` calls.

**The consequence for contributors:** a comment inside `src/net/` that
happens to name a UI function or an app-state global will fail the build.
The fix is to reword the comment — describe the boundary in terms of roles
("the caller's handler", "the classic script's own state") rather than by
naming the identifiers on the check's denylists — not to weaken the check.

## The `src/state/` module

Phase 10 (App State & De-globalization) replaces ~40 bare, reassigned
classic-script globals (`game`, `room`, `db`, `myId`, `mySeat`, …) with one
plain, exported object: `src/state/index.js`'s `appState`. GLOBAL-01's
correctness requirement — every read and write site resolves through one
documented mechanism, with no silent shadow — sits on top of the same
bridge Phase 8 built, extended in a load-bearing way for this phase's
specific problem.

**Why a snapshot bridge (Phase 8's global-object spread) was insufficient
here.** Phase 8's bridge was correct for read-only constants — values that
never change after `boot()` runs. Phase 10's globals are mutable and
reassigned throughout a game (`room = code`, `game = new Game(...)`, `mySeat
= seat`, …). A snapshot copies field VALUES once; it cannot observe a later
reassignment, because nothing holds a live reference back to the classic
script's own binding. `src/main.js` sidestepped the copy step entirely by
publishing `appState` onto that same historical bridge mechanism BY
REFERENCE, so a classic-script write like `appState.room = code` mutated the
one object every holder — this module, the (now-deleted, Phase 11) bridge,
the debug hook below, any Phase 11 consumer — shared a reference to. See the
module's own file header for the full mechanism.

**The `appState` binding itself is never reassigned — only its properties
mutate.** `appState = {...}` anywhere (including inside
`src/state/index.js`) would reintroduce the snapshot bug one level deeper:
every other holder's reference would keep pointing at the OLD object,
silently desyncing from whatever replaced it. `scripts/state_contract_check.js`
enforces this mechanically (assertion 5) — see "The state contract check"
below.

**Named `appState`, not `state`.** RESEARCH.md and CONTEXT.md illustrate the
container as `state`, but the classic script already uses `state` as a local
parameter/variable name in five unrelated places (`broadcastFlip(state)`,
`setFlipCoin(state)`, `coinHTML(state, ...)`, `setRecoveryState(state)`, and
a local `const state=...` inside `setClockUI()`). The migration tool has no
scope analysis, so publishing the bridge as `state` would have made every
rewritten `state.room` inside those functions silently read `.room` off the
wrong local variable — no syntax error, just a wrong value at runtime.
`appState` was grepped and confirmed to have zero prior occurrences before
being adopted (10-01-SUMMARY.md's Deviations section has the full account).

**The tokenizer-based migration and the string-collision hazard it guards.**
`scripts/lib/js_region_tokenizer.js` is a zero-dependency,
character-by-character tokenizer for the classic-script region, built
because a blind regex pass over ~3800 lines of pre-existing code risks
silently rewriting an app-state name's LOOKALIKE inside a string or comment
(e.g. the word "room" appearing in narration text) instead of only real
identifier-position occurrences. It distinguishes code from strings,
comments, AND regex literals (a regex mode was added mid-migration after
`escHtml`'s `/[&<>"]/g` — a literal `"` inside a character class — corrupted
an earlier, regex-naive version's string/comment classification), and
treats template-literal interpolations (`${...}`) as code, since real
app-state reads occur inside them in this file (e.g. `${game.round}`).
`scripts/migrate_app_state.js` builds its own
`--migrate`/`--extract-strings`/`--check-names` modes on top of this shared
tokenizer, rather than each caller (including
`scripts/state_contract_check.js`) rolling its own classifier.

**Purity bar matches `src/engine/` and `src/shared/`.** No
`document`/`window`/`firebase`/`localStorage`/`Date.now`/`Math.random`/
`globalThis`/`new Function` reference inside `src/state/index.js` itself —
mechanically enforced by `scripts/state_contract_check.js`'s assertion 4.
"Purity" here means the module doesn't reach out to the DOM/network on its
own, not that the state is immutable — the state is emphatically mutable,
by every consumer, through property writes.

**No getter/setter/Proxy on `appState` itself** — plain data properties
only. An accessor with a side effect, or a getter that allocates, could
change the timing of a determinism-critical read/write; a plain object's
property access is synchronous and order-preserving by the JS spec with
zero indirection, which is exactly what the replay/determinism guarantee
requires.

**The Phase-11-greppable seam (historical).** Like the rest of the bridge,
`appState`'s bridge entry was a removal target once the UI extraction gave
every consumer its own import — and Phase 11 (11-07) removed it. Every
`src/ui/`/`src/orchestrator.js` consumer now imports `{ appState }` directly
from `src/state/index.js` (a live ES-module binding, not a bridge-published
copy), which is a strictly stronger guarantee than the bridge ever provided:
no reference-vs-copy distinction to break, because there is no intermediate
publish step left at all.

## The state contract check

`scripts/state_contract_check.js` is the standing, `npm test`-wired gate for
GLOBAL-01 and GLOBAL-03 — mirroring `scripts/engine_contract_check.js` and
`scripts/net_contract_check.js`'s structure (multiple named assertions, one
run reports every failure, fixed scope, no comment-stripping anywhere —
index.html's classic-script region contains
`SVGNS="http://www.w3.org/2000/svg"`, a `://`-bearing string literal that a
naive stripper would truncate before a real match on the same line could be
seen). Five assertions, all run before the script exits so one run reports
every problem:

1. **No leftover top-level declaration** — none of the 46 app-state names
   has a remaining `let`/`const`/`var` declarator anywhere in index.html's
   classic-script region.
2. **No leftover bare usage** — zero remaining un-migrated
   identifier-position occurrences of any of the 46 names.
3. **Debug-hook naming convention (GLOBAL-03)** — every `window.__pp_*`
   assignment in `src/main.js` (direct or the indirect
   `window[MODULE_OK_FLAG]` form) is one of exactly the four allowlisted
   names in "Standing browser debug hooks" below, AND all four are actually
   present — an accidentally deleted hook is as much a violation as an
   ad-hoc extra one.
4. **`src/state/index.js` purity** — see above.
5. **`appState` binding never reassigned** — see above.

Wired into `npm test` immediately after `scripts/net_contract_check.js` as
of Phase 10 Plan 06, once all 46 names were migrated (10-02 through 10-05)
and all five assertions could legitimately go green together. Its red-proof
capability was demonstrated for all five assertions during that plan: each
was independently faulted, confirmed to fail with a correctly named
violation and `exit 1`, then reverted.

## Standing browser debug hooks (GLOBAL-03)

D-09's "single documented mechanism for test/debug state access" is these
four names — the entire `window.__pp_*` surface in this codebase, and
nothing else. `scripts/state_contract_check.js`'s assertion 3 mechanically
enforces both halves of that promise: a fifth ad-hoc `window.__pp_*` global
fails the build, and so does one of the four going missing.

| Hook | Shape | Purpose |
|---|---|---|
| `window.__pp_module_ok` | `true` | Confirms `src/main.js` actually executed — the load-order tripwire (see "Standing browser tripwires" below). |
| `window.__pp_boot_count` | number | Counts `src/main.js` executions; proves the module runs exactly once per page load. |
| `window.__pp_net_debug` | `{ size, list, detachRoom, detachAll }` | Exposes `src/net/registry.js`'s own listener bookkeeping — the ground truth for how many Firebase listeners are live right now (see "`window.__pp_net_debug`" below). |
| `window.__pp_app_state_debug` | function, `() -> object` | **Read-only.** Call it to get a fresh `{...appState}` shallow copy — never the live `appState` object — so a console/MCP session can inspect state without any risk of writing back into authoritative game state. |

`__pp_module_ok` and `__pp_boot_count` are set as direct `window.*`
assignments in `src/main.js`; `__pp_module_ok` specifically goes through the
one indirect `window[MODULE_OK_FLAG] = true` form (`MODULE_OK_FLAG` is
imported from `src/module-contract.js` and resolves to the string
`"__pp_module_ok"`), which is why the contract check has to resolve that
identifier rather than pattern-match on it directly.

### `window.revealMyRecipe` — the one retained non-debug global (D-05)

Not a debug hook — a real, permanent, production-facing global, and the
**only** one `scripts/ui_contract_check.js`'s retained-globals-allowlist
assertion permits under `src/` (the four hooks above are the other four
entries on that same allowlist). `src/ui/board.js`'s rendered
`checkRecipeBtn` markup carries a literal `onclick="revealMyRecipe()"`
attribute, built into an `innerHTML` string at render time — inline
HTML-attribute event handlers always evaluate their body in the *global*
scope, and an ES-module export is never automatically reachable there. Set
once in `src/main.js` as `window.revealMyRecipe = ui.revealMyRecipe;`, named
and documented the same way as the four debug hooks, honoring GLOBAL-02/03's
"single documented mechanism" principle rather than adding an ad-hoc
undocumented global. The function itself is defined in `src/ui/flow.js` and
re-exported through `src/ui/index.js`.

## What deliberately did not move into `src/net/`

- **The error-surfacing helper that drives the visible "sync trouble"
  banner.** It toggles a DOM element, which makes it UI. It stays in
  `index.html` and is passed into every `src/net/writers.js` function that
  needs it as a plain function argument, exactly as it was passed to
  `.catch(...)` before the extraction.
- **The database handle itself.** Was `let db=null, ...`, a classic-script
  global in `index.html`, when this section was first written for Phase 9.
  Phase 10 de-globalized it under GLOBAL-01, along with the other ~45
  app-state names — `db` is now `appState.db`, read and written through
  `src/state/index.js`'s module (see "The `src/state/` module" above).
  Every `src/net/` function still receives `db` as a plain argument at
  every call site and never reads a module-level or window-level handle
  itself — only the CALLER's own binding changed shape, from a bare
  identifier to `appState.db`, not `src/net/`'s own argument-passing
  contract.
- **Room and lobby orchestration.** `createRoom()`, `joinRoom()`,
  `watchRoom()`, `startGame()`, and `resumeHostGame()` keep their
  orchestration logic in `index.html`; only their Firebase transport calls
  route through `src/net/`.

A reader finding any of these three still in `index.html` should read this
list as confirmation, not as an oversight.

## The strangler-fig global bridge (Phase 8 — deleted in Phase 11, 11-07)

**This section is now a historical record. The bridge described below no
longer exists anywhere in this codebase.**

Module scripts are always deferred (see "classic-before-module" above), but
from Phase 8 through Phase 11 the still-classic UI/networking code in
`index.html` referenced `Game`, `roundCfg`, `DIRS`, and (eventually) ~150+
other bare identifiers that, before Phase 8, were declared directly in that
same classic script. Once the engine and shared tiers moved into real
modules, those bare identifiers would otherwise have been undefined by the
time the classic script ran.

`src/main.js` bridged the gap by publishing every moved tier's exports onto
**two** places: a single namespaced `window.PP` object, and `globalThis`
itself (via a spread of that object onto the global object), so every
pre-existing bare-identifier call site in the classic script kept resolving
with zero edits to that code as each wave moved more functions into modules.

Both mechanisms existed because the classic script was never rewritten to
reference the bridge object's properties explicitly (D-15: introduce the
minimum bridge surface needed to keep the game running at every phase
boundary, don't pre-emptively migrate call sites) — each wave's job was to
extract functions into modules with real imports, not to touch code that
hadn't moved yet.

**The bridge was temporary and named for exactly that reason.** Every line
that populated it carried a literal removal-marker token in a trailing
comment, so its eventual deletion was a grep, not an archaeology project —
`scripts/ui_contract_check.js`'s "bridge is gone" assertion still checks for
that token's absence today, as a standing gate against reintroduction.

**Phase 11 (11-07) deleted it.** Once the last classic function moved into
`src/orchestrator.js` (11-06) and the classic `<script>` region held zero
top-level function declarations, this wave removed the bridge-assembly
object, its two publish statements, and the classic `<script>` region itself
in a single gated, one-way commit — verified by `ui_contract_check.js`'s four
mechanical assertions (no leftover bridge tag, no leftover
`globalThis`-spread call, the classic region is empty, and only the single
retained global below survives) plus a full Chrome solo + two-tab
click-through, since a missed bare-global read fails silently as a runtime
`ReferenceError` on a code path the determinism corpus never exercises.

## Startup order (why it's load-bearing)

`src/main.js` drives the following sequence, in this order, every page load
(post-11-07, bridge-free):

1. Wire `src/ui/`'s injected-handler seam (`ui.setNetHandlers(...)`) to real
   `src/orchestrator.js` function references — no `globalThis` indirection.
2. Set the standing debug hooks (`window.__pp_net_debug`,
   `window.__pp_app_state_debug`) and the single deliberate retained global,
   `window.revealMyRecipe` (D-05) — see "Standing browser debug hooks" below.
3. Register the top-level browser-lifecycle listeners that used to live as
   bare statements in the classic script (auto-pause on `visibilitychange`,
   the 500ms `setClockUI` tick, `resize`/`orientationchange` re-sizing) —
   moved here in 11-07 since they were never function declarations and so
   had no other extraction destination.
4. Call `ui.applyEngineBootstrapEffects()` — the three relocated D-06
   impurities (the two `--clock-img`/`--flip-socket-img` CSS custom-property
   writes and the `document.body.innerHTML = emojify(...)` rewrite).
5. Call `ui.attachPastryArt()` — the `RECIPE_BOOK` art-attachment parse-time
   hazard.
6. Call `boot()` directly — inversion of control (D-14), formalized in 11-06:
   the classic script no longer self-invokes `boot()` (there is no classic
   script left to do so); the module triggers it once every step above has
   run.

The order matters because step 4's `document.body.innerHTML` rewrite must run
**before** `boot()`'s element-lookup and event-wiring (`wireWelcome`,
`wireLobby`, `wireRecipeModal`, …) — rewriting `body.innerHTML` after those
listeners are attached would silently detach them, since the HTML parser
treats an `innerHTML` assignment as a fresh subtree with no memory of
listeners bound to the nodes it replaces.

## Standing browser tripwires

Two markers confirm the module entry ran correctly, checkable from a Chrome
MCP session or the browser console:

- **`window.__pp_module_ok`** — set `true` as soon as `src/main.js` runs (see
  "classic-before-module load-order rule" above). Catches a load-order
  regression: if this is ever `undefined` on a loaded page, the module never
  executed at all.
- **`window.__pp_boot_count`** — incremented once per `src/main.js` execution.
  Introduced in Phase 8 because `applyEngineBootstrapEffects()`'s
  `document.body.innerHTML` rewrite now runs at *module time* instead of
  mid-parse, re-serializing and re-parsing the whole `<body>` — which could,
  in principle, cause `src/main.js` to be re-entered. This counter proves the
  module still runs exactly once (`=== 1` on a normal page load) rather than
  assuming it from the absence of a visible symptom.

## The retired `<script>`/`escHtml` slice boundaries

Before Phase 8, `scripts/lib/load_engine.js` obtained the engine by slicing
`index.html` text between the inline `<script>` tag (`:859`) and the
`function escHtml` marker (`:1827`), then evaluating that slice in a `node:vm`
sandbox. Phase 8 replaced that with a plain native
`import * as engine from "../../src/engine/index.js"` — `load_engine.js` no
longer reads `index.html` at all, so those two markers are retired as slice
boundaries.

**This is a separate concern from the bare-`<script>`-tag count rule above,
which still applies.** That rule exists independently of how `load_engine.js`
obtains the engine — it protects against a *second* attribute-less `<script>`
tag ever being added to `index.html`, which would be confusing regardless of
whether anything still parses for it today.

## The engine contract check

`scripts/engine_contract_check.js` is the standing, `npm test`-wired gate for
two of this doc's own invariants: engine purity (zero `document`/`window`/
`firebase`/`localStorage`/`Date.now`/`Math.random`/`globalThis`/`new Function`
references in `src/engine/*.js` and `src/shared/*.js`) and the
`ORDER IS LOAD-BEARING` annotation coverage on every order-reaching construct.
It also asserts the `src/shared/` → `src/engine/` import direction never
reverses, and that every symbol moved out of `index.html` during Phase 8 is
exported by exactly one of the two barrels with no leftover top-level
declaration shadowing it in `index.html`. A one-time grep pasted into a plan
summary proves nothing about Phase 9 onward; this script is what makes that
protection standing rather than aspirational.

## The no-undef check (module-internal D-04)

`scripts/no_undef_check.js` is the standing, `npm test`-wired gate added in 11-07, directly in
response to a gap the bridge deletion exposed: `ui_contract_check.js`'s four assertions,
`module_graph_check.js`, and every other contract check in this codebase verify things ABOUT
imports/exports/tags — none of them do undeclared-identifier analysis INSIDE a module, and none
of them execute a runtime code path. A missed bare-global read (one the deleted bridge used to
silently satisfy) can pass every one of those checks green and still throw a `ReferenceError` the
moment a real browser executes that exact line — which is exactly what happened: `npm test` was
fully green, and a live Chrome session still hit two of them (`renderDecorativeBoard` ->
`buildPlayerRows`, `wireWelcome`'s Play Solo button -> `startSinglePlayer`).

This script closes that gap mechanically, for every `.js` file under `src/`, independent of a
browser session: for each file, it masks out string/comment bodies (reusing
`scripts/lib/js_region_tokenizer.js`'s tokenizer — that tokenizer has never been HTML-specific),
collects a file-wide set of every locally bound name (imports, function/class declarations,
every `const`/`let`/`var` declarator's binding pattern including nested destructuring, every
function/arrow/method parameter, `catch`/`for...of` bindings), and flags any `NAME(` call-position
identifier that is neither in that set nor on a fixed browser/language-global allowlist.

**Deliberately scoped to CALL expressions, not full scope-correct analysis.** This codebase has no
build step and no AST-parser dependency (the zero-dependency stance every prior phase has kept);
a regex-based, file-wide-flat binding collection can only ever be over-permissive (never flags
legitimate code) in the shadowing direction, which is the right tradeoff for a merge gate — a
false positive here would train contributors to stop trusting it, while a false negative still
leaves the Chrome click-through as the backstop this exact risk class has always required (see
"The strangler-fig global bridge" above).

Wired into `npm test` immediately after `scripts/ui_contract_check.js`. Reports zero findings as
of 11-07's fix (which extended `src/ui/handlers.js`'s injected-handler seam — see "The ui ->
orchestration injected-handler seam" above — to cover every edge this check found, plus two
direct-import fixes and two function relocations for the cases that needed neither a seam nor an
import).

## Minimum Node version

The Node-based test harnesses (`scripts/determinism_baseline.js`,
`scripts/real_game_test.js`, `scripts/dlog_replay_test.js`) use top-level
`await` and `node:`-prefixed core module imports. These require **Node 18 or
newer**. Development and research for this phase were exercised against Node
v25.9.0; Node 18+ is the documented floor.

## Quick reference

| Question | Answer |
|---|---|
| How do I run the game locally? | `python3 -m http.server 8000` (or `npm start`), then open `http://localhost:8000/` |
| Can I just open `index.html` from disk? | No — module scripts require an HTTP origin. See "`file://` is unsupported" above. |
| Does the server need special config for `.js` files? | No — both the local dev server and production already serve valid JS MIME types. |
| Why does Firebase load before the module entry? | Classic scripts execute synchronously in document order; module scripts always defer. See "classic-before-module" above. |
| How do I know the module entry actually ran? | `window.__pp_module_ok === true` in the browser console. |
| Can I add a bare `<script>` tag? | No — see "The extraction hazard" above. Always add attributes. |
| Is there still a global bridge? | No — Phase 11 (11-07) deleted it. Every symbol resolves through a real ES-module import; `window.revealMyRecipe` plus the 4 `window.__pp_*` debug hooks are the only intentional globals left. See "Standing browser debug hooks" above. |
