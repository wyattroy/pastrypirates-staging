# 🏴‍☠️ Pastry Pirates *on the Sugar Seas*

A board game in development — plunder the Caribbean for baking ingredients, flip the gold bullion, and become the Best Baker in Barbados.

**[▶️ Play online](https://playpastrypirates.com/)** — play with friends, each in their own browser over the internet (2–4 players, bots fill empty seats). Uses a free Firebase Realtime Database — see `ONLINE_SETUP.md` for the one-time setup.

**[🧪 Open the rules lab](https://playpastrypirates.com/lab.html)** — an interactive simulator where you can tweak every rule, watch bot games play out, scrub the timeline, and run 400-game balance checks.

## What's here

- `index.html` — **play online with friends** (this is the default page served by GitHub Pages), each in their own browser over the internet (2–4 players, bots fill empty seats). Uses a free Firebase Realtime Database — see `ONLINE_SETUP.md` for the one-time setup.
- `lab.html` — the Pastry Pirates Lab (self-contained, no dependencies)
- `ONLINE_SETUP.md` — step-by-step guide to wire up the free Firebase backend and start a game
- `cocoa_pirates_sim.py` — the Python simulation engine used for balance research (~50,000 games)
- `DESIGN_REPORT.md` — full findings: strategy win rates, coin-flip math, and the recommended ruleset
- `docs/MODULES.md` — the module-loading and local-dev contract (HTTP server required, no bundler)

## Running the Python sim

    python3 cocoa_pirates_sim.py baseline    # current rules, strategy tournament
    python3 cocoa_pirates_sim.py variants    # rule variant comparisons
    python3 cocoa_pirates_sim.py final2      # recommended ruleset

