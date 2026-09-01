/* W9 — "the guest is starved of the storm sweep, it is not busy."
   ─────────────────────────────────────────────────────────────────────────────────────────────
   WHAT IT MEASURES, AND WHY THE NUMBER IS TRUSTWORTHY
   Poses a swept storm push in a live crew room and measures, ON THE HOST TAB ONLY, the gap
   between the moment the `tradewind` event is APPENDED to game.events and the moment it is
   PUBLISHED (appState.evPushed passes its index). Both readings come from the same tab, so there
   is NO NETWORK IN THE NUMBER — this cannot be explained away as a slow guest or a slow link.
   It also measures the SAME quantity for every other event of the same storm as a built-in
   control, so the instrument is visibly able to print a small number as well as a large one. A
   check that cannot print PASS is not a check (CLAUDE.md rule 6: red-proof the instrument).

   THE DEFECT IT GUARDS (measured 2026-08-30, real two-browser crew room):
   the host emitted the sweep at t=2326ms, rode it inline for 1447ms, and it did not reach the wire
   until t=3989ms. The guest received it 47ms later and started its ride 64ms after that. The
   network was 47ms. Every other player's board was frozen for the length of the HOST'S OWN
   animation, and the freeze grew with it. Cause: the awaited ride ran before `liveRender()`, and
   liveRender (src/ui/panel.js -> netHandlers().onEvents -> src/orchestrator.js pushEvents) is the
   ONLY publisher in the tree. There is no timer that pushes. Fixed by publishing first
   (`publishNow()` in src/ui/flow.js) and leaving the ride exactly where it was.

   NOT the same thing as a guest being a moment behind — that is expected and deliberate
   (docs/INTENDED-BEHAVIOUR.md §3). This measures an ARTIFICIAL hold, on the host, before the wire.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   NOT IN `npm test`. Deliberate: whether browser-driven gates join the suite is Q-22, parked for
   Wyatt. Run it by hand against a live crew room.

   TWO LEGS, AND THEY ARE NOT THE SAME KIND OF EVIDENCE.
     --leg=shape   SOURCE SHAPE ONLY — NOT A MEASUREMENT. Reads src/ui/flow.js and
                   src/orchestrator.js and fails if any awaited ride (animateSailRoute /
                   animateRimSweepIfAny) sits between an emit and its publish without a
                   publishNow() in front of it. It exists because the six ordinary-sail sites were
                   MISSED BY A GREP: the ride and the publish are on ONE PHYSICAL LINE
                   (`await animateSailRoute(evSail);liveRender();`), so a search that reads the
                   FOLLOWING line could never match. Runs with no browser. It cannot tell you what
                   any of it COSTS — only leg `sail`/`storm` can.
     --leg=storm   MEASURED. The posed swept storm (below). The original W9 subject.
     --leg=sail    MEASURED. The ORDINARY SAIL — every captain, every turn. Poses a bot with a
                   clear route, runs the real botTurn() path, and measures the publish lag of the
                   `sail` event it emits. The two HUMAN sail sites (humanAct, humanTurn) are the
                   same text as the bot's and are NOT reached by this leg — they sit behind a
                   prompt. `--leg=shape` is what covers them.
     --leg=all     shape, then storm, then sail. Worst verdict wins.

   ⚠ RESTART THE BROWSER AFTER EDITING src/ — A RELOAD IS NOT ENOUGH.
   A green result here has already almost lied once: the browser served src/ui/flow.js out of its
   OWN HTTP cache while the server served the new file, so the number described the OLD build and
   read as a pass. Before believing ANY number from this check, make the page prove it has your
   change — e.g.
       (await import('/src/ui/flow.js')).publishNow   // must be a function, not undefined
   and better, check the source text itself. This trap is written up in docs/HARD-WON-LESSONS.md:664
   and docs/DRIVING-THE-GAME.md:24 and it STILL caught someone, so it is repeated here, which is
   where the next person will actually be standing.

   USAGE
     1. serve the tree            python3 -m http.server 8548 --bind 127.0.0.1
     2. two chromes with          --remote-debugging-port=9631   (host)
                                  --remote-debugging-port=9632   (guest)
        ...restarted since your last edit to src/. See the warning above.
     3. get them into a room      see docs/DRIVING-THE-GAME.md §5c, or scripts/mp_rig.mjs
     4. node scripts/qa/w9_publish_lag_check.mjs [hostDebugPort] [gamePortSubstring] [--leg=all]

   EXIT CODES — 0 GREEN, 1 RED, 2 NOT RUN.
   **NOT RUN IS NEVER A PASS.** A leg that could not start is not a leg that passed, and this
   check prints the reason it could not start rather than a verdict it has not earned. Use a FRESH
   room (few events) and, if the swept ship falls late in stormOrder, raise WINDOW_MS. */
import fs from 'node:fs';

const ARGS      = process.argv.slice(2);
const FLAGS     = ARGS.filter(a => a.startsWith('--'));
const POS       = ARGS.filter(a => !a.startsWith('--'));
const PORT      = +(POS[0] || 9631);
const SITE      = POS[1] || '127.0.0.1:8548';
const LEG       = (FLAGS.find(a => a.startsWith('--leg=')) || '--leg=storm').split('=')[1];
const BUDGET_MS = 250;      // two frames of slack; publication is a synchronous call, not a wait
const WINDOW_MS = +(process.env.W9_WINDOW_MS || 60000);  // how long we will watch for the event
const OUT       = process.env.W9_OUT || null;            // optional raw-sample dump

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* NOT RUN THROWS rather than exiting, so that --leg=all can report "storm NOT RUN, sail RED"
   instead of the first stumble hiding every leg behind it. The dispatcher at the bottom still
   makes NOT RUN cost exit 2, and it can never be rounded up into a pass. */
const NOTRUN = (why) => { throw Object.assign(new Error(why), { notrun: true }); };

/* ─── LEG "shape" — SOURCE ONLY. THIS IS NOT A MEASUREMENT, and it says so when it runs. ───
   Finds every liveRender() and walks BACK to the nearest emit, flagging any awaited ride in
   between that has no publishNow() in front of it. It reads the LINE, not the line above: the six
   sites this was written for all read "await animateSailRoute(evSail);liveRender();" — ride and
   publish on ONE PHYSICAL LINE — which is exactly why an earlier grep put the count at two. */
/* THE GATED SUBJECT is the RIDES W9 is about — the sail glide and the rim sweep, the animations
   that run on every captain's every turn. */
const RIDE  = /await\s+(animateSailRoute|animateRimSweepIfAny|animateRimSweepRun)\s*\(/;
/* AND A WATCH LIST, WHICH IS NOT THE SAME THING AS A PASS. `benchReveal` (the bake bench reveal,
   src/orchestrator.js) reads as the identical shape — an emit, an awaited reveal, then the publish
   — but it has NEVER BEEN MEASURED, and this project does not report a defect it has not measured
   (CLAUDE.md rule 6). So it is PRINTED, loudly, on every single run, and it does NOT decide the
   verdict. If you are reading this because you want it to stop printing: measure it first, then
   fix it, then delete this list. Do not add to the list to make a red gate green. */
const WATCH_NAMES = ['benchReveal'];
const WATCH = new RegExp('await\\s+(' + WATCH_NAMES.join('|') + ')\\s*\\(');
const EMIT  = /\.(ev|tradewind|bakeResolve|rimEscape|bakeAttempt|bakeRewatch)\s*\(/;
const PUB   = /liveRender\s*\(\s*\)/;
const SOURCES = ['src/ui/flow.js', 'src/orchestrator.js'];
function legShape(){
  console.log('LEG shape — SOURCE SHAPE ONLY, NOT A MEASUREMENT. It cannot tell you what anything costs.');
  const bad = [], watch = [], seen = new Set();
  for(const file of SOURCES){
    const src = fs.readFileSync(file, 'utf8').split('\n');
    src.forEach((ln, i) => {
      if(!PUB.test(ln)) return;
      const left = ln.slice(0, ln.search(PUB));
      const rides = [];
      let emitAt = null, published = false;
      const scan = (s, n) => {
        if(/publishNow\s*\(\s*\)/.test(s)) published = true;
        if(RIDE.test(s) && !published) rides.push(n + ':' + s.match(RIDE)[1]);
        if(WATCH.test(s) && !published) rides.push(n + ':' + s.match(WATCH)[1]);
        if(EMIT.test(s)) { emitAt = n; return true; }
        return false;
      };
      // the same line first, left of the publish — this is the case a line-above grep cannot see
      if(!scan(left, 'L' + (i + 1))){
        for(let k = i - 1; k >= Math.max(0, i - 14); k--){
          if(scan(src[k].replace(/\/\/.*$/, ''), 'L' + (k + 1))) break;
        }
      }
      /* ONE HELD EMIT IS ONE DEFECT. A later liveRender() whose nearest prior emit is the same
         one is the SAME site seen twice, and counting it twice inflates the number the next
         person will quote. Keyed on the emit, so the first publish after it is the one reported. */
      const key = file + '@' + emitAt;
      if(emitAt !== null && rides.length && !published && !seen.has(key)){
        seen.add(key);
        /* routed on the ANIMATOR NAMES, not on the formatted label — an earlier version tested
           the printed string against the WATCH regex, which carries `await ` and so could never
           match, and the watch list silently stayed empty while its site failed the gate. */
        const names = rides.map(r => r.split(':')[1]);
        (names.every(n => WATCH_NAMES.includes(n)) ? watch : bad)
          .push(file + ':' + (i + 1) + '  emit@' + emitAt + '  rides before the publish with no publishNow(): ' + rides.join(', '));
      }
    });
  }
  if(watch.length){
    console.log('OPEN, UNMEASURED, DELIBERATELY NOT FIXED — ' + watch.length + ' site(s) of the same shape:');
    for(const w of watch) console.log('   ' + w);
    console.log('      These do NOT decide the verdict below, and they are NOT passing. Nobody has');
    console.log('      measured what they cost yet. Measure before fixing (CLAUDE.md rule 6).');
  }
  if(bad.length){
    console.log('RED — ' + bad.length + ' site(s) still ride an animation before the only publisher in the tree:');
    for(const b of bad) console.log('   ' + b);
    console.log('      Every other browser holds still for the length of that ride. Publish, then ride:');
    console.log('      call publishNow() (src/ui/flow.js) the moment the event is recorded.');
    return 1;
  }
  console.log('GREEN — no sail/sweep ride sits between an emit and its publish in ' + SOURCES.join(', ') + '.');
  return 0;
}

async function attach(port){
  let list;
  try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); }
  catch(e){ NOTRUN('no debuggable browser on port ' + port + ' (' + e.message + ')'); }
  const t = list.find(x => x.type === 'page' && x.url.includes(SITE));
  if(!t) NOTRUN('no game page on port ' + port + ' whose URL contains "' + SITE + '"');
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } };
  const C = {};
  C.send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  C.evalJS = async expr => {
    const r = await C.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 40000 });
    if(r.result?.exceptionDetails) return '__ERR ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 300);
    return r.result?.result?.value;
  };
  await C.send('Runtime.enable');
  return C;
}

/* THE PAGE MUST PROVE IT HAS THE BUILD UNDER TEST, and this is not paranoia — a green run here was
   once the browser serving src/ui/flow.js out of its own HTTP cache while the server served the new
   file. Restart the browser after editing src/; a reload is not enough. */
async function proveBuild(H){
  const has = await H.evalJS("(async()=>{const m=await import('/src/ui/flow.js');"
    + "const t=await (await fetch('/src/ui/flow.js',{cache:'no-store'})).text();"
    + "return JSON.stringify({publishNow:typeof m.publishNow,"
    + "sitesInServedFile:(t.match(/publishNow\\(\\);await animate/g)||[]).length})})()");
  if(typeof has !== 'string' || has.startsWith('__ERR')) NOTRUN('could not ask the page which build it is running: ' + has);
  console.log('build in the page:', has);
  return JSON.parse(has);
}

async function pageState(H){
  const pre = await H.evalJS("(async()=>{window.__st=(await import('/src/state/index.js')).appState;"
    + "window.__flow=await import('/src/ui/flow.js');window.__sh=await import('/src/shared/index.js');"
    + "return JSON.stringify({host:window.__st.isHost,live:!!window.__st.live,room:window.__st.room,"
    + "evs:window.__st.game?window.__st.game.events.length:null})})()");
  if(typeof pre !== 'string' || pre.startsWith('__ERR')) NOTRUN('could not read the page state: ' + pre);
  console.log('page:', pre);
  const st = JSON.parse(pre);
  if(!st.host || !st.live || !st.room) NOTRUN('this tab is not a live host in a room — host a crew game first (docs/DRIVING-THE-GAME.md §5c)');
  return st;
}

// sample events.length and evPushed every frame — publication is a synchronous call inside the
// publisher, so a per-frame sample is finer than the thing being measured
async function startSampler(H){
  const frames = Math.ceil(WINDOW_MS / 16) + 240;
  await H.evalJS("(()=>{window.__P=[];window.__run=true;const t0=performance.now();"
    + "const tick=()=>{const s=window.__st;window.__P.push([+(performance.now()-t0).toFixed(1),s.game.events.length,s.evPushed,s.evConsumed]);"
    + "if(window.__P.length<" + frames + "&&window.__run)requestAnimationFrame(tick);};requestAnimationFrame(tick);return 1})()");
  await sleep(300);
}

/* ADAPTIVE WINDOW, and this is the fix for the way this check used to give up. The old version
   slept a fixed 25s; when the subject fell late the sampler had stopped before it landed, so the
   check printed NOT RUN with nothing to show for the run. It now watches until the subject has
   been both emitted and published, or WINDOW_MS elapses — a slow board costs time, not a verdict. */
async function waitForPublish(H, before, kind){
  const t0 = Date.now();
  while(Date.now() - t0 < WINDOW_MS){
    await sleep(500);
    const s = await H.evalJS("(()=>{const g=window.__st.game;"
      + "let i=-1;for(let k=g.events.length-1;k>=" + before + ";k--)if(g.events[k].t===" + JSON.stringify(kind) + "){i=k;break;}"
      + "return JSON.stringify({i,pushed:window.__st.evPushed,n:g.events.length})})()");
    if(typeof s !== 'string') continue;
    const v = JSON.parse(s);
    if(v.i >= 0 && v.pushed > v.i) return true;
  }
  return false;
}

async function measure(H, before, kind, label, settled, forceIdx){
  await sleep(400);                     // let a few more frames land past the publish
  await H.evalJS('window.__run=false;1');
  const P     = JSON.parse(await H.evalJS('JSON.stringify(window.__P)'));
  const kinds = JSON.parse(await H.evalJS('JSON.stringify(window.__st.game.events.map(e=>e.t))'));
  if(OUT) fs.writeFileSync(OUT, JSON.stringify({ label, before, settled, kinds, P }));

  const idx = forceIdx != null ? forceIdx
    : kinds.map((t, i) => [t, i]).filter(([t, i]) => t === kind && i >= before).map(([, i]) => i).pop();
  if(idx == null) NOTRUN('the posed ' + label + ' emitted no `' + kind + '`. Events after it: ' + (kinds.slice(before).join(',') || '(none)'));

  const at    = pred => { for(const p of P) if(pred(p)) return p[0]; return null; };
  const lagFor = i => { const emit = at(p => p[1] > i), pub = at(p => p[2] > i);
                        return (emit == null || pub == null) ? null : { emit, pub, lag: +(pub - emit).toFixed(0) }; };
  const T = lagFor(idx);

  console.log('event #' + idx + ' = ' + kind + ' (' + label + ')  emitted at ' + (T && T.emit) + 'ms, published at ' + (T && T.pub) + 'ms');
  console.log('CONTROL — the same measurement for every other event of this push:');
  let controls = 0;
  for(let i = before; i < kinds.length; i++){
    const Lg = lagFor(i);
    if(i !== idx && Lg){ console.log('   #' + i + ' ' + kinds[i].padEnd(14) + ' publish lag ' + Lg.lag + 'ms'); controls++; }
  }
  if(!T) NOTRUN('never saw the ' + kind + ' published inside the ' + WINDOW_MS + 'ms window (settled=' + settled + '). Use a FRESH room, or raise W9_WINDOW_MS.');
  /* A check that cannot print PASS is not a check (CLAUDE.md rule 6: red-proof the instrument).
     The control events are the proof that this instrument is able to print a small number. */
  if(!controls) NOTRUN('no control events were measurable — the instrument has not shown it can print a small number, so its big number means nothing yet');

  /* DID THE PUBLISH CLAIM THE RIDE? This is the question that decides whether publishNow() is the
     fix or is secretly the REJECTED fix (moving liveRender above the ride) wearing a new name.
     appState.evConsumed is how far the LOCAL drain has got. publishNow() must not move it — it
     calls only the broadcast half (src/ui/panel.js). So: if evConsumed advances at the same frame
     the event is published, the host has handed its own ride to the un-awaited drain and stopped
     waiting for it, and this whole change must be reverted (CLAUDE.md rule 23). */
  const pubFrame = P.find(p => p[2] > idx), conFrame = P.find(p => p[3] > idx);
  if(pubFrame && conFrame){
    const gap = +(conFrame[0] - pubFrame[0]).toFixed(0);
    console.log('\nRIDE OWNERSHIP — published at ' + pubFrame[0] + 'ms, locally consumed at ' + conFrame[0] + 'ms (gap ' + gap + 'ms)');
    if(gap <= 0) console.log('   ⚠ the local drain advanced AT the publish — the publish claimed the ride. That is the');
    else         console.log('   the drain advanced AFTER the publish, so the ride is still this call site\'s own and still awaited.');
    if(gap <= 0) console.log('   rejected fix in disguise (rule 23). REVERT.');
  } else {
    console.log('\nRIDE OWNERSHIP — not measurable in this sample (no frame showed the local drain passing #' + idx + ').');
  }

  console.log('\n' + label.toUpperCase() + ' PUBLISH LAG = ' + T.lag + 'ms   (budget ' + BUDGET_MS + 'ms)');
  if(T.lag > BUDGET_MS){
    console.log('RED — the host held this event for ' + T.lag + 'ms before putting it on the wire.');
    console.log('      Every guest sat on a frozen board for that whole window, and it grows with the');
    console.log("      host's own animation. Publish before you ride: src/ui/flow.js publishNow().");
    return 1;
  }
  console.log('GREEN — it reached the wire within budget.');
  return 0;
}

/* POSE THE BOARD rather than sailing to it (CLAUDE.md rule 26, DRIVING-THE-GAME.md §5e): put a
   ship two water squares upwind of the rim so the engine's push ends SWEPT. A voyage played to
   a natural sweep is many minutes of stochastic sailing for one sample. */
async function legStorm(H){
  console.log('LEG storm — MEASURED, host tab only, no network in the number.');
  await pageState(H);
  const pick = JSON.parse(await H.evalJS("(()=>{const g=window.__st.game,D=window.__sh.DIRS;"
    + "const water=c=>!g.blocked(c)&&!g.isIsland(c)&&!g.isHome(c)&&!g.onRim(c);"
    + "const at=(c,p)=>g.players.some(q=>q!==p&&q.pos[0]===c[0]&&q.pos[1]===c[1]);"
    + "const rim=[...g.rim].map(s=>s.split(',').map(Number));"
    /* EVERY SQUARE ON THE ROUTE HAS TO BE CLEAR, INCLUDING THE RIM SQUARE ITSELF, and every seat is
       tried rather than only players[0]. An earlier version checked the two water squares and not
       the rim square a ship may already be sitting on: the push then came back `landHeld` (an
       `anchorHold` event, no sweep) three runs in a row and the check honestly printed NOT RUN
       each time. A pose that cannot produce its subject is a check that can never go green. */
    + "for(const p of g.players.filter(q=>!q.done&&!q.baking)){for(const k of Object.keys(D)){const d=D[k];for(const R of rim){"
    + "const c1=[R[0]-d[0],R[1]-d[1]],c=[R[0]-2*d[0],R[1]-2*d[1]];"
    + "if(!water(c1)||!water(c))continue;"
    + "if(at(c,p)||at(c1,p)||at(R,p))continue;"
    + "p.pos=[...c];return JSON.stringify({dir:k,seat:p.idx,from:c,rim:R});}}}"
    + "return JSON.stringify(null)})()") || 'null');
  if(!pick) NOTRUN('could not pose a swept storm push on this board (no rim square with two clear water squares upwind)');
  console.log('posed:', JSON.stringify(pick));
  await startSampler(H);
  const before = await H.evalJS('window.__st.game.events.length');
  await H.evalJS('window.__flow.runStormLive(' + JSON.stringify(pick.dir) + ')');
  const settled = await waitForPublish(H, before, 'tradewind');
  return measure(H, before, 'tradewind', 'the rim sweep', settled);
}

/* THE ORDINARY SAIL — every captain, every turn, and the reason the count of "two sites" was wrong.
   Poses a BOT with somewhere to sail and runs the real botTurn() path in src/ui/flow.js, so the
   glide measured here is the one a player actually sits through on every turn of every voyage.
   WHAT THIS LEG CANNOT SEE, said out loud: the two HUMAN sail sites (humanAct, humanTurn) hold the
   same text as the bot's, but they sit behind a prompt this leg does not answer, so it never
   reaches them. `--leg=shape` is what covers those. */
async function legSail(H){
  console.log('LEG sail — MEASURED, host tab only, no network in the number.');
  await pageState(H);
  await startSampler(H);
  const before = await H.evalJS('window.__st.game.events.length');
  /* THE INSTRUMENT MUST REACH ITS SUBJECT, and the first version of this leg did not.
     animateSailRoute CULLS a short straight hop — it draws nothing and returns at once — so a
     one- or two-square bot sail publishes instantly whether or not the publish was moved, and the
     leg printed a confident 0ms GREEN against the KNOWN-BROKEN build. A measurement that cannot
     fail is not a measurement (CLAUDE.md rule 6). So: take turns until a sail lands whose route is
     long enough to actually be ridden, and if none does, print NOT RUN rather than that 0ms. */
  const MIN_ROUTE = 4;   // squares INCLUDING the one being left; below this the walker culls
  let idx = null;
  for(let attempt = 0; attempt < 8 && idx === null; attempt++){
    const seat = JSON.parse(await H.evalJS("(()=>{const g=window.__st.game;"
      + "const b=g.players.filter(q=>!q.done&&!q.baking&&q.strategy!=='human');"
      + "return JSON.stringify(b.length?b[" + '${attempt}'.replace('${attempt}', attempt) + " % b.length].idx:null)})()") || 'null');
    if(seat === null) NOTRUN('no bot captain is still on the board — a sail leg needs one seat that will sail without a prompt');
    await H.evalJS("(async()=>{await window.__flow.botTurn(window.__st.game.players[" + seat + "]);return 1})()");
    const found = JSON.parse(await H.evalJS("(()=>{const g=window.__st.game;const out=[];"
      + "for(let i=" + before + ";i<g.events.length;i++){const e=g.events[i];"
      + "if(e.t==='sail')out.push([i,((e.draw||e.route||[]).length),Object.keys(e).join('|')]);}return JSON.stringify(out)})()") || '[]');
    const ridden = found.filter(([, len]) => len >= MIN_ROUTE);
    if(found.length && attempt === 0) console.log('  sail event fields: ' + found[0][2]);
    console.log('  turn ' + (attempt + 1) + ' (seat ' + seat + '): sails so far ' + JSON.stringify(found.map(f => [f[0], f[1]]))
      + (ridden.length ? '  <- ridden' : '  (all culled by the walker — no ride to hold)'));
    if(ridden.length) idx = ridden[ridden.length - 1][0];
  }
  if(idx === null) NOTRUN('eight bot turns produced no sail long enough to be RIDDEN (route >= ' + MIN_ROUTE
    + ' squares). A culled hop publishes instantly on the broken build too, so measuring one would be a 0ms that means nothing.');
  console.log('subject: event #' + idx + ', a sail the walker actually rides');
  const settled = await waitForPublish(H, before, 'sail');
  return measure(H, before, 'sail', 'the ordinary sail', settled, idx);
}

/* WORST VERDICT WINS, and NOT RUN is never rounded up into a pass. */
(async () => {
  const legs = LEG === 'all' ? ['shape', 'storm', 'sail'] : [LEG];
  const results = {};
  for(const name of legs){
    console.log('\n──────── ' + name + ' ────────');
    try {
      if(name === 'shape'){ results[name] = legShape(); continue; }
      if(!['storm', 'sail'].includes(name)){ console.log('unknown leg "' + name + '" — use shape | storm | sail | all'); process.exit(2); }
      const H = await attach(PORT);
      await proveBuild(H);
      results[name] = name === 'storm' ? await legStorm(H) : await legSail(H);
    } catch(e){
      if(e && e.notrun){
        console.log('NOT RUN — ' + e.message);
        console.log('           (a leg that could not start is not a leg that passed)');
        results[name] = 2;
      } else { console.log('NOT RUN — probe error: ' + (e && e.message)); results[name] = 2; }
    }
  }
  console.log('\n──────── verdict ────────');
  for(const k of Object.keys(results)) console.log('  ' + k.padEnd(6) + ' ' + ['GREEN', 'RED', 'NOT RUN'][results[k]]);
  const vals = Object.values(results);
  if(vals.includes(1)) process.exit(1);
  if(vals.includes(2)) process.exit(2);
  process.exit(0);
})();
