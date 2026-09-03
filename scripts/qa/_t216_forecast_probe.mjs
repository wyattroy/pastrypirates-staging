/* scratch probe — does the compass's ghost needle really show a storm's direction?
   Deleted before the item closes. Run: node scripts/qa/_t216_forecast_probe.mjs */
import { Game, roundCfg } from "../../src/engine/index.js";

const g = new Game(roundCfg(["human", "bot", "bot", "bot"]), 12345, true);

// force each case rather than sail until one turns up
g.windNext = "N";
g.stormNext = false;
const calm = g.forecastWind();
g.stormNext = true;
const stormy = g.forecastWind();

console.log("forecast with a CALM day ahead :", JSON.stringify(calm));
console.log("forecast with a STORM day ahead:", JSON.stringify(stormy));
console.log("");
console.log("the page says the ghost needle shows next day's wind 'storms and all'.");
console.log("engine hides the direction when a storm is next:", stormy === null);

// and the instrument reaches its subject: if the calm case were ALSO null the probe
// would prove nothing about storms.
console.log("probe is live (calm case returns a direction):", calm !== null);
