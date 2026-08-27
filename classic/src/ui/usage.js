// src/ui/usage.js — anonymous usage pings (Wyatt, 2026-08-10: "Do 1 and 2, and also track
// unfinished games; and if you can track by ip or a better unique identifier than just their
// names, best. " — the identifier below is the better one; see THE IDENTIFIER).
//
// THREE RECORDS, ONE SHAPE, read back by /stats.html. Every write is a plain REST PUT to the
// Realtime Database — no SDK, so this works identically in every build including /v2, which
// ships without Firebase script tags. Fire-and-forget with every failure swallowed: usage
// tracking must never cost a player a frame, a boot, or an error dialog, and a network policy
// that blocks it silently costs nothing.
//
//   visits/<ts>-<pid>  = build          one per page boot
//   starts/<ts>-<pid>  = {b,h,m}        one per NEW voyage (solo / pass&play / net-host only;
//                                       resumes and replays never write) — the key IS the gid
//   fins/<gid>         = {t,b}          one per completed voyage, joined to its start by gid.
//                                       A voyage finished after a mid-game refresh lost its gid
//                                       and fins under a fresh ts-pid key: it still counts as a
//                                       finish, but its start shows "no finish recorded" — so
//                                       the unfinished count is a slight OVERcount, never under.
//
// Keys are <milliseconds>-<pid> so orderBy="$key" range reads need no indexOn rule.
//
// THE IDENTIFIER is pp_id (getMyId) — the per-browser id the game has always minted, shared by
// every build on this domain, so one person is one id across /, /v2, /v2bakeoff and /3. It is
// deliberately NOT an IP: a page cannot see its own IP without a third-party echo service, and
// an id per browser profile is a better "person" proxy than an address that lumps a household
// together and changes when a phone hops networks. No name, no PII. Private/incognito tabs mint
// a fresh id per tab, so heavy private-tab testing inflates uniques — known, accepted.
//
// GUARDED TO THE REAL DOMAINS: localhost, LAN and file:// runs (probes, dev servers, previews)
// write nothing, so the counts mean players, not plumbing. ?usage=1 forces pings on to test the
// wiring; ?usage=0 forces them off.
import { getMyId } from "./util.js";

const USAGE_DB="https://pastry-pirates-default-rtdb.firebaseio.com";
const USAGE_BUILD="main";

let lastGid=null;

function usageOn(){
  try{
    if(location.search.indexOf("usage=1")!==-1)return true;
    if(location.search.indexOf("usage=0")!==-1)return false;
    const h=location.hostname;
    // NOT wyattroy.github.io: the custom domain means nothing real is served there except the
    // PREVIEW repo (scripts/deploy-preview.sh), whose traffic must never count as players.
    return h==="playpastrypirates.com"||h==="www.playpastrypirates.com";
  }catch(e){return false;}
}
function put(path,value,keep){
  try{
    if(!usageOn()||typeof fetch!=="function")return;
    fetch(USAGE_DB+"/"+path+".json",{method:"PUT",body:JSON.stringify(value),keepalive:!!keep}).catch(function(){});
  }catch(e){}
}
export function pingVisit(){
  try{put("visits/"+Date.now()+"-"+getMyId(),USAGE_BUILD);}catch(e){}
}
// h = human seats at the table, m = "solo" | "pass" | "net".
export function pingStart(h,m){
  try{
    lastGid=Date.now()+"-"+getMyId();
    put("starts/"+lastGid,{b:USAGE_BUILD,h:h,m:m});
  }catch(e){}
}
export function pingFin(){
  try{
    put("fins/"+(lastGid||Date.now()+"-"+getMyId()),{t:Date.now(),b:USAGE_BUILD},true);
    lastGid=null;
  }catch(e){}
}
export function usageGid(){return lastGid;}
