/* crew_room.mjs — ONE definition of "a crew room a probe made, how it is deleted, and which rooms
 * are a probe's to delete". Rule 23: two things that must agree are one thing, or they will drift.
 *
 * WHY THIS FILE EXISTS, 2026-09-17. Tidying up after ONE item's crew runs removed 186 rooms from
 * the live Firebase database and only FIVE of them belonged to that run. The other 181 were weeks
 * of probe litter, every one of them carrying throwaway captain names — test1/test2,
 * HostCap/GuestCap, QA Host/QA Guest — left standing by probes that create a room and never delete
 * it. That is the same family of leak as a probe that leaves a browser behind (stray_probes.mjs),
 * and it gets the same shape of answer: one definition, one deleter, and a sweep that PRINTS BOTH
 * LISTS before it touches anything.
 *
 * ⛔ THE DELETE GOES OVER REST, NOT THROUGH THE HOST'S PAGE. Every teardown in this repo used to
 * ask the host browser to run `db.ref('rooms/'+code).remove()` over CDP. Two things are wrong with
 * that and both were live:
 *   - it needs the browser to still be ALIVE at teardown time, so it cannot run from a `finally`
 *     that fires after the browsers are down, or after a crash took one of them;
 *   - in crew_bake_probe.mjs the call sat inside a SYNCHRONOUS eval — `(()=>{…remove();return 1})()`
 *     — so the promise was never awaited and Chrome was SIGKILLed a millisecond later with the
 *     delete still in flight. The room survived every single run.
 * A DELETE against the database's own REST endpoint needs no browser at all. It is awaited, it is
 * bounded, and it works from a `finally` on every way out of a probe except SIGKILL — which no
 * process can catch, and which is what the sweep exists to mop up.
 *
 * ⚠ THE DATABASE URL IS READ, NEVER RETYPED. src/net/index.js says it in its own comment: "retyping
 * an apiKey or a databaseURL here would be a silent multiplayer outage, not a compile error". A
 * second copy in a tool is the same hazard pointed at the wrong database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..", "..");

/** The live database, read out of the game's own config. Throws rather than guessing: a sweep that
 *  silently pointed at nothing would report "0 rooms" and read exactly like a clean database. */
export function databaseURL() {
  const src = fs.readFileSync(path.join(REPO, "src", "net", "index.js"), "utf8");
  const m = src.match(/databaseURL:\s*"([^"]+)"/);
  if (!m) throw new Error("no databaseURL in src/net/index.js — the sweep refuses to guess one");
  return m[1].replace(/\/+$/, "");
}

const roomPath = (code, leaf) => `${databaseURL()}/rooms/${encodeURIComponent(code)}${leaf ? "/" + leaf : ""}.json`;

async function ask(url, init, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/* ---------- what a probe made, and getting rid of it ---------- */

/** Rooms THIS process created. A probe notes its code the moment it has one; the teardown paths
 *  drop whatever is still noted. Never populated from the database — this set can only ever hold
 *  rooms we made ourselves, which is why dropping it wholesale is safe. */
const noted = new Set();
export const notedRooms = () => [...noted];
export function noteRoom(code) { if (code && /^[A-Z0-9]{3,8}$/i.test(String(code).trim())) noted.add(String(code).trim()); return code; }

/** Delete one room. AWAITED — see the header; a delete that is not awaited is a room left standing.
 *  Never throws: a teardown that throws inside a `finally` replaces the probe's real error. */
export async function dropRoom(code) {
  const c = String(code || "").trim();
  if (!c) return { code: c, ok: false, why: "no room code" };
  try {
    const r = await ask(roomPath(c), { method: "DELETE" });
    noted.delete(c);
    return { code: c, ok: r.ok, why: r.ok ? "deleted" : `HTTP ${r.status}` };
  } catch (e) {
    return { code: c, ok: false, why: String((e && e.message) || e).slice(0, 120) };
  }
}

/** Every room this process created and has not already dropped. Safe to call twice. */
export async function dropNotedRooms() {
  const out = [];
  for (const c of [...noted]) out.push(await dropRoom(c));
  return out;
}

/* ---------- reading the room list, for the sweep ---------- */

export async function listRoomCodes() {
  const r = await ask(`${databaseURL()}/rooms.json?shallow=true`);
  if (!r.ok) throw new Error(`could not list rooms: HTTP ${r.status}`);
  const j = await r.json();
  return j ? Object.keys(j) : [];
}

/** Just the two things a verdict needs. NOT the whole room: a played voyage carries its whole event
 *  stream and decision log, and 345 of those is megabytes of somebody's game nobody asked to read. */
export async function readRoomCard(code) {
  const [cr, se] = await Promise.all([ask(roomPath(code, "createdAt")), ask(roomPath(code, "seats"))]);
  const createdAt = cr.ok ? await cr.json() : null;
  const seatsRaw = se.ok ? await se.json() : null;
  const seats = seatsRaw ? (Array.isArray(seatsRaw) ? seatsRaw : Object.values(seatsRaw)) : [];
  const names = seats.filter(s => s && !s.bot && typeof s.name === "string" && s.name.trim())
                     .map(s => s.name.trim());
  return { code, createdAt: typeof createdAt === "number" ? createdAt : null, names, seatCount: seats.length };
}

/* ---------- whose room is it? ---------- */

/** The captain names a probe types. Every one of these is a name in a script in this repo; a name
 *  that is not on this list belongs to somebody, and nothing in this file will delete their room.
 *  This is an ALLOW-list on purpose — a deny-list of "names that look fake" would eventually meet a
 *  real player called Test and delete their voyage. */
export const THROWAWAY_NAMES = [
  /^test/i,          // test1, test2, test9 — the house convention (D-37: crew QA plays as test1/test2)
  /^hostcap$/i,      // scripts/qa/_crew_ask_name_check.mjs, w7b_crew_sail_measure.mjs
  /^guestcap$/i,
  /^qa[\s._-]/i,     // "QA Host", "QA Guest"
];
export const isThrowawayName = n => THROWAWAY_NAMES.some(re => re.test(String(n || "").trim()));

export const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;   // a day — younger than that may be a run in progress

/** PURE, and exported so it can be red-proofed. Deletable ONLY when every one of the three holds:
 *  the room names at least one captain, EVERY named captain is a probe's, and it is older than the
 *  floor. Anything unknown — no names at all, no createdAt — is KEPT and says why. */
export function roomVerdict(card, { now = Date.now(), minAgeMs = DEFAULT_MIN_AGE_MS } = {}) {
  const ageMs = typeof card.createdAt === "number" ? now - card.createdAt : null;
  if (!card.names.length) return { deletable: false, ageMs, why: "no captain names recorded — cannot prove it is a probe's room" };
  const theirs = card.names.filter(n => !isThrowawayName(n));
  if (theirs.length) return { deletable: false, ageMs, why: `a captain name that is not a probe's: ${theirs.join(", ")}` };
  if (ageMs === null) return { deletable: false, ageMs, why: "no createdAt — age unknown, so it may be a run in progress" };
  if (ageMs < minAgeMs) return { deletable: false, ageMs, why: `only ${humanAge(ageMs)} old — a run may still be in it` };
  return { deletable: true, ageMs, why: `every captain is a probe's (${card.names.join(", ")}), ${humanAge(ageMs)} old` };
}

export function humanAge(ms) {
  if (ms === null || ms === undefined || !isFinite(ms)) return "age unknown";
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
