// Throwaway probe for `admin-console-where`: does the live database actually hold the three
// usage records `classic/stats.html` reads, and how many? Answers falsifier F2 in
// .planning/wyclau/PREDICTION-20260903T0905Z-admin-console-where.md.
const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
const DAYS = Number(process.argv[2] || 14);
const since = String(Date.now() - DAYS * 86400e3);

for (const node of ["visits", "starts", "fins", "gamelogs"]) {
  const url = `${DB}/${node}.json?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"' + since + '"')}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.error) { console.log(`${node}: HTTP ${r.status} ERROR ${j.error}`); continue; }
    const keys = Object.keys(j || {});
    const pids = new Set(keys.map(k => k.slice(k.indexOf("-") + 1)));
    console.log(`${node}: HTTP ${r.status} · ${keys.length} rows in last ${DAYS}d · ${pids.size} distinct key-suffixes`);
    if (keys.length) console.log(`   first=${keys[0]}  last=${keys[keys.length - 1]}`);
  } catch (e) {
    console.log(`${node}: THREW ${e.message}`);
  }
}
