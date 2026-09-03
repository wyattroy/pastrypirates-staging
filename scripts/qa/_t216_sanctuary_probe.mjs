// Throwaway probe: does the SHIPPED engine let you attack a captain whose ovens are lit?
// The rules page says "not even a captain who's already fired up the ovens". Measure it.
// Deliberately does NOT override `bakeoff` — roundCfg() supplies the shipped default.
import { Game, roundCfg } from "../../src/engine/index.js";

const g = new Game(roundCfg(["pirate", "trader", "balanced", "rusher"]), 12345, true);
console.log("cfg.bakeoff (shipped default) =", g.cfg.bakeoff);

const att = g.players[0], def = g.players[1];
att.coins = 99;                 // powder is affordable
def.ing = [...def.recipe];      // a full hold — worth taking
def.baking = false;
console.log("defender NOT baking  -> canAttack =", g.canAttack(att, def));
def.baking = true;
console.log("defender IS baking   -> canAttack =", g.canAttack(att, def));
