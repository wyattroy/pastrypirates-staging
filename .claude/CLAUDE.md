## Narration box: content appears TOP TO BOTTOM, in that order

**Standing design rule — Wyatt, 2026-08-01:** *"Everything in the narration box should appear from
top to bottom, in that order. Remember this intent."*

Whatever sits highest in the box is revealed first, then the next thing down. Concretely:

> **back button → message text → action buttons → italic helper text**

That is the DOM order `localAsk()` builds in `src/ui/flow.js` — `.apBack`, `.apMsg`, `.apBtns`,
`.apSub` — and the reveal must follow it.

This is not a per-bug preference. It governs anything added to `#actionPanel` in future — a new
element's reveal order follows its visual position, and does not need re-deciding each time. Two
separate playtest findings on 2026-08-01 traced back to violating it: the italic helper text painted
instantly, ahead of the message it explains, and the back button appeared after the message instead
of before it.

## Git: always fetch before you read git state

**`git fetch` FIRST — before reading, comparing, or concluding anything about a branch.** Not once
per task; once per time you are about to trust what git tells you.

Both `main` and `origin/main` are **local caches**. `origin/main` is not the remote — it is this
machine's last-downloaded snapshot of it, and it is stale until you fetch. Reading either one without
fetching can be arbitrarily wrong.

```bash
git fetch origin
```

**This has cost real time on this project, twice.** On 2026-08-01 the local `main` ref was parked at
a v1.0 snapshot — 457 commits behind, no `src/` directory at all — because nobody had pulled after
merging on GitHub. Reading it produced a confident and completely wrong conclusion ("main is a dead
v1.0 snapshot; ignore it"), which was then handed to four parallel sessions as instructions. GitHub
was healthy the entire time. Only the local copy was frozen.

**Tells that you are reading a stale ref — stop and fetch before concluding:**

- A diff against the base is absurdly large (hundreds of commits).
- `src/` appears as *newly added* — it has existed since the v1.1 refactor.
- A milestone you know shipped looks unfinished or absent.
- A branch appears wildly behind for no reason anyone can explain.

**After merging a pull request on GitHub, pull locally.** The merge happens on GitHub's servers; this
machine does not know until told. Missing this step is what caused the above, across two milestones.

```bash
git pull
```

**Never report git state from memory or from earlier in the session.** Re-run the command. Refs move —
including because of something you did yourself.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Pastry Pirates**

Pastry Pirates is a browser-based, pirate-themed pastry board game playable solo (against AI captains) or in real-time multiplayer via Firebase sync. Players sail a grid of islands gathering ingredients, trading, battling, fishing, and racing to bake a winning recipe. This milestone is a focused edit pass — a 15-item punch list from live playtesting covering two urgent bugs plus battle, AI, narration, UI/UX, bot, and end-of-voyage improvements.

**Core Value:** The game must stay playable and fair end-to-end in both Safari and multiplayer — a storm must not crash the game, and pausing the multiplayer timer must never destroy game state.

### Constraints

- **Tech stack**: Vanilla HTML/CSS/JS in `index.html`, Firebase Realtime DB for multiplayer — edits happen in place, no framework introduction
- **Compatibility**: Must run correctly in Safari (the storm perf bug is Safari-specific) and Chrome
- **Determinism**: The multiplayer deterministic engine + replay must remain intact — timer/pause fixes must not break lockstep state
- **Approval gates**: End-of-voyage badge redesign and storm-text rewrite require Wyatt's explicit sign-off before/within implementation

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- JavaScript (ES6+) - Game engine, UI rendering, real-time sync
- HTML5 - Page markup and structure
- CSS3 - Styling, animations, responsive design
- Python 3 - Simulation engine for game balance research and strategy analysis

## Runtime

- Browser (Chrome, Safari, Firefox, Edge)
- Python 3 (for offline simulation)
- None (browser build uses CDN and inline scripts)
- Python standard library only (no external dependencies)

## Frameworks

- Firebase SDK v12.15.0 (compat) - Realtime database for multiplayer sync
- No framework - vanilla HTML/CSS/JavaScript with inline styles and scripts
- `cocoa_pirates_sim.py` - Python-based game simulator (no external frameworks)

## Key Dependencies

- Firebase Realtime Database v12.15.0 - Multiplayer game state synchronization

## Configuration

- Firebase config embedded in `index.html` (lines 4542-4551)
- Contains public API key and database URL (intended public exposure per docs)
- No environment variables required
- Single HTML file served directly (no build step)
- All JavaScript inline in `<script>` tags
- CSS embedded in `<style>` tags
- Assets served from `/assets/` directory

## Platform Requirements

- Text editor for HTML/CSS/JS editing
- Python 3.x for running `cocoa_pirates_sim.py`
- Git for version control
- Static hosting (GitHub Pages, Netlify, or any HTTP server)
- Firebase Realtime Database project (free Spark tier sufficient)
- HTTPS recommended for production (Firebase config references public domain)

## Asset Pipeline

- PNG format for custom ingredient icons (`/assets/ingredients/*.png`)
- PNG format for UI icons (`/assets/icons/*.png`)
- PNG format for board elements (`/assets/board.png`, `/assets/dock.png`, etc.)
- PNG format for animated elements (compass dial, wind arrow, etc.)
- Fallback emoji rendering if image assets fail to load (`iconAt()` function in index.html line ~807)
- Static files served from repo root and `/assets/` subdirectories
- No image optimization or build step

## Compatibility Notes

- Modern browsers (ES6 support required)
- CSS Grid and Flexbox required
- Service Worker optional (not used)
- LocalStorage required for host-game recovery feature
- API key restricted to `wyattroy.github.io/*`, `localhost/*`, and `playpastrypirates.com/*` domains
- File protocol (`file://`) works for game but may show warnings on Firebase Auth calls

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- HTML/CSS/JS combined in single file: `index.html`
- Utility scripts use descriptive names: `scripts/battle_sim.js`, `scripts/real_game_test.js`
- Asset subdirectories organize by type: `assets/ingredients/`, `assets/icons/`, `assets/boats/`, `assets/islands/`, `assets/compass/`, `assets/clock/`
- camelCase consistently used for all function and method names
- Action-verb prefix pattern: `doDock()`, `tryTrade()`, `tradeCandidate()`, `adjPort()`, `windPush()`, `stepToward()`
- State-checking suffix pattern: `moored()`, `leeward()`, `blocked()`, `isHome()`, `isIsland()`, `onRim()`
- Short predicate functions: `flip()`, `shuffle()`, `r()` (RNG call)
- Descriptive utility methods: `sailBudget()`, `reachableFrom()`, `dockOccupiedBy()`, `tradeOpp()`
- Single-letter player identifiers: `p` (player), `q` (query/other player), `d` (direction), `c` (coordinates), `s` (shape), `o` (offset/other)
- Single-letter direction keys: `dk` (direction key — "N", "S", "E", "W")
- Array/collection iteration: `i`, `idx`, `k` (key)
- Boolean flags: `found`, `fled`, `done`, `moored`, `occupied`
- Coordinate pairs: always `[x, y]` — Manhattan distance via `man(a, b)`
- Ingredient identifiers: lowercase strings matching `ING_ALL` array
- Numeric accumulators: `round`, `flips`, `score`, `cost`, `budget`
- Config/strategy objects use full camelCase: `windPolicy`, `mechanic`, `personalty`
- UPPERCASE_SNAKE_CASE for constants: `ING_ALL`, `DIRS`, `SAIL_BUDGET`, `COIN_POOL`, `PERSONALITY`, `AW` (attack weights), `TW` (trade weights), `DW` (dock weights)
- Enum-like objects as UPPERCASE: `DIRS`, `DIRNAME`, `OPPOSITE`, `PERP`, `STORM_DIAG`
- Object constants grouped by function: `ING_NAME`, `ING_PLAIN`, `DOCK_PLACE`, `DOCK_FLAVOR`, `EMOJI_IMG`, `BOAT_IMG`, `ISLAND_SHAPE_IMG`
- Image paths consistently suffixed: `*_IMG` (e.g., `COIN_IMG`, `FLIP_HEADS_IMG`, `CROWN_IMG`)

## Code Style

- No formal linting or Prettier configuration
- Semicolons mandatory
- Strict mode enabled: `"use strict"` at script start
- Curly brace style: opening brace on same line (JavaScript convention)
- Compact spacing — conditions and control flow often condensed: `if(c){...}else{...}`
- Short variable names favor tight code density over long descriptive names
- No `.eslintrc`, `.prettierrc`, or `eslint.config.*` present
- Manual code review and consistency enforcement
- Vanilla JavaScript without TypeScript or build-time linting

## Import Organization

- Relative asset paths: `assets/ingredients/`, `assets/icons/`, `assets/clock/`, `assets/compass/`
- No module bundler or path alias configuration — direct relative imports only

## Error Handling

- Validation via early return: `if(this.blocked(nx))return;`
- Defensive null checks: `if(!c)return false;` followed by optional operations
- Fallback values in lookups: `ING_NAME[x]||x`, `dockPlace(x)||"the island"`
- Error thrown for broken invariants in test harness (real_game_test.js): `throw new Error("...");`
- Silent failure preferred for optional operations (e.g., image load failures in `iconAt()`)

## Logging

- Console.log for test output statistics and simulation results (battle_sim.js, real_game_test.js)
- Formatted output with padding/alignment: `String.padEnd()` for columnar output
- Percent formatting: `pct(n, d)` helper for consistent "XX.X%" output
- Gameplay events logged via `this.ev({...})` object structure rather than console calls

## Comments

- Section headers with === delimiters: `/* ================= Section Name ================= */`
- Non-obvious algorithm explanations (e.g., Dijkstra pathfinding in `stepToward()`)
- Design decisions with PDF/notes cross-references: `// notes/edits #5 ...` or `// PDF item 3c ...`
- Complex rules explanations with ruleset variants (e.g., battle mechanics choice in battle_sim.js)
- Warning comments for gotchas: `// NOTE: ...`, `// WARNING: ...`
- Inline disable comments for CSS animations in reduced-motion mode: `@media (prefers-reduced-motion: reduce)`
- Not used — this is vanilla JavaScript without TypeScript
- Complex functions use inline comments instead of doc blocks

## Function Design

- Small, focused utility functions typical: `cnt(arr, x)`, `pct(n, d)`, `man(a, b)` — 1–3 lines
- Medium business logic: 20–40 lines (e.g., `doDock()`, `tryTrade()`)
- Large methods handle complex state: 50+ lines (e.g., `windPush()`, `stepToward()`, `constructor`)
- No strict size limit — size is secondary to clarity and algorithmic necessity
- Functions favor small parameter counts (2–4 typical)
- Complex state passed via object: `cfg = { grid, storm, roundBoard, ... }`
- Callback/closure pattern for stateful operations: `frontier`, `best`, `dist` dicts in pathfinding
- Optional parameters via object properties or default values
- Boolean for checks: `moored()`, `blocked()`, `flip()`
- null for optional lookups: `adjPort()`, `dockOccupiedBy()`, `tradeCandidate()`
- Object for complex results: `{ downwind, a, d, round, flips, ... }` from `simBattle()`
- Undefined for mutations that don't return (many game methods)
- Empty object `{}` for event records passed to `ev()`

## Module Design

- Single class per file: `class Game { ... }`
- Constants defined at module scope before class
- Helper functions at module scope: `mulberry32()`, `unusedDefaultName()`, `emojify()`
- No explicit `export` statements — browser global or Node `vm` context
- Not used — monolithic index.html contains all game logic
- Utility scripts are standalone: battle_sim.js and real_game_test.js don't share imports
- HTML structure (1–800 lines): static markup + inline CSS
- Main script block (807–end): engine constants, Game class, UI event handlers, initialization
- CSS variables for theming: `--teal`, `--mint`, `--orange`, etc.
- Asset image mappings: organized by category (boats, islands, ingredients, icons)

## Coding Patterns

- Always `[x, y]` arrays
- String keys for dicts: `"x,y"` (e.g., `this.valid.has("5,3")`)
- Manhattan distance: `man(a, b)` — `Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1])`
- Seedable RNG: `mulberry32(seed)` returns function `() => [0, 1)`
- Always called: `this.r()` not `Math.random()`
- Deterministic replay via seed capture
- Centralized event buffer: `this.ev({t: eventType, ...fields})`
- Battle events include: `{t: "battle", a, d, downwind, flips, rounds, winner}`
- Trade events include: `{t: "trade", a, b, gave, got, kind: "swap"|"buy"}`
- Dock events include: `{t: "dock", p, ing, heads, got: "ing"|"coins"|"bought"|"empty"}`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Game class** | Core game state machine: board layout, player positions, ingredient tracking, battle resolution, wind/storm effects, recipe tracking, victory conditions | `index.html:1017–1684` |
| **UI Rendering** | DOM updates, SVG board drawing, animation, modal dialogs, player panels, chat/narration display | `index.html:2170–3400` |
| **Event Handling** | User input (coin flips, movement, trades, battles), async decision flows for human players | `index.html:3447–4262` |
| **Bot AI** | 5 personality strategies (pirate, trader, balanced, rusher, monopolist) driving CPU player decisions | `index.html:999–1016`, `cocoa_pirates_sim.py` |
| **Battle System** | Coin flip mechanics, wind advantage scoring, defender flee logic, battle outcome resolution | `index.html:1405–1635`, `scripts/battle_sim.js` |
| **Multiplayer Sync** | Firebase RTDB watchers/writers for game state, chat, narration, coin flip coordination, shot clock | `index.html:4542–4740` |
| **Asset Preloading** | Image loading, caching, boot-time progress tracking via `preloadAssets()` | `index.html:5166–5180` |
| **Room Management** | Lobby creation/joining, turn order establishment, seat assignment, host/guest coordination | `index.html:4913–5006` |

## Pattern Overview

- Single monolithic HTML file (328 KB) containing all game logic and UI code mixed together
- Game state lives in a `Game` instance, updated via `Game.play()` main loop or human decisions
- Rendering is imperative: `render()` function reads game state and updates DOM/canvas
- Networking is event-driven: Firebase watchers trigger async callbacks that update state and re-render
- No component framework (React, Vue, etc.); vanilla DOM manipulation with CSS Grid for layout
- Async/await used for turn flows, animations, and network I/O coordination

## Layers

- Purpose: Maintain complete game state and simulation logic
- Location: `index.html` (lines 807–1684, between `<script>` tag start and UI marker)
- Contains: `Game` class, bot strategy logic, rule constants, helper math functions
- Depends on: Random number generator (`mulberry32`), helper functions (`man`, `shuffle`, etc.)
- Used by: UI rendering, event handlers, Firebase watchers
- Purpose: Display game state visually and collect player input
- Location: `index.html` (lines 2170–3400+)
- Contains: `render()`, `drawBoard()`, SVG DOM manipulation, modal dialogs, animation
- Depends on: Game instance state, asset images, CSS variables
- Used by: Event listeners, Firebase watchers (narration, battle updates), turn flow
- Purpose: Synchronize multiplayer state across browsers via Firebase
- Location: `index.html` (lines 4542–4740, `fbInit()`, `watchPresence()`, `watchRoom()`, etc.)
- Contains: Firebase initialization, data write/read operations, real-time watchers
- Depends on: Firebase client library (loaded from CDN), room ID, seat assignment
- Used by: Host browser (drives game, writes state), guest browsers (watch and render)
- Purpose: Persist session state and enable offline play
- Location: Browser `localStorage` API + Firebase RTDB
- Contains: Session tokens (`pp_sess`), solo game state (`pp_solo`), game logs, player presence
- Used by: Boot sequence (`boot()`), resume flows, post-game logging

## Data Flow

### Primary Request Path: Single-Player Game

### Multiplayer Flow: Real-Time Synchronization

- Authoritative state lives in the host browser's `Game` instance
- Guests have a read-only view (render-only, no state mutations)
- Pass-and-play (solo multi-player) uses local state only, no Firebase

### Event Narration Flow

### Battle Mechanics (Detailed)

## Key Abstractions

- Purpose: Encapsulate all mutable game information
- Examples: `game.players`, `game.home`, `game.islands`, `game.events`
- Pattern: Direct property access on Game instance; mutations trigger `render()` calls
- Purpose: Represent a discrete game occurrence (move, battle, trade, dock)
- Examples: `{ t: 'battle', a: 0, d: 1, winner: 0, flips: 8 }` (battle event)
- Pattern: Added to `game.events`, converted to narration via `EVENT_NARRATION` lookup table
- Purpose: Track what each player needs to collect and what they have
- Examples: `game.players[i].recipe`, `game.players[i].ingredients`
- Pattern: Arrays of ingredient strings; lookup tables map to emoji, images, names
- Purpose: Model island placement and ship movement
- Examples: `game.islands` (cell → ingredient), `game.players[i].pos` (x, y tuple)
- Pattern: Grid coordinates, Manhattan distance for adjacency checks, flood-fill for reachability
- Purpose: Encapsulate decision-making logic for CPU players
- Examples: `personality.pirate`, `personality.trader`, etc.
- Pattern: Functions receive game state and return an action; called during `Game.play()` main loop

## Entry Points

- Location: `index.html:5181`
- Triggers: Browser loads the HTML page
- Responsibilities: 
- Location: `index.html:1684–1693` (roundCfg), `1017–1178` (Game constructor)
- Triggers: User clicks "Start Game" or "Resume Game"
- Responsibilities:
- Location: `index.html:1636–1684`
- Triggers: After setup complete, awaited by `runLiveNet()` or `resumeSoloGame()`
- Responsibilities:
- Location: `index.html:4206–4262`
- Triggers: Game loop reaches a human player's turn
- Responsibilities:
- Location: `index.html:4263–4339`
- Triggers: Game loop reaches a bot player's turn
- Responsibilities:

## Architectural Constraints

- **Threading:** Single-threaded JavaScript event loop in browser. No Web Workers or background threads. Guest browsers are I/O-blocked waiting for Firebase updates.
- **Global state:** Game instance is a global variable `game`; player ID is global `myId`; room code is global `room`. Firebase connection is global `db`. No module/class isolation of these globals.
- **Circular imports:** Not applicable (no module system). All code is in a single script block evaluated sequentially.
- **Monolithic file:** 328 KB single HTML file makes code organization challenging. Game logic, UI rendering, and networking are interleaved with no clear separation.
- **Synchronous UI:** Rendering is synchronous; large renders (e.g., `drawBoard()`) can cause jank if board is complex.
- **Network dependency:** Multiplayer games require Firebase connectivity. No offline fallback for multiplayer (solo play works fully offline).
- **Host authority:** Host browser is single point of authority for game state. If host crashes mid-game, guests see a frozen game until host reconnects.

## Anti-Patterns

### Anti-Pattern 1: Mixed Concerns in Single File

- Difficult to test individual systems in isolation
- Hard to reason about data dependencies
- Refactoring one layer breaks others
- No clear API boundaries
- `game-engine.js` - Core Game class and logic only
- `ui-renderer.js` - Rendering functions that consume game state
- `networking.js` - Firebase watchers/writers
- `main.js` - Orchestrate the layers

### Anti-Pattern 2: Event Objects Are Loosely Typed

- No type hints; easy to access undefined fields
- `describe()` function has hard-to-maintain switch cases on `e.t`
- Typos in field names go undetected
- Event schema is implicit in test scripts only
- Define event shape interfaces/types (even in JSDoc)
- Create factory functions to construct events safely
- Export event schema so test scripts inherit validation

### Anti-Pattern 3: Render is Imperative and Scattered

- Easy to forget to call render() after a state update
- Out-of-order renders if async code branches
- Difficult to trace why UI is stale
- Hard to add logging/debugging for render calls
- Make all state mutations go through a dispatcher function
- Dispatcher calls render() once after each mutation batch
- Consider a minimal reactive system (even hand-rolled)

### Anti-Pattern 4: Firebase Watchers Are Scattered

- Boilerplate repeated for each watcher
- Easy to forget to `.off()` and leak listeners
- Error handling is inconsistent
- Hard to implement a global "network is down" state
- Create a watcher registry/manager
- Implement consistent lifecycle (setup, teardown, error handling)
- Make it easy to toggle all watchers on/off (for offline mode, testing)

## Error Handling

- Firebase writes are wrapped in `.catch(netFail(label))` which logs to console and displays a "sync trouble" banner
- Network reads that fail during game setup show an error dialog and clear session
- Human input validation happens in turn flow functions (e.g., `humanWind()` checks reachable tiles)
- Bot decisions are trusted (no validation); if a bot returns an illegal move, game state becomes corrupt
- No graceful degradation if assets fail to load (game shows blank board but continues)

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

## Driving the game in a browser

`docs/DRIVING-THE-GAME.md` is required reading before any browser or playtest automation. Two traps waste the most sessions: the flippenator coin `#flipCoinWrap` **is** the flip button (it is not an `.apBtn` — this stalled three separate attempts), and a window narrower than about a second cannot be hand-driven at all, so use the armed watcher in §5d.

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
