// src/shared/index.js
//
// Phase 8 shared leaf tier (D-03/D-04). Holds no DOM, `window`, Firebase,
// wall-clock, or unseeded-random access — pure constants and pure helpers
// only, safe for both the engine module and (eventually) UI/net modules to
// import.

/* ================= RNG ================= */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

/* ================= Engine (port of cocoa_pirates_sim.py) ================= */
// THE 7 ingredients in the game — kept in the requested order, and matched 1:1 by
// assets/ingredients/*.png. There is no eighth or ninth: `salt` and `honey` used to trail this
// list as never-dealt leftovers (no art on disk, so they also 404'd the boot preloader) and were
// removed. `nIslands` (7) still slices this list so a smaller board stays possible; it is not a
// hint that more ingredients exist.
const ING_ALL=["wheat","dairy","sugar","eggs","cocoa","spice","vanilla"];
const ING_EMOJI={wheat:"🌾",eggs:"🥚",sugar:"🍬",cocoa:"🍫",dairy:"🥛",vanilla:"🌼",spice:"🌶️"};
// custom-art pipeline: drop matching files in assets/ and they render in place of the emoji/
// vector fallback automatically (iconAt() below removes the <image> on load failure, leaving
// the original emoji/shape visible) — nothing else in the code needs to change.
const ASSET_BASE="assets/";
const ING_IMG={};ING_ALL.forEach(i=>ING_IMG[i]=`${ASSET_BASE}ingredients/${i}.png`);
// blackened silhouette of each ingredient, same alpha shape as ING_IMG — rendered at 30%
// opacity to leave a "hole" where a crate used to sit once it's taken
const ING_HOLE_IMG={};ING_ALL.forEach(i=>ING_HOLE_IMG[i]=`${ASSET_BASE}ingredients/holes/${i}.png`);
const BOARD_IMG=`${ASSET_BASE}board.png`;
const DOCK_IMG=`${ASSET_BASE}dock.png`;
const WIND_ARROW_IMG=`${ASSET_BASE}wind-arrow.png`;
const TRADE_SWIRL_IMG=`${ASSET_BASE}trade-swirl.png`;
const PLAY_IMG=`${ASSET_BASE}icons/play.png`,PAUSE_IMG=`${ASSET_BASE}icons/pause.png`;
const FLIP_HEADS_IMG=`${ASSET_BASE}icons/flip-heads.png`,FLIP_TAILS_IMG=`${ASSET_BASE}icons/flip-tails.png`;
const CROWN_IMG=`${ASSET_BASE}icons/crown.png`,CRATE_OVERBOARD_IMG=`${ASSET_BASE}icons/crate-overboard.png`,
  CURRENT_SWIRL_ICON_IMG=`${ASSET_BASE}icons/current-swirl.png`,CUPCAKE_IMG=`${ASSET_BASE}icons/cupcake.png`,
  WAVE_IMG=`${ASSET_BASE}icons/wave.png`,CHECKMARK_IMG=`${ASSET_BASE}icons/checkmark.png`,
  DICE_IMG=`${ASSET_BASE}icons/dice.png`,EYES_IMG=`${ASSET_BASE}icons/eyes.png`,
  CANCEL_X_IMG=`${ASSET_BASE}icons/cancel-x.png`;
const COIN_IMG=`${ASSET_BASE}icons/coin-emoji.png`,FLAME_IMG=`${ASSET_BASE}icons/flame.png`,
  COIN_SPIN_IMG=`${ASSET_BASE}icons/coin-spin.png`;
const ANCHOR_IMG=`${ASSET_BASE}icons/anchor.png`,BATTLE_IMG=`${ASSET_BASE}icons/battle.png`,
  SAILBOAT_IMG=`${ASSET_BASE}icons/sailboat.png`,FISHING_ROD_IMG=`${ASSET_BASE}icons/fishing-rod.png`,
  HANDSHAKE_IMG=`${ASSET_BASE}icons/handshake.png`,SPOILS_POUCH_IMG=`${ASSET_BASE}icons/spoils-pouch.png`,
  STORM_CLOUD_IMG=`${ASSET_BASE}icons/storm-cloud.png`,SPYGLASS_IMG=`${ASSET_BASE}icons/spyglass.png`,
  FINISH_FLAG_IMG=`${ASSET_BASE}icons/finish-flag.png`,POCKET_COMPASS_IMG=`${ASSET_BASE}icons/pocket-compass.png`,
  FLEE_BOOT_IMG=`${ASSET_BASE}icons/flee-boot.png`,WIND_GUST_IMG=`${ASSET_BASE}icons/wind-gust.png`,
  DODGE_SWOOSH_IMG=`${ASSET_BASE}icons/dodge-swoosh.png`,IMPACT_BURST_IMG=`${ASSET_BASE}icons/impact-burst.png`,
  COINS_FLYING_IMG=`${ASSET_BASE}icons/coins-flying.png`,CANDY_CRAB_IMG=`${ASSET_BASE}icons/candy-crab.png`,
  ISLAND_SILHOUETTE_IMG=`${ASSET_BASE}icons/island-silhouette.png`,REPAIR_TOOLS_IMG=`${ASSET_BASE}icons/repair-tools.png`,
  TARGET_IMG=`${ASSET_BASE}icons/target.png`,SUGARFISH_IMG=`${ASSET_BASE}icons/sugarfish.png`,
  FISH_IMG=`${ASSET_BASE}icons/fish.png`,BLOCKED_SLASH_IMG=`${ASSET_BASE}icons/blocked-slash.png`;
const HOURGLASS_IMG=`${ASSET_BASE}icons/hourglass.png`,ALARM_IMG=`${ASSET_BASE}icons/alarm.png`,
  STOPWATCH_IMG=`${ASSET_BASE}icons/stopwatch.png`,PAUSE_SYMBOL_IMG=`${ASSET_BASE}icons/pause-symbol.png`;
// AUDIO-02/D-14 (phase 21): Wyatt's own megaphone pair, replacing the 🔊/🔇 emoji scaffold 21-04
// shipped. Two drawn states rather than the timer toggle's swap-to-a-bare-blocked-slash — a drawn
// red X reads as "sound off" at the button's ~29px render size, where a bare slash reads only as
// "off" without saying off what.
const SOUND_ON_IMG=`${ASSET_BASE}icons/sound-on.png`,SOUND_OFF_IMG=`${ASSET_BASE}icons/sound-off.png`;
const DAGGER_IMG=`${ASSET_BASE}icons/dagger.png`,SKULL_IMG=`${ASSET_BASE}icons/skull.png`,
  SNAIL_IMG=`${ASSET_BASE}icons/snail.png`,SALUTE_CAPTAIN_IMG=`${ASSET_BASE}icons/salute-captain.png`,
  SHIELD_IMG=`${ASSET_BASE}icons/shield.png`,CROISSANT_IMG=`${ASSET_BASE}icons/croissant.png`,
  CAKE_SLICE_IMG=`${ASSET_BASE}icons/cake-slice.png`,DONUT_IMG=`${ASSET_BASE}icons/donut.png`;
const SCROLL_IMG=`${ASSET_BASE}icons/scroll.png`,DOOR_IMG=`${ASSET_BASE}icons/door.png`,
  ROBOT_IMG=`${ASSET_BASE}icons/robot.png`,WARNING_IMG=`${ASSET_BASE}icons/warning.png`,
  STORYBOOK_IMG=`${ASSET_BASE}icons/storybook.png`,RIBBON_IMG=`${ASSET_BASE}icons/ribbon.png`,
  SPEECH_BUBBLE_IMG=`${ASSET_BASE}icons/speech-bubble.png`,KEY_IMG=`${ASSET_BASE}icons/key.png`,
  MAP_IMG=`${ASSET_BASE}icons/map.png`,STOOL_IMG=`${ASSET_BASE}icons/stool.png`,
  DEVICE_IMG=`${ASSET_BASE}icons/device.png`,PARROT_IMG=`${ASSET_BASE}icons/parrot.png`,
  MAGNIFYING_GLASS_IMG=`${ASSET_BASE}icons/magnifying-glass.png`,CLOSE_X_IMG=`${ASSET_BASE}icons/close-x.png`,
  HORN_IMG=`${ASSET_BASE}icons/horn.png`,REFUSED_IMG=`${ASSET_BASE}icons/refused.png`,
  GEAR_IMG=`${ASSET_BASE}icons/gear.png`,REPLAY_IMG=`${ASSET_BASE}icons/replay.png`,
  PRINTER_IMG=`${ASSET_BASE}icons/printer.png`,ENVELOPE_IMG=`${ASSET_BASE}icons/envelope.png`,
  PLAY_ARROW_IMG=`${ASSET_BASE}icons/play-arrow.png`,SPARKLES_IMG=`${ASSET_BASE}icons/sparkles.png`,
  GLOBE_IMG=`${ASSET_BASE}icons/globe.png`,PIRATE_CHEF_IMG=`${ASSET_BASE}icons/pirate-chef.png`,
  PIRATE_FLAG_IMG=`${ASSET_BASE}icons/pirate-flag.png`;
const CLOCK_IMG=`${ASSET_BASE}clock/clock.png`;
const FLIP_SOCKET_IMG=`${ASSET_BASE}icons/flip-socket.png`;
const COMPASS_DIAL_IMG=`${ASSET_BASE}compass/compass-dial.png`,COMPASS_NEEDLE_IMG=`${ASSET_BASE}compass/compass-needle.png`;
// every emoji in the game that has dedicated custom art — the single source of truth emojify()
// (below) and popEmoji() both draw from, so a new icon only needs adding here once. Keys are the
// bare emoji; emojify() also matches an optional trailing variation selector (️) so it
// doesn't matter whether a given call site typed e.g. "⚔" or "⚔️".
const EMOJI_IMG={
  "🌕":COIN_IMG,"⚫":FLIP_TAILS_IMG,"⚪":FLIP_HEADS_IMG,"🔥":FLAME_IMG,"🪙":COIN_SPIN_IMG,
  "⚓":ANCHOR_IMG,"⚔":BATTLE_IMG,"⛵":SAILBOAT_IMG,"🎣":FISHING_ROD_IMG,"🌀":CURRENT_SWIRL_ICON_IMG,
  "🤝":HANDSHAKE_IMG,"👑":CROWN_IMG,"💰":SPOILS_POUCH_IMG,"⛈":STORM_CLOUD_IMG,"🔭":SPYGLASS_IMG,
  "🏁":FINISH_FLAG_IMG,"🧭":POCKET_COMPASS_IMG,"🏃":FLEE_BOOT_IMG,"🌬":WIND_GUST_IMG,"💨":DODGE_SWOOSH_IMG,
  "💥":IMPACT_BURST_IMG,"💸":COINS_FLYING_IMG,"🦀":CANDY_CRAB_IMG,"🏝":ISLAND_SILHOUETTE_IMG,
  "📦":CRATE_OVERBOARD_IMG,"🛠":REPAIR_TOOLS_IMG,"🎯":TARGET_IMG,"🐠":SUGARFISH_IMG,"🐟":FISH_IMG,
  "🚫":BLOCKED_SLASH_IMG,
  "⏳":HOURGLASS_IMG,"⏰":ALARM_IMG,"⏱":STOPWATCH_IMG,"⏸":PAUSE_SYMBOL_IMG,
  "🧁":CUPCAKE_IMG,"🗡":DAGGER_IMG,"💀":SKULL_IMG,"🐌":SNAIL_IMG,"🫡":SALUTE_CAPTAIN_IMG,
  "🛡":SHIELD_IMG,"🌊":WAVE_IMG,"🥐":CROISSANT_IMG,"🍰":CAKE_SLICE_IMG,"🍩":DONUT_IMG,
  "📜":SCROLL_IMG,"🚪":DOOR_IMG,"🤖":ROBOT_IMG,"⚠":WARNING_IMG,"📖":STORYBOOK_IMG,"🎗":RIBBON_IMG,
  "💬":SPEECH_BUBBLE_IMG,"🔑":KEY_IMG,"🗺":MAP_IMG,"🪑":STOOL_IMG,"📱":DEVICE_IMG,"🦜":PARROT_IMG,
  "🔍":MAGNIFYING_GLASS_IMG,"✕":CLOSE_X_IMG,"✅":CHECKMARK_IMG,"❌":CANCEL_X_IMG,"📯":HORN_IMG,
  "🙅":REFUSED_IMG,"🎲":DICE_IMG,"👀":EYES_IMG,"⚙":GEAR_IMG,"🔁":REPLAY_IMG,"🖨":PRINTER_IMG,
  "✉":ENVELOPE_IMG,"➤":PLAY_ARROW_IMG,"✨":SPARKLES_IMG,"🌍":GLOBE_IMG,"🧑‍🍳":PIRATE_CHEF_IMG,
  "🏴‍☠":PIRATE_FLAG_IMG,"▶":PLAY_IMG,
};
// sorted longest-first so multi-codepoint sequences (e.g. the ZWJ chef/flag emoji) match whole,
// not as a stray prefix character followed by leftover combining codepoints. The optional ️
// is inside the group so it applies to every alternative, not just the last one.
const EMOJIFY_RE=new RegExp(
  "(?:"+Object.keys(EMOJI_IMG).sort((a,b)=>b.length-a.length)
    .map(e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")\\uFE0F?","gu");
// drop-in replacement for any narration/label/log HTML string: swaps every emoji that has custom
// art for its <img>, leaving anything without dedicated art untouched. Safe to run more than once
// on the same string (already-swapped text has no emoji left to match) — deliberately applied at
// more than one chokepoint (describe(), panel()) rather than tracked precisely, since re-scanning
// a short string is free and missing a spot silently isn't.
function emojify(html){
  if(!html)return html;
  return html.replace(EMOJIFY_RE,m=>iconImg(EMOJI_IMG[m.replace(/️$/,"")]));
}
const BOAT_IMG=[1,2,3,4].map(i=>`${ASSET_BASE}boats/${i}.png`);
// 7 base island footprints (see TET below); art is authored once per shape in its canonical
// orientation — the game applies the same rotate/mirror it used to place the shape on the board.
const ISLAND_SHAPE_IMG=[1,2,3,4,5,6,7].map(i=>`${ASSET_BASE}islands/${i}.png`);
// 3–4 block island shapes: lines, Ls, corner, square, S, T. Shared by board generation
// (Game constructor, below) and by island art placement (renderBoard) — index into this array
// is the canonical shape id baked into each islands/N.png filename (1-based) via ISLAND_SHAPE_IMG.
// ORDER IS LOAD-BEARING — indexed by Math.floor(this.r()*TET.length) for shape selection, and separately by ISLAND_SHAPE_IMG for art placement, so a reorder breaks both RNG parity and rendering.
const TET=[
  [[0,0],[1,0],[2,0]],[[0,0],[1,0],[0,1]],
  [[0,0],[1,0],[2,0],[3,0]],[[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[0,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[1,0],[2,0],[1,1]]];
const ING_NAME={wheat:"Toasty Wheat",dairy:"Fresh Milk",sugar:"Crystal Sugar",eggs:"Speckled Eggs",
  cocoa:"Cacao Pods",vanilla:"Vanilla Beans",spice:"Hot Cinnamon"};
// the plain baker's term each pirate ingredient stands in for — shown as a gloss on recipe cards
const ING_PLAIN={wheat:"flour",dairy:"butter & milk",sugar:"sugar",eggs:"eggs",
  cocoa:"chocolate",vanilla:"vanilla",spice:"cinnamon"};
// worldbuilding (notes/edits #2): every ingredient island has a place-name + a flavorful haul,
// announced when a pirate docks there. One entry per ingredient in ING_ALL — all 7.
const DOCK_PLACE={sugar:"Glitter Bay",vanilla:"Custard Key",spice:"the Spice Isle",
  wheat:"the Flour Patch",dairy:"Full Cream Folly",eggs:"Clucker's Cove",cocoa:"Cocoa Cabana"};
// NARR-01/D-25/D-48 (Wyatt-approved 2026-07-29): flavour phrasing, kept and applied verbatim.
// F5 (Wyatt-approved 2026-07-29): *"when the ingredient icons are referencing an ingredient (not the
// island) they should always consistently go directly in front of the ingredient, not in front of
// the flavor like they do now."*
//
// So the icon has to be inserted BETWEEN the quantity/container phrase and the product name — and
// THE INSERTION POINT CANNOT BE DERIVED FROM THE STRING. iname("cocoa") is "Cacao Pods" while this
// flavour reads "Luscious Cacao Beans": there is no substring to match on, and a regex guessing at
// it would silently produce "a pod of Luscious 🍫 Cacao Beans". So the split is DECLARED AS DATA
// here, once, and dockFlavorIcon() below is the only thing that decides where the icon goes.
//
// The name keeps every adjective that belongs to it ("Luscious", "Red-Hot", "Sand-Speckled"). Note
// `eggs`: its prefix carries no "of" — that asymmetry is exactly why this is data and not a pattern.
const DOCK_FLAVOR={sugar:{prefix:"a jar of",name:"Crystal Sugar"},vanilla:{prefix:"a bundle of",name:"Velvety Vanilla Beans"},
  spice:{prefix:"sprigs of",name:"Red-Hot Cinnamon"},wheat:{prefix:"a sack of",name:"Toasty Wheat"},dairy:{prefix:"some jugs of",name:"Fresh Milk"},
  eggs:{prefix:"a dozen",name:"Sand-Speckled Eggs"},cocoa:{prefix:"a pod of",name:"Luscious Cacao Beans"}};
const dockPlace=x=>DOCK_PLACE[x]||"the island";
// UNCHANGED in signature AND in value — all 7 joined strings stay byte-identical, because two things
// depend on that: the seven `misc:dockFlavor:<ing>` audit cards render dockFlavor(ing) directly (so
// Wyatt's seven reviewed rows read exactly as they did), and the neutral dock narration's own
// wording is not what F5 changes. scripts/narration_test.js pins all 7 against hardcoded literals.
const dockFlavor=x=>{const f=DOCK_FLAVOR[x];return f?`${f.prefix} ${f.name}`:iname(x);};
const iname=x=>ING_NAME[x]||x;
const ilabel=x=>ING_EMOJI[x]+" "+iname(x);
const ingImg=x=>`<img src="${ING_IMG[x]}" alt="${iname(x)}">`;
// narration uses the custom ingredient art (not the raw emoji) so wording matches the rest of the UI
const ilabelImg=x=>`<img class="narrIcon" src="${ING_IMG[x]}" alt="${iname(x)}"> ${iname(x)}`;
// same idea as ilabelImg but for the one-off custom icons (crown, dice, etc.) that stand in for a
// single emoji rather than an ingredient — drop-in replacement for that emoji character in any
// narration/label string that already renders as HTML
const iconImg=src=>`<img class="narrIcon" src="${src}" alt="">`;
// F5: dockFlavor() with the ingredient's icon inserted immediately before the NAME, per the declared
// {prefix,name} split above. THE ONE PLACE that decides where a dock-flavour icon goes — every dock
// string in src/ui/flow.js and src/ui/util.js routes through here, so the branches cannot drift apart
// again. Differs from dockFlavor() by nothing but the inserted icon; narration_test.js proves that by
// stripping the icon back out and comparing (D-16: an icon is never dropped, only moved).
// The unknown-key fallback emits no icon rather than an `src="undefined"` img: for a key with no art
// there is no icon to drop, so D-16 has nothing to protect here.
const dockFlavorIcon=x=>{
  const f=DOCK_FLAVOR[x],icon=ING_IMG[x]?iconImg(ING_IMG[x])+" ":"";
  return f?`${f.prefix} ${icon}${f.name}`:`${icon}${iname(x)}`;
};
// ORDER IS LOAD-BEARING — its Object.values iteration order builds the candidate dock-cell array that the constructor then indexes with an this.r()-derived index; a reorder changes every dock position for an identical RNG draw, and also flips seat-spawn assignment and Dijkstra tie-breaks.
const DIRS={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};
// ORDER IS LOAD-BEARING — parallel table keyed to DIRS; must stay in lockstep with it.
const DIRNAME={N:"north",S:"south",E:"east",W:"west"};
// a storm's 2nd gust always veers 90° off the 1st (never the same direction, never reversing)
// ORDER IS LOAD-BEARING — consumed only by the classic live turn loop, where PERP[windNow][Math.floor(game.r()*2)] indexes directly by RNG draw. The headless corpus cannot catch a reorder here.
const PERP={N:["E","W"],S:["E","W"],E:["N","S"],W:["N","S"]};
// the combined diagonal a storm actually carries you toward — used to aim the single wind needle
// ORDER IS LOAD-BEARING — consumed only by the classic live turn loop alongside PERP, to aim the storm's combined wind-needle diagonal; the headless corpus cannot catch a reorder here.
const STORM_DIAG={N:{E:45,W:315},S:{E:135,W:225},E:{N:45,S:135},W:{N:315,S:225}};
// New wind mechanic (see notes/edits for pastry pirates.pdf #7): wind no longer force-moves
// anyone each turn — it only prices voluntary movement. Sailing draws from a per-turn point
// budget; moving with the wind is cheap, against it is expensive, crossing it is in between.
// Storms are the only thing left that still shoves ships around (see Game.windPush/windLeg).
// ORDER IS LOAD-BEARING — parallel table keyed to DIRS; must stay in lockstep with it (also consumed by windStepCost below).
const OPPOSITE={N:"S",S:"N",E:"W",W:"E"};
const SAIL_BUDGET=9,SAIL_BUDGET_LEEWARD=7;
const windStepCost=(windDir,dirKey)=>dirKey===windDir?2:(dirKey===OPPOSITE[windDir]?4:3);
const NAMES=["Capt. Davy Scones","Capt. Crustbeard","Capt. Dough Hook","Capt. Flaky Jack"];
// default captain names in seat order (no "Capt. " prefix) — the pool a player who leaves the
// name box blank draws from, mirroring the defaults pname() shows for un-claimed seats.
const DEFAULT_NAMES=NAMES.map(n=>n.replace("Capt. ",""));
// #15/#2: a blank name box no longer gets a *random* captain name (which could collide with a
// bot's or another captain's default — the "two Crustbeards" bug). Instead pick a name no seat
// in `seats` is already using, preferring the one that belongs to `preferIdx`'s own seat so the
// solo/host player at seat 0 reliably becomes "Davy Scones".
function unusedDefaultName(seats,preferIdx){
  const taken=new Set();
  Object.keys(seats||{}).forEach(k=>{
    const s=seats[k]||{};
    const nm=s.id?(s.name||"").trim():DEFAULT_NAMES[+k];
    if(nm)taken.add(nm);
  });
  if(preferIdx!=null&&!taken.has(DEFAULT_NAMES[preferIdx]))return DEFAULT_NAMES[preferIdx];
  return DEFAULT_NAMES.find(nm=>!taken.has(nm))||DEFAULT_NAMES[preferIdx||0];
}
const COLORS=["var(--p0)","var(--p1)","var(--p2)","var(--p3)"];
const HEXCOL=["#f2679e","#1d96a6","#27c78d","#f5a623"];
const man=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);

export { mulberry32, ING_ALL, ING_EMOJI, ASSET_BASE, ALARM_IMG, ANCHOR_IMG, BATTLE_IMG, BLOCKED_SLASH_IMG, BOARD_IMG, BOAT_IMG, CAKE_SLICE_IMG, CANCEL_X_IMG, CANDY_CRAB_IMG, CHECKMARK_IMG, CLOCK_IMG, CLOSE_X_IMG, COINS_FLYING_IMG, COIN_IMG, COIN_SPIN_IMG, COMPASS_DIAL_IMG, COMPASS_NEEDLE_IMG, CRATE_OVERBOARD_IMG, CROISSANT_IMG, CROWN_IMG, CUPCAKE_IMG, CURRENT_SWIRL_ICON_IMG, DAGGER_IMG, DEVICE_IMG, DICE_IMG, DOCK_IMG, DODGE_SWOOSH_IMG, DONUT_IMG, DOOR_IMG, EMOJI_IMG, ENVELOPE_IMG, EYES_IMG, FINISH_FLAG_IMG, FISHING_ROD_IMG, FISH_IMG, FLAME_IMG, FLEE_BOOT_IMG, FLIP_HEADS_IMG, FLIP_SOCKET_IMG, FLIP_TAILS_IMG, GEAR_IMG, GLOBE_IMG, HANDSHAKE_IMG, HORN_IMG, HOURGLASS_IMG, IMPACT_BURST_IMG, ING_HOLE_IMG, ING_IMG, ISLAND_SHAPE_IMG, ISLAND_SILHOUETTE_IMG, KEY_IMG, MAGNIFYING_GLASS_IMG, MAP_IMG, PARROT_IMG, PAUSE_IMG, PAUSE_SYMBOL_IMG, PIRATE_CHEF_IMG, PIRATE_FLAG_IMG, PLAY_ARROW_IMG, PLAY_IMG, POCKET_COMPASS_IMG, PRINTER_IMG, REFUSED_IMG, REPAIR_TOOLS_IMG, REPLAY_IMG, RIBBON_IMG, ROBOT_IMG, SAILBOAT_IMG, SALUTE_CAPTAIN_IMG, SCROLL_IMG, SHIELD_IMG, SKULL_IMG, SNAIL_IMG, SPARKLES_IMG, SPEECH_BUBBLE_IMG, SPOILS_POUCH_IMG, SPYGLASS_IMG, STOOL_IMG, SOUND_OFF_IMG, SOUND_ON_IMG, STOPWATCH_IMG, STORM_CLOUD_IMG, STORYBOOK_IMG, SUGARFISH_IMG, TARGET_IMG, TRADE_SWIRL_IMG, WARNING_IMG, WAVE_IMG, WIND_ARROW_IMG, WIND_GUST_IMG, EMOJIFY_RE, emojify, TET, ING_NAME, ING_PLAIN, DOCK_PLACE, DOCK_FLAVOR, dockPlace, dockFlavor, dockFlavorIcon, iname, ilabel, ingImg, ilabelImg, iconImg, DIRS, DIRNAME, PERP, STORM_DIAG, OPPOSITE, SAIL_BUDGET, SAIL_BUDGET_LEEWARD, windStepCost, NAMES, DEFAULT_NAMES, unusedDefaultName, COLORS, HEXCOL, man };
