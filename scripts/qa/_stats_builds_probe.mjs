// Why does one day's "builds" cell read `[object Object]`? The screenshot showed it; this asks
// the data what is actually stored at visits/<key>.
const DB = "https://pastry-pirates-default-rtdb.firebaseio.com";
const since = String(Date.now() - 14 * 86400e3);
const r = await fetch(`${DB}/visits.json?orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent('"' + since + '"')}`);
const j = await r.json();
const kinds = new Map();
for (const k in j) {
  const v = j[k];
  const kind = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  const key = kind === "string" ? `string:${v}` : kind;
  if (!kinds.has(key)) kinds.set(key, { n: 0, sample: v, sampleKey: k });
  kinds.get(key).n++;
}
for (const [kind, info] of kinds)
  console.log(`${kind}  x${info.n}  key=${info.sampleKey}  value=${JSON.stringify(info.sample).slice(0, 200)}`);
