// Throwaway probe: does the SHIPPED engine let you attack a captain whose ovens are lit?
// The rules page says "not even a captain who's already fired up the ovens". Measure it.
import { Game } from "../src/engine/index.js";
import { bakeoffEnabled } from "../src/shared/index.js";

const g = new Game({ seats: 4, seed: 12345 });
console.log("cfg.bakeoff =", g.cfg.bakeoff, "| bakeoffEnabled() =", bakeoffEnabled());

const att = g.players[0], def = g.players[1];
// give the attacker powder and the defender a hold worth taking
att.coins = 99;
def.ing = ["flour"];
def.baking = false;
console.log("defender NOT baking  -> canAttack =", g.canAttack(att, def));
def.baking = true;
console.log("defender IS baking   -> canAttack =", g.canAttack(att, def));
