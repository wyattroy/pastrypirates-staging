// HOW MANY PIXELS WIDE IS THIS FILE, REALLY? Read from the file's own header, never from a name.
//
// Wyatt, INBOX-20260901T1335Z: "everything else should be resized and compressed according to its
// maximum pixel size in the real gameplay." Answering that needs two numbers per picture: the box
// the game draws it into, and the pixels the file actually carries. This is the second one.
//
// IT LIVES HERE, SHARED, FOR ONE MEASURED REASON. It began as a private helper inside
// `scripts/qa/asset_display_size_probe.mjs`, handling PNG and JPEG. Then ~200 files were renamed
// to `.webp` by the compression pass — and the probe's caller does `if (!nat) continue;`, so every
// WebP silently VANISHED from a report headed "the measured maximum each picture is drawn at".
// Not listed as unmeasured. Absent. A gate cannot check a function nobody can import, which is
// why it moved out here before the WebP branch was written.
//
// Returns `{ w, h }` in intrinsic pixels, or `null` for a format it cannot read. `null` means
// "this decoder does not know", never "the file has no size" — a caller that drops a null is
// dropping a picture, and that is the exact fault this file was extracted to make checkable.

/* PNG — IHDR is the first chunk and its width/height are the two big-endian u32 at 16 and 20. */
function png(b) {
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* JPEG — walk the marker segments to the first SOF (start of frame), skipping DHT/DAC/RSTn. */
function jpeg(b) {
  if (!(b[0] === 0xff && b[1] === 0xd8)) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/* WEBP — a RIFF container, so the size lives in whichever of three chunks came first.
 *
 * READ THE LENGTH FIELDS AND WALK; NEVER REGEX OVER BINARY. That is this repo's own lesson from
 * 2026-09-02, when the board's WebP had to be proved lossy chunk by chunk.
 *
 *   VP8X  extended (what an alpha or ICC-profile file gets — `assets/board.webp` is one). Payload:
 *         4 bytes flags, then canvas width-1 and height-1 as 24-bit little-endian. Authoritative
 *         when present, because it is the canvas the other chunks paint into.
 *   VP8   lossy. Payload: 3-byte frame tag, the 3-byte start code 9d 01 2a, then width and height
 *         as 16-bit little-endian with the top 2 bits being a scaling hint, hence the & 0x3fff.
 *   VP8L  lossless. Payload: signature 0x2f, then 14 bits of width-1 and 14 bits of height-1
 *         packed little-endian across the next 4 bytes.
 */
function webp(b) {
  if (b.slice(0, 4).toString('ascii') !== 'RIFF' || b.slice(8, 12).toString('ascii') !== 'WEBP')
    return null;
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = b.slice(i, i + 4).toString('ascii');
    const len = b.readUInt32LE(i + 4);
    const p = i + 8;                       // first byte of this chunk's payload
    if (fourcc === 'VP8X' && p + 10 <= b.length)
      return { w: (b.readUIntLE(p + 4, 3) & 0xffffff) + 1, h: (b.readUIntLE(p + 7, 3) & 0xffffff) + 1 };
    if (fourcc === 'VP8 ' && p + 10 <= b.length &&
        b[p + 3] === 0x9d && b[p + 4] === 0x01 && b[p + 5] === 0x2a)
      return { w: b.readUInt16LE(p + 6) & 0x3fff, h: b.readUInt16LE(p + 8) & 0x3fff };
    if (fourcc === 'VP8L' && p + 5 <= b.length && b[p] === 0x2f) {
      const bits = b.readUInt32LE(p + 1);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    i = p + len + (len & 1);               // RIFF chunks are padded to an even length
  }
  return null;
}

/* GIF — the logical screen descriptor, two 16-bit little-endian values right after the header. */
function gif(b) {
  if (b.slice(0, 3).toString('ascii') !== 'GIF') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

/** Intrinsic size from a file's own bytes. `null` = this decoder does not know. */
export function intrinsicSize(buf) {
  if (!buf || buf.length < 16) return null;
  return png(buf) || jpeg(buf) || webp(buf) || gif(buf);
}

/** The extensions this decoder claims to read. Used by the gate that keeps the claim honest. */
export const READABLE = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
