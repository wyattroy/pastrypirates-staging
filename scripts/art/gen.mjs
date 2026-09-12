#!/usr/bin/env node
/* ART WITHOUT A BROWSER — one HTTP call, bytes straight to disk.
 *
 * WHY THIS EXISTS. Every art round until 2026-09-12 was driven through Chrome, and four separate
 * things went wrong that had nothing to do with art: Chrome silently refused the 2nd and 3rd
 * download of a batch; Gemini's own content policy blocked every way of reading the picture out of
 * the page; the workaround that did work parked the tab on a 200KB address, which the extension
 * cannot classify, so it then refused EVERY call that touches a tab — two and a half hours lost
 * once and forty minutes again the same day, ended both times by Wyatt closing the tab by hand; and
 * a round was lost to being signed in on the work Google account, which renders in different
 * colours. None of that can happen here. Wyatt, 2026-09-12: "come up with a better pipeline".
 *
 * THE KEY lives in ~/.pastrypirates-art-key — OUTSIDE the repo on purpose, so it survives every
 * worktree and cannot be committed by any hand, mine included. $GEMINI_API_KEY and a git-ignored
 * .art-key at the repo root also work. It is never printed, and it is stripped out of any error the
 * API hands back. Get one free at https://aistudio.google.com/apikey — the flash image models this
 * defaults to need no billing (about 500 pictures a day); only gemini-3-pro-image does.
 *
 *   node scripts/art/gen.mjs --prompt-file notes/plaque-prompt.txt --ratio 21:9 --out art-review/captains-box/plaque-r5-C.jpeg
 *   node scripts/art/gen.mjs --prompt "a weathered pirate plaque…" --ratio 3:2 --size 2K --n 3 --out art-review/crate.jpeg
 *
 * ⭐ --ratio IS THE CANVAS, NOT THE ART. Wyatt, 2026-09-12: "you don't need gemini to create the
 * image in a certain aspect ratio -- you can tell it to use a certain aspect ratio for its drawing,
 * within its own canvas, and then you'll key and crop it anyway according to the art-review
 * process." So the model's ten output shapes stop being a constraint: ask in the PROMPT for the art
 * drawn at the shape ye want, sitting on a flat near-black background with a margin all round, then
 * `scripts/art/key.mjs` crops to the art's own edges and the ratio is exactly what was drawn.
 * The model returns JPEG; the keyer reads JPEG and PNG both.
 *
 *   node scripts/art/gen.mjs --prompt-file p.txt --out art-review/x.jpeg && node scripts/art/key.mjs art-review/x.jpeg
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RATIOS = ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"];
const SIZES  = ["512px","1K","2K","4K"];

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--"+k); return i >= 0 ? argv[i+1] : d; };
const die = m => { console.error("gen: " + m); process.exit(1); };

const out    = arg("out")    || die("--out <file> is required");
const ratio  = arg("ratio",  "1:1");   // the canvas; the art's own shape is asked for in the prompt
const size   = arg("size",   "1K");   // 1K is ~1024 across — already 2x the widest box we draw
const model  = arg("model",  "gemini-3.1-flash-image");
const n      = Math.max(1, Math.min(8, +arg("n", "1") || 1));
const promptFile = arg("prompt-file");
const prompt = promptFile ? fs.readFileSync(promptFile, "utf8").trim() : (arg("prompt") || "");

if (!prompt) die("give --prompt \"…\" or --prompt-file <file>");
if (!RATIOS.includes(ratio)) die(`--ratio (the CANVAS) must be one of ${RATIOS.join(" ")} — the art's own shape is asked for in the prompt and settled by key.mjs`);
if (!SIZES.includes(size))   die(`--size must be one of ${SIZES.join(" ")}`);

const KEY_FILES = [path.join(os.homedir(), ".pastrypirates-art-key"), path.join(REPO, ".art-key")];
const key = (process.env.GEMINI_API_KEY || "").trim() ||
  (KEY_FILES.filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, "utf8").trim()).find(Boolean) || "");
if (!key) die("no key found. Put one in ~/.pastrypirates-art-key (outside the repo, so it can never be\n     committed), or .art-key at the repo root, or \$GEMINI_API_KEY.\n     Free from https://aistudio.google.com/apikey.");

/* the drawn size, read out of the file's own header, so a wrong shape is caught before it is judged */
function dims(buf) {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xFF && buf[1] === 0xD8) {                    // JPEG: walk to the first SOF marker
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i+1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
        return { h: buf.readUInt16BE(i+5), w: buf.readUInt16BE(i+7) };
      i += 2 + buf.readUInt16BE(i+2);
    }
  }
  return null;
}

/* ⚠ JPEG, NOT PNG — measured against the live API on 2026-09-12, which answers a request for
   'image/png' with a flat 400: "Supported values: 'image/jpeg'". --mime is here for the day a model
   offers more; it is not a wish. key.mjs reads JPEG as well as PNG, so this costs nothing. */
const mime = arg("mime", "image/jpeg");
if (/\.png$/i.test(out) && mime === "image/jpeg")
  console.error("gen: note — this model only returns JPEG, so " + out + " will hold JPEG bytes. Name it .jpeg.");
const body = {
  model,
  input: [{ type: "text", text: prompt }],
  response_format: { type: "image", mime_type: mime, aspect_ratio: ratio, image_size: size },
};

for (let k = 0; k < n; k++) {
  const file = n === 1 ? out : out.replace(/(\.[a-z]+)$/i, `-${k+1}$1`);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  let res;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { die("could not reach the API: " + (e && e.message)); }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    die(`HTTP ${res.status} — ${t.slice(0, 400).replace(key, "<key>")}`);   // never echo the key back
  }
  const j = await res.json();
  /* WHERE THE PICTURE ACTUALLY IS, read off a real reply on 2026-09-12 rather than from the docs,
     which say `output_image.data` and are wrong for this endpoint. An interaction comes back as a
     list of STEPS — a "thought" step carrying a half-megabyte signature, then a "model_output" step
     whose content holds the image. Walk the steps for the first image and take that. */
  const b64 = (j?.steps || [])
    .flatMap(s => s?.content || [])
    .filter(c => c && (c.type === "image" || /^image\//.test(c.mime_type || "")))
    .map(c => c.data).find(Boolean)
    || j?.output_image?.data;
  if (!b64) die("the reply carried no image (status " + (j?.status || "?") + "). Top-level keys: " + Object.keys(j || {}).join(", "));
  const buf = Buffer.from(b64, "base64");
  fs.writeFileSync(file, buf);
  const d = dims(buf);
  const t = j?.usage?.total_tokens;
  console.log(`${file}  ${(buf.length/1024).toFixed(0)} KB` +
    (d ? `  ${d.w}x${d.h}  ${(d.w/d.h).toFixed(3)}:1  (canvas ${ratio})` : "") +
    (t ? `  ${t} tokens` : ""));
}
