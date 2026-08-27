#!/bin/sh
# wk_redproof.sh — prove the WebKit runner can measure a swing before trusting any verdict from it.
# Drives two static pages: the 24d-suspect pattern (scale(var()) in keyframes, class landing late)
# and the literal pattern. Prints both swings. KNOWN RESULT on WebKitGTK 2.52 (2026-08-24): BOTH
# swing full (~10.5px) — this engine does NOT reproduce the 24d flat video, so that video's
# mechanism is unconfirmed and the runner red-proofs only the measurement path, not the var bug.
SCR="${1:-/tmp/wk-redproof}"; mkdir -p "$SCR"
cat > "$SCR/var.html" <<'HTML'
<!doctype html><style>
@keyframes g { 0%,100% { transform: scale(1); } 50% { transform: scale(var(--hi, 1.05)); } }
#a { position:fixed; left:100px; top:100px; width:66px; height:66px; border-radius:50%;
  background:#fffdf2; border:2.5px solid #177; animation: g 1.1s ease-in-out infinite; }
#a.big { --hi: 1.15; }
</style><div id="a"></div>
<script>setTimeout(()=>document.getElementById('a').classList.add('big'), 120);</script>
HTML
cat > "$SCR/lit.html" <<'HTML'
<!doctype html><style>
@keyframes g { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
#a { position:fixed; left:100px; top:100px; width:66px; height:66px; border-radius:50%;
  background:#fffdf2; border:2.5px solid #177; animation: g 1.1s ease-in-out infinite; }
</style><div id="a"></div>
HTML
cd "$(dirname "$0")/../.." || exit 1
echo "var-in-keyframes page:"; xvfb-run -a node 4/scripts/wk_probe.mjs "file://$SCR/var.html" "#a" 1400
echo "literal page:";          xvfb-run -a node 4/scripts/wk_probe.mjs "file://$SCR/lit.html" "#a" 1400
