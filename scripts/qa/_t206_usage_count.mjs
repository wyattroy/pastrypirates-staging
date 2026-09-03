/* _t206_usage_count.mjs — scratch probe for T-206. Re-reads the LIVE usage counters the game
 * already collects (src/ui/usage.js), so the number put to Wyatt is measured today and not
 * quoted from another watch's report. Bounded: three fetches, no browser, no loop. */
const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
const now = Date.now();
const since = now - 14 * 864e5;

async function q(path) {
  const url = `${DB}/${path}.json?orderBy=%22%24key%22&startAt=%22${since}%22`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) || {};
}

const pid = (k) => k.split("-").slice(1).join("-");

const [visits, starts, fins] = await Promise.all([q("visits"), q("starts"), q("fins")]);
const vk = Object.keys(visits), sk = Object.keys(starts);

console.log(`window: 14 days ending ${new Date(now).toISOString()}`);
console.log(`visits (page boots): ${vk.length}   distinct browsers: ${new Set(vk.map(pid)).size}`);
console.log(`starts (new voyages): ${sk.length}   distinct browsers: ${new Set(sk.map(pid)).size}`);
console.log(`fins   (finished voyages): ${Object.keys(fins).length}`);

const modes = {};
for (const k of sk) { const m = starts[k]?.m || "?"; modes[m] = (modes[m] || 0) + 1; }
console.log(`starts by mode: ${JSON.stringify(modes)}`);

const days = {};
for (const k of vk) {
  const d = new Date(Number(k.split("-")[0])).toISOString().slice(0, 10);
  days[d] = (days[d] || 0) + 1;
}
console.log(`visits per day: ${JSON.stringify(days)}`);
