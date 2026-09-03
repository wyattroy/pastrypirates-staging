/* SCRATCH — red-proof for the headline card. "playing right now" reads `presence/`, and when I
   built it the live node was `null`, i.e. 0. A card that CAN ONLY EVER SAY 0 is a lie on the most
   prominent number on his page, so this proves it moves:

     presence BEFORE  ->  open the real game in a browser  ->  presence DURING  ->  close  ->  AFTER

   The game writes presence via the Firebase SDK (netMarkPresence, orchestrator.js), which is NOT
   domain-guarded — so a localhost boot registers. Usage pings ARE domain-guarded (usage.js
   usageOn()), so this pollutes nothing in visits/starts/fins. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
const count = async () => {
  const r = await fetch(`${DB}/presence.json?shallow=true`);
  const j = await r.json();
  return j ? Object.keys(j).length : 0;
};

console.log("presence BEFORE:", await count());

const url = serve(8549);
launch(9449, "/tmp/chrome-presence-live");
const C = await attach(9449);
await C.ev(`location.href=${JSON.stringify(url)}`);

let during = 0;
for (let i = 0; i < 30; i++) {                        // bounded, rule 17
  await sleep(1000);
  during = await count();
  if (during > 0) break;
}
console.log("presence DURING (a real browser on the game):", during,
  during > 0 ? "-> the card can move" : "-> IT DID NOT MOVE; the card would be stuck at 0");

await killAll();
await sleep(4000);                                     // onDisconnect is not instant
console.log("presence AFTER the browser closed:", await count());
