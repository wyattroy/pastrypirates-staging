#!/usr/bin/env node
/* KEY THE BACKGROUND OUT AND CROP TO THE ART — no browser, no canvas, no dependencies.
 *
 * ⭐ WYATT'S POINT, 2026-09-12, and it removes a whole constraint: *"you don't need gemini to create
 * the image in a certain aspect ratio -- you can tell it to use a certain aspect ratio for its
 * drawing, within its own canvas, and then you'll key and crop it anyway according to the
 * art-review process."*
 *
 * So the model's ten fixed output shapes stop mattering. Ask it for the plaque DRAWN two and a half
 * times wider than tall, sitting on a flat key colour with a margin all round, in whatever canvas
 * the model likes — then this crops to the art's own edges and the ratio is exactly what was drawn.
 * It also retires the hairline of pale pixels the model leaves outside the rope: keying takes it.
 *
 * The key colour is read from the picture's own corners (near-black is this project's house colour
 * for it), so nothing has to be told what it is. --key <#rrggbb> overrides.
 *
 *   node scripts/art/key.mjs in.png                       -> in-keyed.png, and prints the ratio
 *   node scripts/art/key.mjs in.png --out plaque.png --tol 40 --flat
 *
 * --flat keeps the background opaque-cropped instead of transparent (for art that sits on wood).
 * --anywhere keys EVERY pixel near the key colour. The default keys only the background you can
 *   reach from the edge of the canvas, because a plank seam painted near-black is not background —
 *   see the note beside the flood fill for the picture that taught this.
 * PNG in, PNG out, and PNG is decoded in pure node. A JPEG — which is all the image models return —
 * is turned into one first by a headless Chrome that this script launches and kills itself, because
 * node has no JPEG decoder and a hand-rolled one is three hundred lines of Huffman and IDCT. That is
 * a LOCAL DECODER, not the old browser pipeline: no extension, no downloads folder, no content
 * policy, no tab to jam. Everything else stays pure node.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
const src = argv.find(a => !a.startsWith("--")) || die("give an input .png");
const arg = (k, d) => { const i = argv.indexOf("--"+k); return i >= 0 ? argv[i+1] : d; };
const has = k => argv.includes("--"+k);
function die(m){ console.error("key: "+m); process.exit(1); }

const tol  = +arg("tol", "38");
const anywhere = has("anywhere");   // key every matching pixel, not only the background reachable from an edge
const out  = arg("out", src.replace(/\.(png|jpe?g)$/i, "") + "-keyed.png");
const flat = has("flat");

/* ── decode: IHDR + inflate(IDAT) + un-filter. 8-bit RGB or RGBA, no interlace — what a model returns. */
function decodePNG(buf){
  if (buf.length < 8 || buf.toString("ascii",1,4) !== "PNG") die("not a PNG (ask gen.mjs for a .png)");
  let i = 8, w=0, h=0, depth=0, type=0, inter=0; const idat=[];
  while (i < buf.length){
    const len = buf.readUInt32BE(i), tag = buf.toString("ascii", i+4, i+8), data = buf.subarray(i+8, i+8+len);
    if (tag === "IHDR"){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); depth=data[8]; type=data[9]; inter=data[12]; }
    else if (tag === "IDAT") idat.push(data);
    else if (tag === "IEND") break;
    i += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || (type !== 2 && type !== 6)) die(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${inter})`);
  const ch = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w*h*4, 255);
  const stride = w*ch; let p = 0;
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  for (let y=0; y<h; y++){
    const f = raw[p++]; raw.copy(line, 0, p, p+stride); p += stride;
    for (let x=0; x<stride; x++){
      const a = x >= ch ? line[x-ch] : 0, b = prev[x], c = x >= ch ? prev[x-ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){ const q = a + b - c, pa = Math.abs(q-a), pb = Math.abs(q-b), pc = Math.abs(q-c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[x] = v & 255;
    }
    for (let x=0; x<w; x++){
      px[(y*w+x)*4+0] = line[x*ch+0]; px[(y*w+x)*4+1] = line[x*ch+1];
      px[(y*w+x)*4+2] = line[x*ch+2]; px[(y*w+x)*4+3] = ch === 4 ? line[x*ch+3] : 255;
    }
    line.copy(prev);
  }
  return { w, h, px };
}

function encodePNG(w, h, px){
  const stride = w*4, raw = Buffer.alloc((stride+1)*h);
  for (let y=0; y<h; y++){ raw[y*(stride+1)] = 0; px.copy(raw, y*(stride+1)+1, y*stride, (y+1)*stride); }
  const chunk = (tag, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0); b.write(tag, 4, "ascii"); data.copy(b, 8);
    b.writeInt32BE(crc(Buffer.concat([Buffer.from(tag,"ascii"), data]))|0, 8+data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, {level:9})), chunk("IEND", Buffer.alloc(0))]);
}
const CRCT = (()=>{ const t=new Int32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c; } return t; })();
function crc(b){ let c = -1; for (let i=0;i<b.length;i++) c = CRCT[(c ^ b[i]) & 255] ^ (c>>>8); return c ^ -1; }

/* node cannot read a JPEG, so borrow a decoder: draw it once in a headless Chrome and take the PNG.
   ⚠ THE PNG COMES BACK AS A FILE, NOT AS A STRING. Handing a 2752x1536 canvas back through the
   debugging channel as base64 is fourteen megabytes of text and it simply never returned — measured
   2026-09-12, killed after nine minutes. So the page saves it instead: Chrome is told where its
   downloads go, the page clicks its own blob, and node reads the file off disk. */
async function toPNG(file){
  const buf = fs.readFileSync(file);
  if (buf.length > 8 && buf.toString("ascii",1,4) === "PNG") return buf;
  if (!(buf[0] === 0xFF && buf[1] === 0xD8)) die("not a PNG or a JPEG");
  /* file:// URL, not a bare path: on Windows "C:\\..." is not a valid module specifier, and
     scripts/qa/esm_import_url_check.mjs exists to catch exactly this before the Blade does */
  const rig = await import(pathToFileURL(path.join(REPO, "scripts", "mp_rig.mjs")).href);
  const PORT = 8940 + (process.pid % 25), DBG = 9640 + (process.pid % 25);
  const dir = path.join(REPO, ".tmp-key-" + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  const url = rig.serve(PORT);
  rig.launch(DBG, path.join(dir, "profile"));
  const C = await rig.attach(DBG);
  try {
    await C.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
    await C.ev("location.href=" + JSON.stringify(url)).catch(()=>{});
    await rig.sleep(1200);
    await C.ev("window.__j=" + JSON.stringify("data:image/jpeg;base64," + buf.toString("base64")) + ";1");
    const ok = await C.ev("(async()=>{ const im=new Image(); im.src=window.__j; await im.decode();"
      + " const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;"
      + " c.getContext('2d').drawImage(im,0,0);"
      + " const b=await new Promise(r=>c.toBlob(r,'image/png'));"
      + " const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='decoded.png';"
      + " document.body.appendChild(a); a.click();"
      + " return im.naturalWidth+'x'+im.naturalHeight; })()");
    if (!ok) die("the decoder returned nothing");
    const out = path.join(dir, "decoded.png");
    for (let t = 0; t < 240; t++) {                       // it arrives as a file, so wait for the file
      if (fs.existsSync(out) && fs.statSync(out).size > 1000 && !fs.existsSync(out + ".crdownload")) {
        await rig.sleep(250);
        return fs.readFileSync(out);
      }
      await rig.sleep(250);
    }
    die("the decoder never wrote " + out);
  } finally { await rig.killAll(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

/* ── the work ── */
const { w, h, px } = decodePNG(await toPNG(src));
const at = (x,y) => (y*w+x)*4;
let kr, kg, kb;
const over = arg("key");
if (over){ const m = /^#?([0-9a-f]{6})$/i.exec(over) || die("--key wants #rrggbb");
  const v = parseInt(m[1],16); kr = v>>16 & 255; kg = v>>8 & 255; kb = v & 255; }
else {                                                    // the four corners agree on the background
  const c = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([x,y]) => [px[at(x,y)], px[at(x,y)+1], px[at(x,y)+2]]);
  kr = Math.round(c.reduce((s,v)=>s+v[0],0)/4); kg = Math.round(c.reduce((s,v)=>s+v[1],0)/4); kb = Math.round(c.reduce((s,v)=>s+v[2],0)/4);
}
const isKey = i => Math.abs(px[i]-kr) + Math.abs(px[i+1]-kg) + Math.abs(px[i+2]-kb) <= tol*3;

/* ⭐ ONLY THE BACKGROUND THAT TOUCHES AN EDGE — the default, and it is the fix for a real picture
   that a plain colour key destroyed. A pirate plaque's PLANK SEAMS are painted very nearly black,
   which is also this project's house key colour, so "every pixel near black is background" punched
   the seams straight out of the wood: keyed over magenta, the sign read as four floating boards
   with daylight between them (2026-09-12, plaque r5). Background is not a COLOUR, it is the region
   you can reach from the edge of the canvas without crossing the art — a flood fill says so, and a
   seam in the middle of a plank can never be reached.
   --anywhere puts the old behaviour back for art that really is a subject on a flat field with no
   dark interior, which is most icons. */
let x0=w, y0=h, x1=-1, y1=-1, kept=0;
const bg = new Uint8Array(w*h);
if (anywhere){
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) if (isKey(at(x,y))) bg[y*w+x] = 1;
} else {
  /* an explicit stack, not recursion: a 1376x768 picture is a million pixels and a recursive fill
     runs out of stack long before it runs out of background */
  const stack = [];
  const push = (x,y) => { if (x<0||y<0||x>=w||y>=h) return; const k=y*w+x;
    if (bg[k] || !isKey(at(x,y))) return; bg[k]=1; stack.push(k); };
  for (let x=0; x<w; x++){ push(x,0); push(x,h-1); }
  for (let y=0; y<h; y++){ push(0,y); push(w-1,y); }
  while (stack.length){ const k = stack.pop(), x = k%w, y = (k-x)/w;
    push(x-1,y); push(x+1,y); push(x,y-1); push(x,y+1); }
}
for (let y=0; y<h; y++) for (let x=0; x<w; x++){
  const i = at(x,y);
  if (bg[y*w+x]) { if (!flat) px[i+3] = 0; }
  else { kept++; if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y; }
}
if (x1 < 0) die(`everything matched the key colour #${[kr,kg,kb].map(v=>v.toString(16).padStart(2,"0")).join("")} — raise --tol or pass --key`);
const cw = x1-x0+1, chh = y1-y0+1;
const cut = Buffer.alloc(cw*chh*4);
for (let y=0; y<chh; y++) px.copy(cut, y*cw*4, at(x0, y0+y), at(x0, y0+y) + cw*4);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, encodePNG(cw, chh, cut));
console.log(`${out}  ${w}x${h} -> ${cw}x${chh}  ${(cw/chh).toFixed(3)}:1  ` +
  `(key #${[kr,kg,kb].map(v=>v.toString(16).padStart(2,"0")).join("")}, tol ${tol}, ${(100*kept/(w*h)).toFixed(0)}% kept)`);
