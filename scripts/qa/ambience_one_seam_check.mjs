#!/usr/bin/env node
/* GATE: the ambience bed loads on its OWN path and starts from ONE seam.
 *
 *   node scripts/qa/ambience_one_seam_check.mjs
 *
 * WHY THIS EXISTS, and both halves were paid for before it was written.
 *
 * 1. THE LOAD PATH. `initAudio()` does `await Promise.all(SFX_FILES.map(loadOne))` — NO sound in
 *    the game can play until every stem in that array has downloaded and decoded. docs/AUDIO.md §3
 *    wrote the consequence down in advance: "Add a music bed to that list and every sound effect in
 *    the game goes silent until the music finishes downloading, potentially the first minute of
 *    play on a phone." The ambience is 917 KB against the ten stems' 583 KB — putting it in
 *    SFX_FILES would roughly triple the wait before a coin flip makes a noise, on the connection
 *    least able to afford it. The next session to add a stem will not have read that paragraph.
 *    THIS GATE HAS. It fails if any ambience clip appears in SFX_FILES.
 *
 * 2. THE SEAM. Wyatt, 2026-09-06, after the drumroll was "fixed" by pasting the call into the guest
 *    twin as well: "DO NOT ARCHITECT DRIFTABLE CODE OR I WILL FIRE YOU" and "there should be NO
 *    more precedent for drift, we have been fixing that tech debt for weeks now!!!" A bed started
 *    from a host path and a guest path is that same fault in a new coat — two screens, two
 *    lifetimes, and nothing making them agree.
 *    The bed is therefore started by the VIEW being up, not by who is computing the game.
 *    src/ui/lobby.js's own header already states the rule for its three screen functions: "Wired in
 *    these three functions rather than at each caller, because every route to these screens goes
 *    through them and a route added later cannot forget." showGameView() starts it; showHome() and
 *    showRoom() stop it. Solo, pass-and-play, host, guest and the reload-resume path all reach the
 *    board through those three and cannot drift apart.
 *
 * DERIVED, NOT LISTED — CLAUDE.md, "nothing is a constant". Every name below is read out of
 * src/ui/audio.js's own arrays. Adding a thirteenth clip needs no edit here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO = path.join(REPO, "src", "ui", "audio.js");
const LOBBY = path.join(REPO, "src", "ui", "lobby.js");

const failures = [];
const ok = m => console.log("  PASS  ", m);
const bad = m => { failures.push(m); console.log("  FAIL  ", m); };

console.log("ambience_one_seam_check — the bed loads on its own path and starts from one seam\n");

const audio = fs.readFileSync(AUDIO, "utf8");
const lobby = fs.readFileSync(LOBBY, "utf8");

const arr = (src, name) => {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  return m ? m[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : null;
};

const AMB = arr(audio, "AMBIENCE_FILES");
const SFX = arr(audio, "SFX_FILES");

if (!AMB) {
  bad("src/ui/audio.js declares no AMBIENCE_FILES array — the gate cannot derive what to check, " +
      "so it fails rather than passing on nothing.");
} else if (!AMB.length) {
  bad("AMBIENCE_FILES is empty — a gate that checks zero files is not a green gate.");
} else {
  ok(`AMBIENCE_FILES names ${AMB.length} clip(s)`);

  /* 1 — every clip is on disk. Same reason sfx_files_exist_check exists: a merge once left
     src/ui/audio.js naming ten stems while sfx/ held eight, and npm test stayed green. */
  const missing = AMB.filter(s => !fs.existsSync(path.join(REPO, "sfx", `${s}.mp3`)));
  missing.length
    ? bad(`${missing.length} ambience clip(s) have no mp3 in sfx/: ${missing.map(s => s + ".mp3").join(", ")}`)
    : ok(`all ${AMB.length} ambience clips have an mp3 in sfx/`);

  /* 2 — THE LOAD PATH. Not one of them may sit in SFX_FILES. */
  if (!SFX) {
    bad("could not read SFX_FILES to prove the ambience is kept out of it");
  } else {
    const leaked = AMB.filter(s => SFX.includes(s));
    leaked.length
      ? bad(`${leaked.length} ambience clip(s) are in SFX_FILES: ${leaked.join(", ")}. ` +
            `initAudio() awaits Promise.all over that array, so EVERY sound in the game — the coin ` +
            `flip, the cannon, the your-turn bell — would stay silent until the whole ${
              Math.round(AMB.reduce((a, s) => a + (fs.existsSync(path.join(REPO, "sfx", s + ".mp3"))
                ? fs.statSync(path.join(REPO, "sfx", s + ".mp3")).size : 0), 0) / 1024)
            } KB bed had downloaded and decoded. docs/AUDIO.md §3 names this exact failure.`)
      : ok("no ambience clip is in SFX_FILES — the bed cannot block the game's other sounds");
  }

  /* 3 — the bed must have a load path of its own, or point 2 is met by simply never loading it. */
  /^\s*async function initAmbience\s*\(/m.test(audio) || /function initAmbience\s*\(/.test(audio)
    ? ok("initAmbience() exists — the bed has a load path of its own")
    : bad("no initAmbience() in src/ui/audio.js — keeping the clips out of SFX_FILES is only half " +
          "the requirement; they still need a path that fetches them without blocking the others.");
}

/* 4 — ONE SEAM. The three screen functions in lobby.js, and nowhere else. */
const startCalls = (lobby.match(/\bstartAmbience\s*\(/g) || []).length;
const stopCalls = (lobby.match(/\bstopAmbience\s*\(/g) || []).length;

const bodyOf = name => {
  const i = lobby.indexOf(`export function ${name}(){`);
  if (i < 0) return "";
  const j = lobby.indexOf("\n}", i);
  return lobby.slice(i, j < 0 ? lobby.length : j);
};

startCalls === 1
  ? ok("startAmbience() is called exactly once in src/ui/lobby.js")
  : bad(`startAmbience() is called ${startCalls} time(s) in src/ui/lobby.js — it must be exactly 1. ` +
        `Two start seams is the drumroll fault again: two screens, two lifetimes, nothing making them agree.`);

/\bstartAmbience\s*\(/.test(bodyOf("showGameView"))
  ? ok("showGameView() is the seam that starts the bed")
  : bad("showGameView() does not start the bed. It is the one function every route to the board " +
        "passes through — solo, pass-and-play, host, guest and the reload-resume path alike.");

stopCalls === 2
  ? ok("stopAmbience() is called exactly twice — showHome() and showRoom()")
  : bad(`stopAmbience() is called ${stopCalls} time(s) in src/ui/lobby.js — it must be exactly 2, ` +
        `one for each way of leaving the board.`);

for (const fn of ["showHome", "showRoom"]) {
  /\bstopAmbience\s*\(/.test(bodyOf(fn))
    ? ok(`${fn}() stops the bed`)
    : bad(`${fn}() does not stop the bed — leaving the board would leave the sea running under the lobby.`);
}

/* 5 — no OTHER file may start or stop it. That is what keeps the seam single. */
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.name === "node_modules" || e.name.startsWith(".") ? []
    : e.isDirectory() ? walk(path.join(d, e.name))
    : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

const strays = walk(path.join(REPO, "src"))
  .filter(f => f !== AUDIO && f !== LOBBY)
  .filter(f => /\b(startAmbience|stopAmbience)\s*\(/.test(fs.readFileSync(f, "utf8")))
  .map(f => path.relative(REPO, f));

strays.length
  ? bad(`${strays.length} file(s) outside lobby.js start or stop the bed: ${strays.join(", ")}. ` +
        `The seam is the SCREEN being up, never a game tier — a host path and a guest path is drift.`)
  : ok("no file outside src/ui/lobby.js starts or stops the bed");

/* 6 — his tuned numbers survive as named constants a human can find and change. */
const wants = [
  ["AMBIENCE_SEA", 0.596], ["AMBIENCE_GULL", 0.168], ["AMBIENCE_CREAK", 1.122],
  /* ⭐ REVERSED BY HIS EARS, 2026-09-07 playtest sound sheet item 3: "Creaks should be every 8
     seconds; gulls every 14 seconds." That overrides the 10/13 he dialled in the tuner the same
     day — the tuner was a slider, the playtest was a game. The later ruling wins, and the older
     pair is written here rather than deleted so nobody restores it from the tuner artifact. */
  ["AMBIENCE_GULL_MEAN_SEC", 14], ["AMBIENCE_CREAK_MEAN_SEC", 8],
  ["AMBIENCE_SPREAD", 0.7], ["AMBIENCE_LIVELINESS", 0.35],
];
const wrong = wants.filter(([k, v]) => {
  const m = audio.match(new RegExp(`const\\s+${k}\\s*=\\s*([0-9.]+)`));
  return !m || Number(m[1]) !== v;
});
wrong.length
  ? bad(`${wrong.length} of Wyatt's tuned value(s) are missing or changed: ` +
        `${wrong.map(([k, v]) => `${k} should be ${v}`).join("; ")}. He dialled these by hand in the ` +
        `Sea Bed Tuner on 2026-09-07; they are his ruling, not a default to be improved on.`)
  : ok(`all ${wants.length} of his tuned values are present, unchanged`);

/* ================= THE THREE-WAY SOUND SWITCH, and the music it gates ================= */
/* Wyatt, 2026-09-07: "Make sure The audio/mute switch is 3-way— sound+music, sound, mute— repeat
   again from sound+music." and "the song shouldn't immediately restart after it finishes— it
   should wait a minute."

   WHY A GATE AND NOT JUST CODE. This is the case docs/AUDIO.md §4 left open as an open question in
   August ("Three-state cycle instead of two switches?") and he has now ruled on. A cycle is the
   kind of thing a later session "simplifies" back to a boolean without realising a state was lost,
   because two of the three states look identical from outside (sound is on in both). The row's own
   CSS is the other half: index.html renders the label from ONE attribute so the icon and the words
   cannot disagree, and a fourth state added to the mode without a matching label reads as a silent
   blank row. */
const PANEL = path.join(REPO, "src", "ui", "panel.js");
const INDEX = path.join(REPO, "index.html");
const ORCH = path.join(REPO, "src", "orchestrator.js");
const panel = fs.readFileSync(PANEL, "utf8");
const index = fs.readFileSync(INDEX, "utf8");
const orch = fs.readFileSync(ORCH, "utf8");

const modes = arr(audio, "SOUND_MODES");
if (!modes) {
  bad("src/ui/audio.js declares no SOUND_MODES array — the three-way switch is the ruling of " +
      "2026-09-07 and the gate cannot derive its states.");
} else if (modes.length !== 3 || modes.join(",") !== "full,sfx,mute") {
  bad(`SOUND_MODES is [${modes.join(", ")}] — it must be exactly full, sfx, mute IN THAT ORDER. ` +
      `His words: "sound+music, sound, mute— repeat again from sound+music", so the cycle order is ` +
      `part of the ruling, not an implementation detail.`);
} else {
  ok("SOUND_MODES is full -> sfx -> mute, in his order");

  /* The cycle must WRAP. A three-state control that sticks on the last state is the most likely
     way to get this wrong and the hardest to see in a diff. */
  /function cycleSoundMode\s*\(/.test(audio)
    ? ok("cycleSoundMode() exists")
    : bad("no cycleSoundMode() in src/ui/audio.js — the row needs one function that advances and wraps.");

  /* Every one of the three states needs a label, and they are rendered from data-audio, which the
     file's own comment calls the single carrier of the truth. */
  const labelled = ["muted", "nomusic", "ok"].filter(s => index.includes(`#btnMute[data-audio="${s}"]::after`));
  labelled.length === 3
    ? ok("index.html gives all three states their own menu-row label, driven by data-audio")
    : bad(`index.html labels ${labelled.length}/3 sound states (found: ${labelled.join(", ") || "none"}). ` +
          `A state with no label renders a blank row, and the player cannot tell which of the three they are in.`);

  /* aria-pressed is a BINARY. Leaving it on a three-state control tells a screen reader the sound
     is either on or off, which is now false for one of the three states. */
  /* SETTING it is the fault; REMOVING a stale one is the fix, and an earlier version of this
     assertion grepped for the string and condemned the fix along with the fault. CLAUDE.md: "when
     a check condemns something known to work, suspect the check first." So it looks for a WRITE. */
  /setAttrIf\s*\(\s*muteEl\s*,\s*["']aria-pressed["']/.test(panel) || /muteEl\.setAttribute\s*\(\s*["']aria-pressed["']/.test(panel)
    ? bad("src/ui/panel.js still SETS aria-pressed on the sound row. That attribute is binary and " +
          "the control now has three states — it would announce 'sound off' or 'sound on' for a mode " +
          "that is neither. The state belongs in aria-label, which the row already keeps in step.")
    : ok("the sound row no longer claims a binary pressed state");

  /* The old boolean toggle must not survive alongside the cycle — two ways to change one setting is
     exactly the drift rule 23 forbids. */
  /setMuted\s*\(\s*!\s*isMuted\s*\(\s*\)\s*\)/.test(orch)
    ? bad("src/orchestrator.js still flips the sound with setMuted(!isMuted()) — that is the old " +
          "two-state toggle, and it can only ever reach two of the three modes.")
    : ok("the orchestrator's sound control goes through the cycle, not a boolean flip");
}

/* THE MUSIC — the file, its own load path, and the gap he asked for. */
const musicFile = (audio.match(/const\s+MUSIC_FILE\s*=\s*["']([^"']+)["']/) || [])[1];
if (!musicFile) {
  bad("src/ui/audio.js declares no MUSIC_FILE — the music has no named stem for anything to check.");
} else {
  fs.existsSync(path.join(REPO, "sfx", `${musicFile}.mp3`))
    ? ok(`the music track sfx/${musicFile}.mp3 exists`)
    : bad(`src/ui/audio.js names the music stem "${musicFile}" but sfx/${musicFile}.mp3 is not on disk — a 404 and a silent voyage.`);

  SFX && SFX.includes(musicFile)
    ? bad(`the music stem "${musicFile}" is in SFX_FILES. It is 540 KB and initAudio() awaits that ` +
          `whole array, so every sound effect in the game would wait for the song to download.`)
    : ok("the music is not in SFX_FILES either — it cannot block the game's other sounds");
}

const gap = (audio.match(/const\s+MUSIC_GAP_SEC\s*=\s*(\d+)/) || [])[1];
gap === "60"
  ? ok("MUSIC_GAP_SEC is 60 — the minute he asked for before the song comes round again")
  : bad(`MUSIC_GAP_SEC is ${gap === undefined ? "not declared" : gap} — it must be 60. His words: ` +
        `"the song shouldn't immediately restart after it finishes— it should wait a minute."`);

/* A LOOPING music source would defeat the gap entirely, and it is the obvious thing to reach for. */
/musicSrc\s*\.\s*loop\s*=\s*true/.test(audio)
  ? bad("the music source sets loop = true, which restarts the song the instant it ends and makes " +
        "MUSIC_GAP_SEC dead code. The gap needs the track to END and a timer to bring it back.")
  : ok("the music does not loop — it ends, waits, and comes round again");

/* THE CREDIT. He asked for it by name and credits are generated from the modal, never hand-edited. */
for (const who of ["Fiddlers Plus", "Muster Field Farms"]) {
  index.includes(who)
    ? ok(`the credits modal thanks ${who} for the music`)
    : bad(`the credits modal in index.html does not name ${who}. Wyatt asked for it on 2026-09-07, ` +
          `and credits.html is GENERATED from that modal — editing the page instead would be caught ` +
          `by credits_page_check.mjs as drift.`);
}

console.log(failures.length ? `\nFAIL — ${failures.length} failure(s)` : `\nPASS — 0 failure(s)`);
process.exit(failures.length ? 1 : 0);
