// Does the browser actually FETCH the icon family at boot, before any icon is on screen?
//
// INBOX-20260901T1335Z, Wyatt's own example: "i notice sometimes that the 'fire the ovens' graphic
// loads dynamically when it is called, which will make it appear blank on slow connections."
// CEO Review 80 found that after a whole watch spent on this item, `assets/icons/` — 78 files,
// including FLAME_IMG, the flame in every ovens line — was still not in preloadAssets().
//
//   node scripts/qa/preload_covers_icons_probe.mjs
//
// POSED, NOT PLAYED (rule 26): boot to the bare welcome screen and stop. No game is started, so no
// icon has been rendered by anything — every icon URL in the resource log therefore got there
// because the preloader asked for it, not because a screen needed it. That is the whole question,
// and it has a yes/no answer, so it does not want a rate over a voyage.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from '../lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await openChrome({
  W: 1280, H: 900, dbgPort: 9417, httpPort: 8417, serveRoot: ROOT,
  profileDir: path.join(ROOT, '.tmp-preload-profile'), dsf: 1,
});
try {
  await t.send('Network.enable');
  await t.send('Network.clearBrowserCache');
  await t.nav('http://127.0.0.1:8417/index.html');
  await sleep(2000);
  await t.ev('localStorage.clear()');
  await t.send('Network.clearBrowserCache');
  await t.nav('http://127.0.0.1:8417/index.html');
  await sleep(12000);   // preloadAssets() is fired without being awaited on the fresh-visit path

  const r = await t.ev(`(() => {
    const fetched = new Set(performance.getEntriesByType('resource')
      .map(e => new URL(e.name).pathname.replace(/^\\//, ''))
      .filter(n => n.startsWith('assets/')));
    // Every icon currently on screen — these would have been fetched anyway, so they prove nothing.
    const onScreen = new Set([...document.images].map(i => new URL(i.src, location.href).pathname.replace(/^\\//, '')));
    const icons = [...fetched].filter(n => n.startsWith('assets/icons/'));
    return {
      totalAssets: fetched.size,
      icons: icons.length,
      iconsOnScreen: icons.filter(n => onScreen.has(n)).length,
      flame: fetched.has('assets/icons/flame.png'),
      flameOnScreen: onScreen.has('assets/icons/flame.png'),
      gameStarted: !!(window.appState && appState.game && appState.game.players && appState.game.players.some(p => p.strategy === 'human')),
    };
  })()`);

  if (!r || r.__err) { console.error('probe failed:', r); process.exit(1); }
  console.log(`assets fetched at boot: ${r.totalAssets}`);
  console.log(`  assets/icons/ fetched: ${r.icons}   (of those, on screen: ${r.iconsOnScreen})`);
  console.log(`  assets/icons/flame.png fetched: ${r.flame}   on screen: ${r.flameOnScreen}`);
  console.log(`  a human game had started (should be false — this is the bare welcome screen): ${r.gameStarted}`);

  const warmedUnseen = r.icons - r.iconsOnScreen;
  if (r.flame && !r.flameOnScreen && warmedUnseen > 20) {
    console.log(`\nPASS — ${warmedUnseen} icons were fetched WITHOUT being drawn, flame.png among them.`);
  } else {
    console.error(`\nFAIL — the icon family is not being warmed up front (flame fetched: ${r.flame}, warmed-but-unseen: ${warmedUnseen}).`);
    process.exitCode = 1;
  }
} finally {
  await t.close();
}
