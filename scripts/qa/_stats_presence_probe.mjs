// Throwaway probe for `admin-console-where`: is `presence/` (written by netMarkPresence,
// removed onDisconnect) publicly readable, and does it answer "how many are playing RIGHT NOW"?
const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
for (const q of ["presence.json?shallow=true", "rooms.json?shallow=true"]) {
  const r = await fetch(`${DB}/${q}`);
  const t = await r.text();
  console.log(`${q}: HTTP ${r.status} · ${t.length} bytes · ${t.slice(0, 200)}`);
}
