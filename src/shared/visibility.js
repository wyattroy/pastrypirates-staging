// src/shared/visibility.js
//
// ============================================================================
// WHO MAY SEE WHAT — the game's secrecy rules, as CAPABILITIES rather than modes.
// ============================================================================
// STEP 5, THE NARROW HALF. Wyatt, 2026-08-31, choosing it over the full rename: "Do the narrow
// half." The plan's step 5 asked for a Decider interface so that "mode branches start
// disappearing"; CEO review 41 was right that claiming that was done while thirteen `passAndPlay`
// reads remained — three of them deciding what is DRAWN — was a claim larger than the code.
// These are those three.
//
// THE ARGUMENT IS THE PLAN'S OWN, and it is worth keeping because it is what makes this a
// simplification rather than a rename (.planning/architecture-one-director.html §04):
//
//   "That secrecy is not a pass-and-play feature at all — it is a game rule that already applies
//    in every mode... In a crew game, separate devices enforce that rule for free — a rival simply
//    cannot see your screen. In pass-and-play there is one screen, so the same rule needs a gate.
//    The rule is identical; only the enforcement differs, because the hardware differs."
//
// So nothing here knows a mode's name. It knows whether the captains SHARE A DEVICE, which is a
// fact about hardware — true of pass-and-play today, true of any future couch or hot-seat mode,
// and the rules below hold for all of them without being told which they are in.
//
// PURE, AND GATED: src/shared/ may import nothing from src/ (module_graph_check), so these cannot
// reach appState or the DOM. That is also what lets a headless gate RUN them rather than assert
// against a typed-out copy — the lesson from decider_table_check, which was bypassed in one line
// precisely because it could not execute its subject.

/* MAY THIS SEAT'S RECIPE BE SHOWN ON THIS SCREEN RIGHT NOW?
   One rule, every mode: your own recipe is yours to see, every other captain's is private. A
   spectator sees everything, because a spectator is not a rival.
   `sharedDevice` adds the one extra condition the hardware forces: with one screen between four
   captains, "your own" is not established by the device, so you must have asked this turn. */
export function mayRevealRecipe({ isMySeat, spectator, sharedDevice, askedThisTurn }) {
  if (spectator) return true;
  if (!isMySeat) return false;
  return sharedDevice ? !!askedThisTurn : true;
}

/* SHOULD THE "CHECK MY RECIPE" BUTTON BE OFFERED?
   Only where the rule above actually needs asking — i.e. on a shared device — and only to the
   captain whose turn it is, and only while they have not already asked. On separate devices the
   button would be asking permission the hardware has already granted. */
export function offersRecipeCheck({ isMySeat, isActiveSeat, sharedDevice, askedThisTurn }) {
  return !!sharedDevice && !!isMySeat && !!isActiveSeat && !askedThisTurn;
}

/* SHOULD THE "SOMEONE IS THINKING" INDICATOR BE SHOWN?
   The plan calls this a PERFORMER CAPABILITY (§04.2): "the capability is universal; only its offer
   is mode-gated". You are told a bot is thinking when you are watching someone else's turn play
   out and there is nobody else in the room to tell you. On a shared device the next captain is
   sitting beside you; on separate devices the wire carries their turn. Both make the indicator
   redundant rather than wrong — which is why this reads two hardware facts and no mode. */
export function showsThinkingIndicator({ sharedDevice, networked, watchingAnotherSeat, seatStillPlaying, voyageOver }) {
  if (voyageOver) return false;
  if (sharedDevice || networked) return false;
  return !!watchingAnotherSeat && !!seatStillPlaying;
}
