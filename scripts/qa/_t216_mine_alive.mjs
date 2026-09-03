/* SCRATCH (T-216) — rule 17, asked about MY probe specifically.
 * stray_probe_check SKIPS while another session's sea trial is at sea, which is correct for the
 * build and useless to me: it cannot tell me whether the browser I launched is gone. So ask about
 * the one thing that is mine — debug port 9471 and the profile dir this watch named. */
import { execSync } from "node:child_process";
const out = execSync('wmic process where "name=\'chrome.exe\'" get processid,commandline /format:list',
  { encoding: "utf8", maxBuffer: 1e8 });
const mine = out.split(/\r?\n/).filter(l => /9471|t216fcshots/.test(l));
console.log("chrome processes carrying MY port (9471) or MY profile (t216fcshots):", mine.length);
mine.slice(0, 3).forEach(l => console.log("  " + l.slice(0, 150)));
const all = out.split(/\r?\n/).filter(l => /remote-debugging-port/.test(l));
console.log("debug-port chrome processes on this machine in total:", all.length, "(the rest belong to the live trial)");
