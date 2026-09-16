/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   src/shared/words.js — EVERY WORD THE GAME SAYS, IN ONE PLACE.

   Wyatt, 2026-09-13, on his narration pass: "All the narration should be re-architected to live in one
   place -- fix this." · "we use one engine, that accepts as arguments the action taken, the player type
   (human/bot), the location of the player (this browser/remote), and serves an event." · and, the night
   before: "i don't want to actually write out every single for of "ye" vs "Player"".

   HOW TO READ AN ENTRY, AND HOW TO CHANGE ONE
     "⚔️ {a} {a:attacks|attack} {d}!"
       {a}              a captain. Every other screen reads the captain's name; the captain's OWN screen
                        reads "ye". When that captain opens the sentence it reads "Crustbeard — ye", so a
                        pass-and-play screen still says who "ye" is.
       {a's}            the captain's: "Crustbeard's" elsewhere, "yer" on their own screen.
       {a:this|that}    two ways to say one thing: the first for every other screen, the second for {a}'s
                        own. Either side may be empty.
       {n} {place} …    a fact the game fills in — a number, an island, an ingredient, a direction.
       🌕 ⚪ ⚫ 🦜 🧁 …   stand for the game's own art, swapped in on screen. An amount of coin is never
                        split from its number across a line break.
       ""               the game says nothing at this moment.
     Written ONCE, as another captain would read it. The "ye" forms are derived by fill(), never typed — with one
     exception that still lives outside this file: the sea-creature sightings in src/shared/index.js are typed twice
     by hand ("ye peep into…" / "…peeps into…"). They move here with the rest of the theme text, when he says so
     (2026-09-14: "don't do anything yet -- this is just context for you to help design scalable architecture").

   A CAPTAIN FACT OR A NAME — the two ways a line holds a captain, and they are not interchangeable:
       {p} {a} {d} {q} {w} …   a captain the line TELLS ABOUT — seat() in code. It becomes "ye" on that captain's own
                               screen, so every verb is written both ways: "{p} {p:is|are} deciding…". Use this for
                               every line about a captain, even one only other screens read today.
       {name}                  a captain's name as a LABEL — the line is put TO them by name ("{name}, choose yer
                               recipe:"), or names them on a badge, a tally or a table ("{name's} HEADS"). A name
                               never becomes "ye", which is the point of it. words_one_place_check holds the list of
                               lines allowed a name, so a line about a captain cannot quietly take one.

   THE RULE THIS FILE EXISTS TO HOLD: A BOT AND A HUMAN ARE DESCRIBED IN THE SAME WORDS. A captain's type
   decides how a move is CHOSEN, never which sentence describes it; which screen is reading decides "ye".
   Nothing that calls this file may pick a line by who is playing.

   ZERO IMPORTS, ON PURPOSE. The game reads this file, and so can a plain `node` script or a review page —
   so the page Wyatt rewrites in is always the game's own words, never a copy that can drift (the Narration
   Pass of 2026-09-13 was built on a copy, and a third of its rows were lines the game no longer had).
   scripts/qa/words_one_place_check.mjs renders every entry and fails if a sentence is written into the
   game's code instead of here.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

/* A captain, as a fact: `{a: seat(2)}`. Anything else in `facts` is filled in as written. */
export const seat = (i) => ({ seat: i });
const isSeat = (v) => v != null && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "seat");

/* Is the text so far the start of a sentence? "first" when nothing but art and markup came before;
   "next" after a full stop, "!" or "?"; otherwise mid-sentence. */
const ART = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
function sentenceAt(before) {
  const t = before.replace(/<[^>]*>/g, " ").replace(ART, "").trim();
  if (t === "") return "first";
  return /[.!?]$/.test(t) ? "next" : "";
}

/* fill(template, facts, look) — the whole grammar. `look` is how the calling screen sees captains:
   { me(seat) -> is this captain the one reading?, name(seat) -> the coloured name, poss(seat) -> "Name's" }.
   An unknown fact is left visible as {key}, so a missing value can never quietly vanish. */
export function fill(template, facts, look) {
  if (!template) return "";
  facts = facts || {};
  const re = /\{([A-Za-z0-9_]+)(?:('s)|:([^{}|]*)\|([^{}]*))?\}/g;
  let out = "", last = 0, m;
  while ((m = re.exec(template))) {
    out += template.slice(last, m.index);
    last = re.lastIndex;
    const [whole, key, possessive, other, own] = m;
    const v = facts[key];
    if (other !== undefined) { out += isSeat(v) && look.me(v.seat) ? own : other; continue; }
    if (isSeat(v)) {
      const mine = look.me(v.seat), at = sentenceAt(out);
      if (possessive) out += mine ? (at ? "Yer" : "yer") : look.poss(v.seat);
      else if (!mine) out += look.name(v.seat);
      else out += at === "first" ? `${look.name(v.seat)} — ye` : at ? "Ye" : "ye";
      continue;
    }
    if (v === undefined || v === null) { out += whole; continue; }
    // a plain name's possessive follows the same rule a captain's does: "Wyatt's", "Davy Scones'"
    out += possessive ? String(v) + (String(v).replace(/<[^>]*>/g, "").trim().endsWith("s") ? "'" : "'s") : String(v);
  }
  out += template.slice(last);
  // an amount and its coin are one readable thing — "(+3🌕)", "−2🌕", "5🌕" never break apart. A fact that
  // was itself filled from this file arrives already held together, and is left exactly as it came.
  return out.split(/(<span class="nobrk">[\s\S]*?<\/span>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\(?[+−]?\d+🌕\)?/g, (s) => `<span class="nobrk">${s}</span>`)))
    .join("");
}

export const WORDS = {
  /* ── THE DAY'S WEATHER — the first line of every day ─────────────────────────────────────────────
     His pass, 2026-09-13: "Wind still" for any repeated direction; a storm is blowin', now blowin' (it
     goes on, the wind turned) or still blowin' (it goes on, same way). "It'll blow every ship 3 squares"
     is gone — the storm's own summary names the squares when it pushes. "Tomorrow" stays (his pick). */
  "day.wind": "Day {day}: Wind {dir}.",
  "day.windStill": "Day {day}: Wind still {dir}.",
  "day.storm": "Day {day}: Storm's blowin' {dir}.",
  "day.stormNow": "Day {day}: Storm's now blowin' {dir}.",
  "day.stormStill": "Day {day}: Storm's still blowin' {dir}.",
  "day.tomorrow": "Tomorrow: {dir}.",
  "day.tomorrowStorm": "Tomorrow: a storm.",

  /* ── A CAPTAIN'S TURN BEGINS ─────────────────────────────────────────────────────────────────────
     ONE line for every captain, bot or human, on every screen — and silent, by his word: "can we cut it
     and see how it feels?" · "make sure your change is architectural -- not changing the bot line AND
     the human line". Put words here and every captain's turn says them. */
  "turn.start": "",

  /* ── THE COIN ────────────────────────────────────────────────────────────────────────────────────── */
  "flip.ask": "Flip the doubloon!",

  /* ── DOCKING ──────────────────────────────────────────────────────────────────────────────────────────
     The coin leads each result line — his ruling, 2026-09-13: the pictures stay in the lines ("I simply was not able to write emojis
     in the comment boxes"). ⚪ heads found treasure, ⚫ tails scrubbed the docks. */
  "dock.treasure": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place}!",
  "dock.treasure.buy": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place} and {p:buys|buy} {goods} (−{paid}🌕).",
  "dock.treasure.black": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place} and {p:pays|pay} the black market for {goods} (−{paid}🌕).",
  "dock.treasure.barter": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place} and {p:trades|trade} {gave} to the black market for {goods}.",
  "dock.work": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks at {place}.",
  "dock.work.buy": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks and {p:buys|buy} {goods} (−{paid}🌕).",
  "dock.work.black": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks and {p:pays|pay} the black market for {goods} (−{paid}🌕).",
  "dock.work.barter": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks and {p:trades|trade} {gave} to the black market for {goods}.",
  /* AND THE CRATE THAT STAYED ON THE SHELF. Wyatt's playtest, 2026-09-15: "dough hook docked at full cream folly,
     found treasure, had sufficient money to buy a crate, yet didn't." The captain was playing correctly; the LINE
     stopped at the payday and never said a crate had been left behind, so a berth that did its whole job read as a
     broken bot. Each of these is its own payday line with the tail swapped, so a dock that buys and a dock that
     walks away are plainly the same moment told two ways.
     ONLY WHAT A PLAYER CAN SEE (docs/BOT-DESIGN-PRINCIPLES.md §5): a hold is public, so "already carryin' one" is a
     reason anybody at the table can check. A RECIPE IS SECRET — NO LINE HERE MAY EVER SAY OR HINT THAT A CRATE WAS
     NOT ON SOMEBODY'S CARD. Every other decline reads the same neutral way, and that sameness is the point of it. */
  "dock.treasure.passed": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place} and {p:leaves|leave} {goods} on the shelf.",
  "dock.treasure.holds": "⚪ {p} {p:finds|find} treasure (+{n}🌕) at {place} and {p:leaves|leave} {goods} on the shelf — already carryin' one.",
  "dock.work.passed": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks and {p:leaves|leave} {goods} on the shelf.",
  "dock.work.holds": "⚫ {p} {p:earns|earn} {n}🌕 scrubbin' the docks and {p:leaves|leave} {goods} on the shelf — already carryin' one.",
  "dock.lastOne": "{p:That were the last of it|Ye took the last of it} — the shelves be bare!",
  "dock.gaveTwo": "{a} an' {b}",
  "dock.gaveTwoSame": "two {a}",

  /* ── TRADES AND CALLS ──────────────────────────────────────────────────────────────────────────── */
  "trade.struck": "🤝 {a} {a:trades|trade} {gave} to {b} for {got}",
  "call.right": "🔭 {p} called it! (+{n}🌕)",
  "call.wrong": "🔭 {p} called it wrong.",

  /* ── A BATTLE'S OUTCOME ────────────────────────────────────────────────────────────────────────── */
  "battle.takes": "⚔️ {winner} {winner:wins|win} and {winner:takes|take} {loser:|yer }{spoil}.",
  "battle.nothing": "⚔️ {winner} {winner:wins|win}, but there's nothing in {loser's} hold to plunder.",
  "battle.downwind": "⚔️ Both cannons land — but {winner} {winner:fires|fire} downwind, and the wind carries the shot home. {winner} {winner:takes|take} {loser:|yer }{spoil}.",
  "battle.slipsAway": "🏃 {d} {d:slips|slip} away!",

  /* ── THE STORM'S SUMMARY, after it pushes ─────────────────────────────────────────────────────────
     A group of captains is named as a list, so each piece is written for one captain and for several. */
  "storm.drives": "drives {who} {n} squares {dir}",
  "storm.blowsOff": "blows {who} clean off the dock",
  "storm.sweeps": "sweeps {who} into the trade winds",
  "storm.holds.one": "{who} drops anchor an' holds fast",
  "storm.holds.many": "{who} drop anchor an' hold fast",
  "storm.pinned.one": "{who} is pinned by the hull ahead",
  "storm.pinned.many": "{who} are pinned by the hull ahead",
  "storm.summary": "🌀 The storm {storm}!",
  "storm.summary.both": "🌀 The storm {storm} — {captains}!",
  "storm.summary.captains": "🌀 The storm blows through — {captains}!",
  "list.and": "an'",
  "list.ye": "ye",

  /* ── MUSING — the sighting itself is the sea creature's own sentence ──────────────────────────── */
  "muse.line": "🌊 {sighting} {idea}",
  "muse.idea": "Recipe idea! (+{n}🌕)",
  "muse.unknown": "{p} {p:leans|lean} over the rail, and there's {what} down there.",
  "muse.somethin": "somethin' strange",

  /* ── HOME WITH A FULL RECIPE ───────────────────────────────────────────────────────────────────────
     His rewrite of the old final-round card, on the moment a captain actually arrives in today's game —
     the ovens lighting. */
  "ovens.lit": "🧁 {p} fired up the bakery!",

  /* ── BUTTONS ANY QUESTION CAN CARRY ──────────────────────────────────────────────────────────────── */
  "button.back": "← Back",
  "button.backAria": "Back",
  "button.nah": "Nah",
  "button.accept": "{icon} Accept",
  "button.deny": "{icon} Deny",
  "flip.button": "🌕 FLIP!",
  "flip.word": "FLIP",
  "flip.stampHeads": "HEADS!",
  "flip.stampTails": "TAILS",
  "coin.amount": "{n}🌕",
  "parrot.ok": "🦜 Aye aye",

  /* ── WAITING — what every other screen reads while one captain decides ─────────────────────────── */
  "wait.deciding": "{p} {p:is|are} deciding…",
  "wait.sailing": "{p} {p:is|are} choosing where to sail…",
  "wait.ovens": "{p} {p:steps|step} up to the ovens…",
  "wait.mateys": "⚓ Waiting for yer mateys…",
  "battle.waiting": "⏳ Waiting for {who}…",

  /* ── SAILING ───────────────────────────────────────────────────────────────────────────────────────── */
  "sail.tap": "tap to sail",
  "sail.ask": "{name}: {what}",
  "sail.stay": "Stay put",
  "rim.head": "🌀 {p} {p:rides|ride} at the head o' the current — she's got nowhere to carry {p:'em|ye} from here.",

  /* ── THE OPENING CARDS ─────────────────────────────────────────────────────────────────────────────── */
  "intro.ahoy": "⚓ Ahoy! Choose a recipe, gather each ingredient, then sail home first to win!",
  "intro.ahoyGo": "⚓ Arrgh!",
  "intro.knowHow": "Do ye know how to play?",
  "intro.yes": "⚓️ Yarrgh!",
  "intro.no": "🦜 Nah",
  /* his rewrite, 2026-09-13 — "{Crustbeard} goes first! The rest o' ye get {coin}." */
  "intro.order": "{icon} {lead} {lead:goes|go} first! {lead:The rest o' ye get|The rest o' the crew get} 🌕.",
  "intro.orderGo": "🦜 Start",

  /* ── WHAT A CAPTAIN MAY DO ─────────────────────────────────────────────────────────────────────────── */
  "act.ask": "{name}, what'll ye do:",
  "act.dock": "Dock at {icon} {place}",
  "act.dockShort": "{icon} Dock",
  "act.attack": "⚔️ Attack −{n}🌕",
  "act.attackFree": "⚔️ Attack",
  "act.noPowder": "Ye can't afford the powder — {n}🌕 a broadside, and yer purse won't stretch.",
  "act.emptyHolds": "Their holds are empty — there's nothin' aboard worth takin'.",
  "act.trade": "🤝 Trade",
  "act.nothingToTrade": "Ye've nothin' to trade — an empty hold and an empty purse.",
  "act.noCargoOnWater": "Not a captain on the water is carryin' cargo to trade for.",
  "act.ovens": "{icon} Fire up the ovens!",
  "act.ovensShort": "{icon} Fire ovens!",
  "act.moveInstead": "← Actually, move instead",
  "act.muse": "Muse",
  "act.museCoin": "+{n}🌕",
  "act.cantAttack": "{p} {p:can't attack.|can't attack: no powder, or nothin' in their holds.}",
  "act.cantTrade": "{p} {p:can't trade.|can't trade: nothin' to offer, or no cargo on the water.}",
  "act.whom": "Attack whom?",

  /* ── DOCKING: THE FLIP AND THE BUY ────────────────────────────────────────────────────────────────────
     "Scrubbin' the docks" is the tails action's one name now — his pass, 2026-09-13, replacing W2-3's "workin'". */
  "dock.flipAsk": "Docking at {icon} {place}",
  "dock.flipHelp": "⚪ HEADS strikes buried treasure (+{heads}🌕) · ⚫ TAILS is a turn scrubbin' the docks (+{tails}🌕). Either way, ye may then buy an ingredient.",
  "dock.buyAsk.treasure": "⚪ TREASURE (+{n}🌕)! Buy {goods}?",
  "dock.buyAsk.work": "⚫ TAILS (+{n}🌕) — a turn scrubbin' the docks. Buy {goods}?",
  "dock.buy": "Buy {ing} −{price}🌕",
  "dock.shortWhy": "It costs {price}🌕 and ye've {coins}🌕 — {short}🌕 short.",
  "market.barter": "Trade any 2 ingredients fer {ing}",
  "market.barterShort": "2 → {icon}",
  "market.barterWhy": "The barter takes 2 ingredients off yer hands, and ye're carryin' {n}.",
  "market.first": "The black market'll take any 2 ingredients fer {goods} — what's the first?",
  "market.second": "Givin' {first} an' one more fer {goods} — what's the second?",

  /* ── TRADING ───────────────────────────────────────────────────────────────────────────────────────── */
  "trade.nothingAtAll": "{p} {p:has|have} nothin' to trade.",
  "trade.noCargo": "No one has cargo to trade for.",
  "trade.nobodyHas": "No captain on the water is carryin' {ing}.",
  "trade.want": "What do ye WANT from the table?",
  "trade.give": "What will ye GIVE for {want}?",
  "trade.coins": "Coins",
  "trade.emptyPurse": "Yer purse is empty — ye've no coin to offer, so it must be an ingredient.",
  "trade.nothingToOffer": "Ye don't have any to offer!",
  "trade.coinOnTop": "Would ye offer any coin on top?",
  "trade.howMany": "How many coins?",
  "trade.offerGo": "Offer it!",
  "trade.offered": "{q}: {p} {p:offers|offer} {offer} for yer {want}.",
  "trade.counter": "💰 Ask for summat else",
  "trade.counterShort": "💰 Counter",
  "trade.nothingElse": "{p} {p:has|have} nothin' else aboard and no coin — ye can take it or leave it.",
  "trade.noSweetener": "{p} {p:has|have} no coin left to sweeten the deal — ye can take it or leave it.",
  "trade.silence": "Not a soul answers {p's} hail.",
  "trade.takes": "{icon} {q} {q:takes|take} yer {what}",
  "trade.accepts": "{icon} {q} {q:accepts|accept}",
  "trade.wants": "💰 {q} {q:wants|want} {what}",
  "trade.wantsInstead": "💰 {q} {q:wants|want} {what} <i>instead</i>",
  "trade.offer": "offer",
  "trade.nothin": "nothin'",
  "trade.that": "that",
  "trade.notCarrying": "Ye're not carryin' {ing} any more.",
  "trade.tooDear": "That'd cost ye {n}🌕, and ye've only {coins}🌕 aboard.",
  "trade.coinsShort": "+{n}🌕",
  "trade.walkAway": "🚫 Walk away",
  "trade.refuses": "{q} refuses outright",
  "trade.declines": "{q} declines",
  "trade.allDeclined": "No captain will part with {want} for {p:that|that offer of yers}.",
  "trade.answers": "Fer yer {want} the table answers:<br>{lines}<br>Take a deal, or walk away?",
  "trade.walksAway": "{p} {p:walks|walk} away from the table.",
  "trade.declined": "{q} {q:declines|decline} {p's} offer!",
  "counter.coin": "💰 Coin instead",
  "counter.coinShort": "💰 Coin",
  "counter.noCoin": "{p} {p:has|have} no coin at all — it must be an ingredient.",
  "counter.ask": "{q}: what o' {whose} will ye have instead?",
  "counter.noCargo": "{p} {p:has|have} no other cargo — ye can ask for coin, or deny.",
  "counter.asking": "{q}: ye're ASKIN' {what} for yer {want}",
  "counter.go": "Ask it!",

  /* ── CALLING A BATTLE ────────────────────────────────────────────────────────────────────────────────
     his rewrite, 2026-09-13 — "A battle's brewing! Guess the winner and win 1". The caller's name still leads: on one
     device the ask arrives out of nowhere, and the name is what says it is for them (his 2026-08-08 ruling). */
  "call.ask": "⚔️ {name} — a battle's brewing! Guess the winner and win {n}🌕.",
  "call.button": "Call {name}",
  "call.made": "🔭 {p} {p:calls|call} {called} from the crow's nest.",
  "call.paid": "{name} +{n}🌕",
  "call.unpaid": "{name} no bounty",
  "call.settle": "🔭 {parts}",

  /* ── WHILE YE LOOKED AWAY — the recap after a skip ─────────────────────────────────────────────── */
  "recap.line": "⏩ While ye looked away: {list}.",
  "recap.bested": "{p} bested {q} in battle",
  "recap.lost": "{p} lost a battle to {q}",
  "recap.black": "{p} paid the black market for {icon}",
  "recap.bought": "{p} bought {icon} at {place}",
  "recap.traded": "{p} struck a trade with {q}",
  "recap.docks": "{p} scrubbed the docks at {place}",
  "recap.sailed": "{p} sailed on",

  /* ── WHEN SOMETHING GOES WRONG ──────────────────────────────────────────────────────────────────── */
  "restore.unreadable": "We couldn't reach the crew's log for this voyage, so we can't tell how much of it is missing. Carrying on may put ye out of step with the rest of the crew.",
  "restore.short": "We rebuilt this voyage but came up {n} events short. Carrying on may put ye out of step with the rest of the crew.",
  "restore.shortOne": "We rebuilt this voyage but came up 1 event short. Carrying on may put ye out of step with the rest of the crew.",
  "error.aground": "The voyage has run aground. {err}",
  "aground.title": "🪨 The voyage has run aground",
  "aground.body": "Somethin' broke below decks and the game can sail no further.",
  "aground.freshVoyage": "Refreshin' will sail ye back onto the same rock — start a fresh voyage.",
  "aground.refresh": "A refresh may set ye right.",

  /* ── THE BATTLE CARD ───────────────────────────────────────────────────────────────────────────────── */
  "battle.title": "⚔️ Broadside Battle",
  "battle.attacker": "Attacker",
  "battle.defender": "Defender",
  "battle.crosswindTag": "CROSSWIND · ties collide",
  "battle.downwindTag": "⬇ {name} FIRES DOWNWIND — WINS TIES",
  "battle.opening": "⚔️ {a} {a:attacks|attack} {d}!",
  "battle.waitDefend": "⚔️ {a} {a:attacks|attack} {d}! Waiting for {d} to defend…",
  "battle.waitFor": "⚔️ {a} {a:attacks|attack} {d} — waiting for {who}…",
  "battle.loads": "{a} {a:loads|load} the cannon…",
  "battle.fire": "⚔️ {name} (attacker) — fire!",
  "battle.defend": "⚔️ {a} {a:attacks|attack} ye — defend! FLIP",
  "battle.showsHeads": "{a} {a:shows|show} HEADS — {d} must answer…",
  "battle.showsTails": "{a} {a:shows|show} TAILS — {d} must answer…",
  /* his pass, 2026-09-13 */
  "battle.downwindHits": "⚪ {w's} downwind shot hits!",
  "battle.crosswindMiss": "⚪ No hit — cannonballs collide in the crosswind.",
  "battle.hit": "{name} lands a hit!",
  "battle.bothMiss": "⚫ Both miss.",
  "battle.fleeAsk": "{name}: both shots missed wildly! Slip away?",
  "battle.flee": "🏃 Flee!",
  "battle.stand": "⚔️ Stand yer ground",
  "battle.refireAsk": "{name}: load another broadside (−{n}🌕)? ⚪ HEADS and the shot lands.",
  "battle.fireAgain": "🔥 Fire again −{n}🌕",
  "battle.fireAgainFlip": "🔥 Fire again!",
  "battle.breakOff": "🏳️ Break off",
  "battle.refireHits": "The second broadside tells — {a} {a:lands|land} it!",
  "battle.refireMiss": "The shot goes wide.",
  "battle.plunder": "{name}, choose yer plunder!",
  "ceremony.broadside": "⚔️ Broadside!",
  "ceremony.tapCoin": "Tap the coin, captain — let fate decide.",
  "battle.vs": "VS",
  "ceremony.downwind": "is firin' downwind — two heads and the tie is theirs.",
  "ceremony.crosswind": "Crosswind — two heads and the cannonballs collide.",

  /* ── CHOOSING A RECIPE ───────────────────────────────────────────────────────────────────────────────
     Two lines, not drift (his question, 2026-09-13): one while several captains choose at once, one while a single
     captain does. */
  "draft.choose": "{name}, choose yer recipe:",
  "draft.pickSay": ", pick yer recipe:",
  "draft.everyone": "⚓ Everyone's choosing their recipe…",
  "draft.one": "{p} {p:is|are} choosing a recipe…",
  "draft.chosen": "⚓ Recipe chosen! Waiting for the rest of the crew…",
  "draft.tapHint": "Tap a recipe to see its route",
  "recipe.check": "🔍 Check my recipe",
  "recipe.bakeThis": "Bake this!",
  "recipe.swapAria": "Show the other recipe",

  /* ── THE CAPTAINS BOX ──────────────────────────────────────────────────────────────────────────────── */
  "hold.aboard": " — aboard",
  "hold.surplus": "surplus cargo: {ing}",
  "hold.empty": "empty hold",
  "captains.youTip": "{name} — that's you!",
  "captains.botTip": "🤖 bot ({strategy})",

  /* ── THE TOP OF THE SCREEN ─────────────────────────────────────────────────────────────────────────── */
  "ribbon.day": "DAY {n}",
  "ribbon.ff": "Skip to yer next turn",
  "ribbon.chat": "Scuttlebutt",
  "ribbon.parrot": "Yer parrot",
  "pill.now": "WIND NOW:",
  "pill.forecast": "FORECAST:",
  "pill.storm": "⛈{spin}",
  "peek.tapHold": "Tap and hold",
  "peek.clickHold": "Click and hold",
  "peek.hint": "{verb} the sea to reveal the board",
  "parrot.watching": "Yer parrot's watchin'",
  "parrot.resting": "Yer parrot's restin'",
  "parrot.helping": "🦜 Polly's helping!",
  "parrot.notHelping": "🦜 Polly's not helping",
  "sound.muted": "Sound is off. Tap for sound and music.",
  "sound.noMusic": "Sound on, music off. Tap to mute.",
  "sound.stalled": "Sound is on but yer browser has stalled it. Tap the board twice.",
  "sound.on": "Sound and music on. Tap to turn the music off.",

  /* ── PASS AND PLAY ───────────────────────────────────────────────────────────────────────────────────── */
  "pass.to": "{icon} Pass the wheel to",
  "pass.go": "At the helm!",

  /* ── THE BLACK MARKET'S ONE LESSON — his own sentence, 2026-08-27 ─────────────────────────────────── */
  "market.bareTitle": "🏴 <b>The shelves be bare…</b>",
  "market.bareBody": "Sold-out islands fly the black market flag. They'll find ye one more ingredient — for <b>{price}🌕.</b>",
  "market.bareGo": "Arrgh!",

  /* ── THE BAKE-OFF ───────────────────────────────────────────────────────────────────────────────────── */
  "bake.benchTitle": "🧁 The Bake-Off",
  "bake.title": "The Bake-Off",
  "bake.titleWatching": "{who}'s Bake-Off",
  "bake.titleMine": "{who}, Yer Bake-Off",
  "bake.watching": "{p} {p:is|are} at the ovens — watch the crates.",
  "bake.attempt": "attempt {n}",
  "bake.watchAgain": "Watch again {icon}1",
  /* his words, 2026-08-08 and 2026-08-25 */
  "bake.introLead": "{icon} The ovens be roarin'! Yer ingredients be waitin'. Ye must bake yer recipe by addin' them in the <b>correct order</b>.",
  "bake.recipeName": "{name} Recipe",
  "bake.introWarn": "Add them in this exact order or it's a ruined mess.",
  "bake.introGo": "Get bakin'!",
  "bake.study": "Study the order. Start the shuffle when yer ready.",
  "bake.ready": "Ready to bake!",
  "bake.justWatching": "Now yer just watchin'",
  "bake.tapOrder": "Tap the crates in recipe order. Tap again to undo.",
  "bake.leftOne": "{n} left — tap them for step {steps}. Tap again to undo.",
  "bake.leftMany": "{n} left — tap them for steps {steps}. Tap again to undo.",
  "bake.and": "and",
  "bake.go": "Bake it!",
  "bake.watchClosely": "Watch closely — the crates move again.",
  "bake.inOven": "In the oven…",
  "bake.opening": "Opening the crates…",
  "bake.perfect": "Every crate in its place — ye baked it!",
  "bake.partial": "{got} of {of} in place. Those stay put; the rest get shuffled again tomorrow.",
  "bake.crate": "Crate {n}",
  "bake.crateLocked": "Crate {n}, step {step}, already placed",

  /* ── THE END OF THE VOYAGE ──────────────────────────────────────────────────────────────────────────── */
  "end.nobody": "⏳ Nobody finished the voyage.",
  "end.nobodyBanner": "{icon} Nobody finished!",
  "end.winsBanner": "{icon} {w} {w:wins|win}!",
  "end.victory": "{w} baked {article}{recipe} and won <b>Best Baker in the Caribbean!</b>",
  "recipe.link": "📜 {title}",
  "recipe.pdf": "Download PDF",
  "recipe.email": "Email to myself",
  "recipe.yield": "Yield: {amount}",
  "recipe.steps": "Steps",
  "end.playAgain": "🔁 Play again!",
  "stats.days": "Days",
  "stats.battles": "Battles",
  "stats.battlesValue": "{n} (attacker won {pct}%)",
  "stats.trades": "Trades",
  "stats.bakeries": "Bakeries",
  "stats.noneHome": "no bakers home",
  "stats.oneHome": "1 baker home",
  "stats.manyHome": "{n} bakers home",
  /* his pass, 2026-09-13: "Change the term "heads-luck" to "HEADS {heads-coin}"" — and possessive, his word the same night: "Wyatt's HEADS ⚪️" */
  "stats.heads": "{name's} HEADS ⚪",
  "stats.headsValue": "{pct}% of {n} flips",

  /* ── THE TROPHIES — every captain gets one; the art is on the backlog (his ask, 2026-09-13) ─────────── */
  "trophy.cutlass.name": "The Cutlass of a Thousand Notches",
  "trophy.cutlass.byline": "One notch per fallen foe, carved into the hilt.",
  "trophy.cutlass.stat": "Most battles won",
  "trophy.cutlass.unit": "",
  "trophy.doubloon.name": "The Open Purse",
  "trophy.doubloon.byline": "Paid the harbourmaster more than any captain on the Sugar Seas.",
  "trophy.doubloon.stat": "Most ingredients bought",
  "trophy.doubloon.unit": "",
  "trophy.compass.name": "The Horizon-Chaser's Compass",
  "trophy.compass.byline": "For the salt-crusted soul who sailed further than sense allowed.",
  "trophy.compass.stat": "Farthest traveled",
  "trophy.compass.unit": " sq",
  "trophy.medal.name": "The Iron Gut Medal",
  "trophy.medal.byline": "For the crew that refused to sink.",
  "trophy.medal.stat": "Longest battle",
  "trophy.medal.unit": " rounds",
  "trophy.blackspot.name": "The Black Spot of Bad Tides",
  "trophy.blackspot.byline": "Survived the curse — worst luck on the Sugar Seas.",
  "trophy.blackspot.stat": "Most tails flipped",
  "trophy.blackspot.unit": " tails",
  "trophy.herring.name": "The Lucky Streak",
  "trophy.herring.byline": "Heads, then heads, then heads again — Lady Luck rode on their shoulder.",
  "trophy.herring.stat": "Hottest streak",
  "trophy.herring.unit": " heads",
  "trophy.ledger.name": "The Silver-Tongued Ledger",
  "trophy.ledger.byline": "Struck more deals than a Tortuga fishmonger on market day.",
  "trophy.ledger.stat": "Most trades struck",
  "trophy.ledger.unit": "",
  "trophy.target.name": "The Painted Target",
  "trophy.target.byline": "Somehow every cannon in the Caribbean swung their way.",
  "trophy.target.stat": "Most set upon",
  "trophy.target.unit": "",
  "trophy.timbers.name": "The Splintered Timbers",
  "trophy.timbers.byline": "Took a right drubbing and lived to grumble about it.",
  "trophy.timbers.stat": "Most battles lost",
  "trophy.timbers.unit": "",
  "trophy.anchor.name": "Good Mate",
  "trophy.anchor.byline": "Pirated for the love of the game.",
  "trophy.anchor.stat": "Number of ingredients plundered",
  "trophy.anchor.unit": "",

  /* ── THE LOBBY AND THE CONNECTION ──────────────────────────────────────────────────────────────────── */
  /* his rewrite, 2026-09-13 */
  "lobby.waitCaption": "{icon} Yer mateys will appear when they join. Wait for them before ye hit start.",
  "lobby.waitHost": "Waiting for the host to start the voyage…",
  "lobby.rename": "Change yer name",
  "lobby.nameTaken": "Arrgh — a captain aboard already sails as {name}. Pick another name, matey.",
  "error.noConnection": "Can't reach the Sugar Seas — check yer connection, wifi, and ad blockers, then try again matey.",
  "error.gameGone": "That game no longer exists.",
  "error.capacity": "Arrgh, the server's got too many pirates baking right now! Try a Solo game instead?",
  "error.rename": "Couldn't change yer name just now — the seas are choppy. Try again in a moment.",
  "error.enterCode": "Enter the room code yer host shared.",
  "error.noGame": "Arrgh, no game found with code {code}. Try typin' again.",
  "error.sailed": "⛵ That game has already set sail! Tell yer mateys and they may restart to come back for ye.",
  "error.full": "Too many pirates already in that game.",
  "error.service": "Couldn't reach the multiplayer service — it may be at capacity right now. Try again in a moment.",
  "host.grace": "⚓ Yer matey has left the game… let's give 'em 30 seconds to return before callin' off yer voyage.",
  "host.back": "⚓ Yargh! They're back!",
  "host.someone": "Yer matey",
  "host.left": "{who} has left the voyage",
  "host.leftWhy": "There be no hand on the wheel, so this ship sails no further. Gather yer crew and set out afresh, captain.",
  "button.port": "Back to port",
  "button.close": "Close",
  "resume.stuck": "⚓ Still reconnectin'…",
  "resume.stuckWhy": "If yer voyage won't come back, ye can abandon ship and set out afresh.",
  "resume.reconnecting": "⚓ Reconnecting to yer voyage…",
  "resume.reconnectingPlain": "Reconnecting to yer voyage…",

  /* ── TEST SHORTCUTS (?ovens=1, ?endcard=1) — still the game speaking, on a dev host ──────────────── */
  "test.ovens": "{icon} <b>TEST GAME</b> — holds stocked and the ovens are lit. The bake-off begins at the end of day one.",
  "test.ovensSpent": "{icon} <b>TEST GAME</b> — holds stocked, ovens lit, and one attempt already spent. The bake-off resumes at attempt 2 at the end of day one.",
  "test.endcard": "{icon} <b>TEST GAME</b> — every captain is home with a full recipe. Skipping to the end of the voyage.",
};

/* ── THE PARROT'S LADDERS — the tutorial lines (moved from src/ui/pilot.js, 2026-09-13) ─────────────────────────────
   Each moment holds its phrasings longest first, indexed by how many times this device has seen the moment; the bottom
   rung is null — "whatever the game builds today". An entry is a string, or {msg, sub} where `sub` is the helper line
   beneath the buttons. The shape rules and his 29 rulings behind these lines are in src/ui/pilot.js and DECISIONS.md. */
export const PILOT = {
  // ---- the sail moment. The wind rule is the single most important sentence in the game, and
  // it rides HERE rather than getting a ladder of its own, because the sail prompt is the only
  // moment where the wind is the answer to the question on screen.
  //
  // Wyatt SET ASIDE his own 2026-08-25 deletion of wind text for exactly this rung:
  //   "ignore my previous ruling, it was about a different matter and we are solving it with our
  //    rung system". That ruling still governs PERMANENT wind text; it does not govern a clause
  //    that deletes itself after three turns.
  //
  // The wind clause goes in `sub`, which lands in sailPanelHTML's `hint` — a parameter that was
  // deliberately kept on the wire when the red debug shout was deleted on 2026-08-25, so the spec
  // shape and the guest payload are unchanged. No new field, no new parity risk.
  "sail.pick": [
    /* ⭐ HIS WORDS, 2026-09-07 playtest item 3, replacing my draft ("Sailin' into the wind is
       slower — half sail, half the squares"). He kept the rung and rewrote the sentence: the old
       one made a player parse two halves to reach one fact. */
    { msg: "Tap a gold square to sail — head for a dock.", sub: "Sailin' into the wind only gets ye half the distance." },
    { msg: "Tap a gold square to sail toward a dock." },
    { msg: "Tap a gold square to sail." },
    null,
  ],

  // ---- the act menu: docking, and the fact that ye must
  "act.menu": [
    "Ingredients come off the islands — tie up at a dock to take one aboard.",
    "Tie up at a dock to take an ingredient aboard.",
    null,
  ],

  // ---- first sighting of each button. Driven by FIRST SIGHTING of that option, never by turn
  // count, so a captain offered their first battle on day nine still meets rung 0.
  "act.attack": [
    "One broadside each — heads beats tails, and the winner takes an ingredient off the loser.",
    "One broadside each — heads beats tails, winner takes an ingredient.",
    null,
  ],
  "act.trade": [
    "A hail reaches the whole table, not one captain — name what ye want and what ye'll give.",
    "A hail reaches the whole table — name what ye want and what ye'll give.",
    null,
  ],
  "act.muse": [
    "Nothin' worth doin' today? Muse on it and pocket a doubloon.",
    "Nothin' worth doin'? Muse on it and pocket a doubloon.",
    null,
  ],

  // ---- the recipe draft. Two of his nine topics are true at the same instant — which
  // ingredients ye need, and which every captain holds — so they are one sentence, not two beats.
  //
  // He rejected adding text here: "The recipe choice moment has a lot of text in it already, and
  // it's pretty overwhelming -- even as is. Adding more text is not the solution to this." So this
  // ladder is SHORT and the real teaching at this moment is the dotted course (src/ui/course.js),
  // which is a picture rather than a paragraph.
  /* ⚠ SHORTENED AFTER LOOKING AT IT. Rung 0 was two sentences and wrapped to THREE LINES above the
     card — on the one screen he singled out for having too much text already. That is not a length
     I get to defend; it is his ruling being broken by my own copy. The dropped clause (every
     captain's hold sits below) is not lost: recipe.stowed says it a moment later, at the instant
     the hold actually appears, which is where it belongs. */
  /* ⭐ HIS WORDS, 2026-09-09: "change 'Tap a recipe to highlight its docks' to 'tap a recipe to see
     its route'". THE WHOLE LADDER MOVES WITH IT — a rung still saying "docks" would teach a
     different noun for the same picture, which is the drift this ladder exists to prevent. And the
     lowercase is his, typed inside his own quotes; the pill is small italic text where it reads
     as a whisper rather than a heading. CAPITALISED on his second look, 2026-09-09 — the lowercase
     was mine, read back off the quotes in his message rather than asked about. */
  "recipe.draft": [
    "Tap a recipe to see its route — those five docks are what ye must gather.",
    "Tap a recipe to see its route.",
    null,
  ],

  // ---- THE ONE LADDER THAT ADDS A LINE. Nothing is said at this moment today, so its bottom
  // rung is SILENCE rather than today's copy — and a veteran's game is still byte-identical.
  // It earns the exception: the answer to "where did my recipe go?" is "look down there", and
  // nothing currently points down there. The captains box flashes once as the line lands; a
  // sentence saying `below` and a box that blinks are the same instruction twice, and the second
  // one works without being read.
  "recipe.stowed": [
    "Yer recipe's stowed below, {name} — five ingredients to find. Each gets a tick when ye hold it, and every captain's hold sits right beside yers.",
    "Yer recipe's stowed below — five ingredients to find, ticked as ye hold 'em.",
    "Yer recipe's stowed below.",
    null,
  ],

  // ---- the one square that takes two taps. Wyatt, 2026-09-11, playtest note 3: "'blue squares
  // take 2 taps' should be a rung on the tutorial ladder -- not always present." It had been on
  // every sail line that offered a blue square, for every captain, forever (W2-8). Like
  // recipe.stowed, its bottom rung is SILENCE: nothing is said here at all once it has been
  // learned, or with the parrot off. Counted by SIGHTING — only a sail line that actually offers a
  // blue square shows it (and spends it). Rung 0 says why there are two taps; the words after it
  // are his, unchanged from W2-8. How many sightings is his call, and it is on his sheet.
  "sail.twotap": [
    "Blue squares take two taps — the first shows ye the ride.",
    "Blue squares take two taps.",
    null,
  ],

  // ---- the trade winds, taught the first time the rim actually carries somebody
  "rim.sweep": [
    // ⭐ HIS WORDS, 2026-09-08, replacing my draft — it names the rim, the direction AND where ye
    // end up, which the old line left ye to work out from a moving picture.
    "Sail into the trade winds along the rim and they'll carry ye clockwise to the next whirlpool",
    null,
  ],

  // ---- the storm. Wyatt ruled it IN, 2026-09-02: it moves every ship three squares with no
  // explanation, and it hits about one first voyage in five.
  "storm.hit": [
    "A storm takes the whole crew — every ship runs three squares afore anyone acts.",
    null,
  ],

  // ---- the price of a crate. Also ruled IN. The Buy button already says −3🌕; what it never
  // says is that the number climbs as the island empties, which is why getting there first
  // matters. Legal under the editorial law: the button states the price, not that it moves.
  "dock.buy": [
    "Ingredients come dearer as an island empties — the early bird pays least.",
    null,
  ],
};
