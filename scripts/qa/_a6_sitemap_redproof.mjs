/* THROWAWAY red-proof for watch a6 — deleted immediately after it runs.
   Proves sitemap_lastmod_check can FAIL before its PASS is believed (rule: check the instrument
   reaches its subject). Pure, in-memory: it never touches the real sitemap.xml, which is a
   site-identity file (rule 14). */
import { checkSitemap } from "./sitemap_lastmod_check.mjs";

const o = "https://playpastrypirates.com";
const good = "<urlset><url><loc>https://playpastrypirates.com/</loc><lastmod>2026-09-01</lastmod></url></urlset>";
const typed = good.replace("2026-09-01", "2026-08-14");
const dead = "<urlset><url><loc>https://playpastrypirates.com/</loc><lastmod>2026-09-01</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>";
const nolm = "<urlset><url><loc>https://playpastrypirates.com/</loc></url></urlset>";

for (const [name, xml] of [["GOOD (must PASS)", good], ["HAND-TYPED DATE (must FAIL)", typed], ["DEAD TAGS BACK (must FAIL)", dead], ["NO LASTMOD (must FAIL)", nolm]]) {
  const r = checkSitemap(xml, o);
  console.log(`${name}: ${r.problems.length ? "FAIL -> " + r.problems.join(" | ") : `PASS (${r.checked.length} ok)`}`);
}
