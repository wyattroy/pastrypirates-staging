// src/shared/recipe-steps.js
//
// THE SIMPLIFIED RECIPE — the five-step order the bake-off tests you on.
//
// WHY THIS LIVES IN THE SHARED TIER, NOT IN ui/recipe.js WITH THE REST OF THE RECIPE DATA.
// The ENGINE needs it: lighting the ovens builds the bench from this order, and the engine may
// never import from src/ui/ (D-03/D-04, the leaf-tier rule this file's header states). It is pure
// data — no DOM, no window, no random — which is exactly what the shared tier is for.
//
// KEYED THE SAME WAY RECIPE_LOOKUP IS: the recipe's own ingredient ids, sorted and joined. Using a
// different keyspace from ui/recipe.js's table would let the two drift apart silently, and the one
// thing that must never happen here is a card that disagrees with the answer.
//
// TWO PARALLEL ARRAYS PER ENTRY:
//   ings  — the authored order, a permutation of that recipe's own five ingredients
//   lines — the wording, in the same order
// The ORDINAL IS NEVER IN THE STRING. The UI prefixes 1..5 and draws the ingredient's own icon from
// `ings`, so the card reads "1 🥛 Cream the butter" without the number or the icon ever being typed
// into the copy. That is what makes it impossible for the card to show an icon that disagrees with
// the answer: both are read from the same array (Wyatt, 2026-08-06 — "the recipe description must
// use the actual icons in it so players at a glance know what icon must go where").
//
// HOW THE ORDER WAS DERIVED. Each entry follows its own real method in ui/recipe.js — Spiced Cocoa
// Shortbread really does cream the butter before the sugar, and the flour really does go in after.
// It could NOT be derived mechanically: Spiced Fudge Brownies' prose says "melt the butter" though
// it has no dairy among its five; Cinnamon Dutch Baby blends all five in a single step; cocoa
// appears as both "chocolate" and "cocoa powder", sometimes in one recipe. Where the real method
// adds several at once, the creaming convention decides — fat, then sugar, then eggs, then flour,
// then flavourings — which is a plausible baker's order even where the original just says "blend".
//
// LINE RULES, enforced by scripts/bakeoff_recipe_check.js: five entries, ≤34 characters (the 360px  [UNGATED-IN-4: bakeoff_recipe_check.js reads the root tree, not this one]
// one-line budget), begins with a capital, contains no digit, and `ings` is a permutation of the key.
export const RECIPE_STEPS={
  // Spiced Cocoa Shortbread
  "cocoa|dairy|spice|sugar|wheat":{ings:["dairy","sugar","wheat","cocoa","spice"],
    lines:["Cream the butter","Beat in the sugar","Work in the flour","Sift in the cocoa","Roll in cinnamon and bake"]},
  // Molten Chocolate Lava Cake
  "cocoa|dairy|eggs|sugar|wheat":{ings:["dairy","cocoa","sugar","eggs","wheat"],
    lines:["Melt the butter","Stir in the chocolate","Whisk in the sugar","Beat in the eggs","Fold in the flour and bake"]},
  // Mayan Cocoa Soufflé
  "cocoa|dairy|eggs|spice|wheat":{ings:["dairy","wheat","cocoa","spice","eggs"],
    lines:["Melt the butter","Whisk in the flour","Stir in the chocolate","Spice it with cinnamon","Fold in the eggs and bake"]},
  // Cinnamon-Sugar Churros
  "dairy|eggs|spice|sugar|wheat":{ings:["dairy","sugar","wheat","eggs","spice"],
    lines:["Boil the milk and butter","Stir in the sugar","Beat in the flour","Work in the eggs","Toss in cinnamon and fry"]},
  // Mexican Chocolate Torte
  "cocoa|dairy|eggs|spice|sugar":{ings:["dairy","cocoa","sugar","spice","eggs"],
    lines:["Melt the butter","Stir in the chocolate","Whisk in the sugar","Spice it with cinnamon","Beat in the eggs and bake"]},
  // Spiced Fudge Brownies
  "cocoa|eggs|spice|sugar|wheat":{ings:["cocoa","sugar","eggs","wheat","spice"],
    lines:["Melt the chocolate","Whisk in the sugar","Beat in the eggs","Fold in the flour","Dust with cinnamon and bake"]},
  // Caramel Slice
  "cocoa|dairy|sugar|vanilla|wheat":{ings:["wheat","sugar","dairy","vanilla","cocoa"],
    lines:["Make crust with the flour","Caramelize the sugar","Pour in melted butter","Splash in the vanilla","Top with chocolate and set"]},
  // Cinnamon Snaps
  "cocoa|dairy|spice|vanilla|wheat":{ings:["dairy","vanilla","wheat","spice","cocoa"],
    lines:["Cream the butter","Pour in the vanilla","Work in the flour","Spice it with cinnamon","Roll in cocoa and bake"]},
  // Snickerdoodle Bites
  "dairy|spice|sugar|vanilla|wheat":{ings:["dairy","sugar","vanilla","wheat","spice"],
    lines:["Cream the butter","Beat in the sugar","Add the vanilla","Work in the flour","Roll in cinnamon and bake"]},
  // Cinnamon-Chocolate Fudge
  "cocoa|dairy|spice|sugar|vanilla":{ings:["dairy","sugar","cocoa","vanilla","spice"],
    lines:["Warm the milk and butter","Stir in the sugar","Melt in the chocolate","Add the vanilla","Finish with cinnamon"]},
  // Crispy Cocoa Snaps
  "cocoa|spice|sugar|vanilla|wheat":{ings:["sugar","vanilla","wheat","cocoa","spice"],
    lines:["Scoop the sugar","Pour in the vanilla","Work in the flour","Sift in the cocoa","Spice with cinnamon and bake"]},
  // Dark Chocolate Cream Puffs
  "cocoa|dairy|eggs|vanilla|wheat":{ings:["dairy","wheat","eggs","vanilla","cocoa"],
    lines:["Boil the milk and butter","Beat in the flour","Work in the eggs","Scent it with vanilla","Fill with chocolate cream"]},
  // Pound Cake
  "dairy|eggs|sugar|vanilla|wheat":{ings:["dairy","sugar","eggs","vanilla","wheat"],
    lines:["Cream the butter","Beat in the sugar","Add the eggs one by one","Pour in the vanilla","Fold in the flour and bake"]},
  // French Pots de Crème
  "cocoa|dairy|eggs|sugar|vanilla":{ings:["dairy","eggs","sugar","cocoa","vanilla"],
    lines:["Warm the milk and cream","Whisk the egg yolks","Beat in the sugar","Melt in the chocolate","Finish with vanilla"]},
  // Chocolate Genoise Sponge Cake
  "cocoa|eggs|sugar|vanilla|wheat":{ings:["eggs","sugar","vanilla","wheat","cocoa"],
    lines:["Whisk the eggs","Beat in the sugar","Add the vanilla","Sift in the flour","Fold in cocoa and bake"]},
  // Cinnamon Dutch Baby  (real method blends all five at once — creaming convention decides)
  "dairy|eggs|spice|vanilla|wheat":{ings:["eggs","dairy","wheat","vanilla","spice"],
    lines:["Crack in the eggs","Pour in the milk","Blend in the flour","Add the vanilla","Dust with cinnamon and bake"]},
  // Mexican Chocolate Pots
  "cocoa|dairy|eggs|spice|vanilla":{ings:["dairy","spice","eggs","cocoa","vanilla"],
    lines:["Warm the milk and cream","Steep it with cinnamon","Whisk the egg yolks","Melt in the chocolate","Finish with vanilla"]},
  // Cocoa Cloud Soufflé
  "cocoa|eggs|spice|vanilla|wheat":{ings:["cocoa","wheat","vanilla","spice","eggs"],
    lines:["Melt the chocolate","Whisk in the flour","Add the vanilla","Spice it with cinnamon","Fold in the eggs and bake"]},
  // Vanilla Bean Crème Brûlée
  "dairy|eggs|spice|sugar|vanilla":{ings:["dairy","vanilla","spice","eggs","sugar"],
    lines:["Warm the cream and milk","Steep the vanilla bean","Add a curl of cinnamon","Whisk the egg yolks","Torch the sugar on top"]},
  // Cinnamon Sponge Cake
  "eggs|spice|sugar|vanilla|wheat":{ings:["eggs","sugar","vanilla","wheat","spice"],
    lines:["Whip the eggs high","Beat in the sugar","Add the vanilla","Sift in the flour","Fold in cinnamon and bake"]},
  // Chocolate Fudge Torte
  "cocoa|eggs|spice|sugar|vanilla":{ings:["cocoa","sugar","eggs","vanilla","spice"],
    lines:["Melt the chocolate","Whisk in the sugar","Beat in the egg yolks","Add the vanilla","Dust with cinnamon and bake"]},
};
// recipeSteps(recipe) — the authored order for a player's recipe, or null if none is registered.
// Callers must handle null: a live voyage may never crash on a data gap, so the engine falls back
// to the player's own recipe array, which is already a valid permutation.
export function recipeSteps(recipe){
  return RECIPE_STEPS[recipe.slice().sort().join("|")]||null;
}
