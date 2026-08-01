"""
Cocoa Pirates simulator.
Models the current ruleset plus toggleable variant mechanics.
"""
import random
from collections import defaultdict
from dataclasses import dataclass, field

INGREDIENTS = ["wheat", "eggs", "sugar", "cocoa", "dairy"]
DIRS = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}

@dataclass
class Rules:
    grid: int = 11
    start_coins: int = 3
    storm_prob: float = 0.125
    max_rounds: int = 150
    # --- variant toggles ---
    attacker_wins_hh: bool = False        # A: HH round scores for attacker instead of cancelling
    battle_reflip: bool = False           # B: spend 1 coin to reflip your coin once per battle round
    scarcity_tokens: int = 0              # C: >0 = tokens per island; 0 = infinite
    trade_bonus: bool = False             # D: both traders get +1 coin from bank; trade at range 2
    dock_buy: bool = False                # E: tails on dock lets you BUY ingredient for 3 coins instead of receiving 3 coins
    cargo_risk: bool = False              # F: defender with 3+ ingredients starts battle down 0-1
    redock_allowed: bool = True           # can re-flip on a later visit if first dock gave coins
    asym_spoils: bool = False             # G: if attacker LOSES they pay only 2 coins (raiding is +EV but 50/50)
    attack_cost: int = 0                  # H: coins to initiate a battle ("powder")
    attacker_free_reflip: bool = False    # I: attacker may reflip one tails per battle, free
    merchant_cargo: bool = False          # M: players pick up non-recipe ingredients as trade goods
    global_trade: bool = False            # T: trade allowed at any distance (parley), battles still adjacent
    rotate_order: bool = False            # R: first player rotates each round
    random_start_order: bool = False      # randomize turn order once at game start, then hold it fixed
    staggered_start_coins: bool = False   # Nth-to-act starts with start_coins+N-1 (levels the first-turn edge)
    paid_broadside: bool = False          # P: attacker reflip costs 1 coin (once per battle); overrides free reflip
    loser_protects: bool = False          # L: loser pays 5 coins FIRST if able, keeping ingredients
    n_ingredients: int = 5                # number of islands/ingredient types
    recipe_size: int = 4                  # ingredients each player must collect
    island_w: int = 1                     # island footprint (cells)
    island_h: int = 1
    single_dock: bool = False             # one dock cell per island, one ship at a time

@dataclass
class Player:
    idx: int
    strategy: str
    pos: tuple = (5, 5)
    coins: int = 3
    ingredients: list = field(default_factory=list)
    recipe: list = field(default_factory=list)
    docked_ports: set = field(default_factory=set)   # ports where flip already taken this visit
    port_first_flip_done: set = field(default_factory=set)
    finished: bool = False
    heads_count: int = 0
    flip_count: int = 0
    corner: object = None      # monopolist's target ingredient to corner
    just_docked: bool = False  # docked last turn -> wind can't force you into the island

    def needs(self):
        return [i for i in self.recipe if i not in self.ingredients]

    def flip(self, rng):
        self.flip_count += 1
        h = rng.random() < 0.5
        if h:
            self.heads_count += 1
        return h

def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

class Game:
    def __init__(self, strategies, rules, rng):
        self.rules = rules
        self.rng = rng
        n = rules.grid
        self.home = (n // 2, n // 2)
        # place islands (possibly multi-cell rectangles), spread apart
        self.ings = INGREDIENTS[:rules.n_ingredients] if rules.n_ingredients <= 5 else \
            INGREDIENTS + [f"spice{k}" for k in range(rules.n_ingredients - 5)]
        self.islands = {}       # cell -> ingredient (every cell of the island)
        self.dock_of = {}       # ing -> single dock cell (water), if single_dock
        iw, ih = rules.island_w, rules.island_h
        rects = []
        for _ing in self.ings:
            done = False
            for spacing in (3, 2, 1):
                tops = [(x, y) for x in range(n) for y in range(n)]
                rng.shuffle(tops)
                for (x, y) in tops:
                    w, h = (iw, ih) if rng.random() < .5 else (ih, iw)
                    if x + w > n or y + h > n:
                        continue
                    cells_r = [(a, b) for a in range(x, x + w) for b in range(y, y + h)]
                    if any(manhattan(c, self.home) < 2 for c in cells_r):
                        continue
                    if any(manhattan(c, d) < spacing for c in cells_r
                           for r2 in rects for d in r2):
                        continue
                    rects.append(cells_r)
                    done = True
                    break
                if done:
                    break
        for ing, cells_r in zip(self.ings, rects):
            for c in cells_r:
                self.islands[c] = ing
        self.island_rect = dict(zip(self.ings, rects))
        if rules.single_dock:
            for ing, cells_r in self.island_rect.items():
                waters = []
                for c in cells_r:
                    for d in DIRS.values():
                        w2 = (c[0] + d[0], c[1] + d[1])
                        if (0 <= w2[0] < n and 0 <= w2[1] < n
                                and w2 not in self.islands and w2 != self.home):
                            waters.append(w2)
                self.dock_of[ing] = rng.choice(waters) if waters else self.home
        self.dock_cells = set(self.dock_of.values())
        # navigation target per ingredient
        self.island_of = {ing: (self.dock_of[ing] if rules.single_dock else cells_r[0])
                          for ing, cells_r in self.island_rect.items()}
        self.tokens = {ing: (rules.scarcity_tokens or 10**9) for ing in self.ings}
        self.players = []
        for i, s in enumerate(strategies):
            p = Player(idx=i, strategy=s, pos=self.home, coins=rules.start_coins)
            p.recipe = rng.sample(self.ings, rules.recipe_size)
            self.players.append(p)
        # ships start at Barbados's four docks (N/S/E/W of the island)
        dirs_list = list(DIRS.values())
        for i, p in enumerate(self.players):
            d = dirs_list[i % 4]
            p.pos = (self.home[0] + d[0], self.home[1] + d[1])
        # monopolists pick which ingredient to corner: most demanded by opponents,
        # tie-break toward one on their own recipe (dual use)
        for p in self.players:
            if p.strategy == "monopolist" and rules.scarcity_tokens:
                demand = lambda ing: sum(1 for q in self.players
                                         if q is not p and ing in q.recipe)
                p.corner = max(self.ings, key=lambda i: (demand(i), i in p.recipe))
        self.round = 0
        self.record = False
        self.log = []
        self.battles = 0
        self.bankrupt_spoils = 0
        self.battles_won_by_attacker = 0
        self.trades = 0
        self.groundings = 0
        self.dodges = 0
        self.anchors = 0
        self.fish_attempts = 0
        self.fish_hits = 0
        self.turns = 0
        self.broke_turns = 0
        self.winner = None
        self.finish_order = []

    def ev(self, **kw):
        if self.record:
            kw["state"] = [
                {"pos": list(p.pos), "coins": p.coins, "ing": list(p.ingredients),
                 "done": p.finished} for p in self.players]
            self.log.append(kw)

    # ---------- movement helpers ----------
    def blocked(self, pos):
        n = self.rules.grid
        return not (0 <= pos[0] < n and 0 <= pos[1] < n)

    def moored(self, p):
        """Ships that DOCKED last turn (or sit at a berth / Barbados) can't be wind-forced into land."""
        return (p.just_docked
                or (self.rules.single_dock and self.adjacent_port(p) is not None)
                or manhattan(p.pos, self.home) <= 1)

    def wind_push(self, p, d, dist):
        for _ in range(dist):
            nxt = (p.pos[0] + d[0], p.pos[1] + d[1])
            if self.blocked(nxt):
                return
            if nxt == self.home:
                self.ev(t="moored", p=p.idx)
                return  # safe harbor: Barbados is an island now
            if any(q.pos == nxt and q is not p and not q.finished for q in self.players):
                self.ev(t="moored", p=p.idx)
                return  # another ship holds that square — wind stops short
            if nxt in self.islands:
                if self.moored(p):
                    self.ev(t="moored", p=p.idx)
                    return
                # run-aground rule
                if p.coins >= 3:
                    p.coins -= 1  # pay to dodge; stays put (dodged)
                    self.dodges += 1
                    self.ev(t="dodge", p=p.idx)
                else:
                    if p.flip(self.rng):
                        self.anchors += 1
                        self.ev(t="anchor", p=p.idx, heads=True)
                    else:
                        p.coins -= p.coins // 2
                        self.groundings += 1
                        self.ev(t="aground", p=p.idx, heads=False)
                return
            p.pos = nxt

    def step_toward(self, p, target, steps):
        for _ in range(steps):
            if p.pos == target:
                return
            dx = target[0] - p.pos[0]
            dy = target[1] - p.pos[1]
            opts = []
            if dx != 0:
                opts.append((p.pos[0] + (1 if dx > 0 else -1), p.pos[1]))
            if dy != 0:
                opts.append((p.pos[0], p.pos[1] + (1 if dy > 0 else -1)))
            def passable(o):
                if self.blocked(o) or o in self.islands or o == self.home:
                    return False
                if any(q.pos == o and q is not p and not q.finished for q in self.players):
                    return False  # another ship holds that square — can't end a move on it
                return True
            opts = [o for o in opts if passable(o)]
            if not opts:
                # sidestep
                for d in DIRS.values():
                    o = (p.pos[0] + d[0], p.pos[1] + d[1])
                    if passable(o):
                        opts.append(o)
                if not opts:
                    return
            p.pos = min(opts, key=lambda o: manhattan(o, target))

    def adjacent_port(self, p):
        """Returns the ingredient name of a dockable island, or None."""
        if self.rules.single_dock:
            for ing, dcell in self.dock_of.items():
                if p.pos == dcell:
                    return ing
            return None
        for d in DIRS.values():
            c = (p.pos[0] + d[0], p.pos[1] + d[1])
            if c in self.islands:
                return self.islands[c]
        return None

    def dock_occupied_by(self, ing, exclude=None):
        d = self.dock_of.get(ing)
        if d is None:
            return None
        for q in self.players:
            if q is not exclude and not q.finished and q.pos == d:
                return q
        return None

    def adjacent_opponents(self, p):
        out = []
        for q in self.players:
            if q is p or q.finished:
                continue
            if manhattan(p.pos, q.pos) <= 1:
                out.append(q)
        self.rng.shuffle(out)
        return out

    def trade_range_opponents(self, p):
        if self.rules.global_trade:
            return [q for q in self.players if q is not p and not q.finished]
        r = 2 if self.rules.trade_bonus else 1
        return [q for q in self.players if q is not p and not q.finished
                and manhattan(p.pos, q.pos) <= r]

    # ---------- actions ----------
    def do_dock(self, p, port):
        ing = port  # ports are identified by ingredient name
        if self.rules.single_dock and self.dock_occupied_by(ing, exclude=p):
            return False
        first = port not in p.port_first_flip_done
        if not first and not self.rules.redock_allowed:
            return False
        if not first and port in p.docked_ports:
            return False  # must leave and come back
        p.port_first_flip_done.add(port)
        p.docked_ports.add(port)
        p.just_docked = True
        if p.flip(self.rng):
            if self.tokens[ing] > 0:
                self.tokens[ing] -= 1
                p.ingredients.append(ing)
                self.ev(t="dock", p=p.idx, ing=ing, heads=True, got="ing")
            else:
                p.coins += 3
                self.ev(t="dock", p=p.idx, ing=ing, heads=True, got="coins_empty")
        else:
            if self.rules.dock_buy and p.coins >= 3 and ing in p.needs() and self.tokens[ing] > 0:
                p.coins -= 3
                self.tokens[ing] -= 1
                p.ingredients.append(ing)
                self.ev(t="dock", p=p.idx, ing=ing, heads=False, got="bought")
            else:
                p.coins += 3
                self.ev(t="dock", p=p.idx, ing=ing, heads=False, got="coins")
        return True

    def try_trade(self, p):
        for q in self.trade_range_opponents(p):
            mine_for_them = [i for i in p.ingredients if i not in p.needs() + q.ingredients and i in q.recipe]
            theirs_for_me = [i for i in q.ingredients if i not in q.needs() + p.ingredients and i in p.recipe]
            # a trade is agreed when both sides gain: swap surplus ingredients each needs
            give = [i for i in p.ingredients if i in q.needs() and p.ingredients.count(i) > (1 if i in p.recipe else 0)]
            get = [i for i in q.ingredients if i in p.needs() and q.ingredients.count(i) > (1 if i in q.recipe else 0)]
            if give and get:
                gi, ge = give[0], get[0]
                p.ingredients.remove(gi); q.ingredients.append(gi)
                q.ingredients.remove(ge); p.ingredients.append(ge)
                self.trades += 1
                if self.rules.trade_bonus:
                    p.coins += 1; q.coins += 1
                self.ev(t="trade", a=p.idx, b=q.idx, gave=gi, got=ge, kind="swap")
                return True
            # coin-for-ingredient trade: buy a surplus ingredient (monopolists gouge)
            if get:
                ge = get[0]
                price = 5 if (q.strategy == "monopolist" and ge == q.corner) else 4
                if p.coins >= price:
                    q.ingredients.remove(ge); p.ingredients.append(ge)
                    p.coins -= price; q.coins += price
                    self.trades += 1
                    if self.rules.trade_bonus:
                        p.coins += 1; q.coins += 1
                    self.ev(t="trade", a=p.idx, b=q.idx, gave=f"{price} coins", got=ge, kind="buy")
                    return True
        return False

    def battle(self, attacker, defender):
        r = self.rules
        if r.attack_cost:
            if attacker.coins < r.attack_cost:
                return None
            attacker.coins -= r.attack_cost
        self.battles += 1
        a_pts, d_pts = 0, 0
        if r.cargo_risk and len(defender.ingredients) >= 3:
            a_pts = 1
        free_reflip = r.attacker_free_reflip and not r.paid_broadside
        paid_reflip = r.paid_broadside
        rounds_log = []
        while a_pts < 3 and d_pts < 3:
            broadside = False
            ah = attacker.flip(self.rng)
            dh = defender.flip(self.rng)
            if free_reflip and not ah:
                ah = attacker.flip(self.rng)
                free_reflip = False
                broadside = True
            elif paid_reflip and not ah and attacker.coins >= 1:
                attacker.coins -= 1
                ah = attacker.flip(self.rng)
                paid_reflip = False
                broadside = True
            rounds_log.append([int(ah), int(dh), int(broadside)])
            if r.battle_reflip:
                # a losing side with coins buys a reflip
                if not ah and dh and attacker.coins >= 1:
                    attacker.coins -= 1
                    ah = attacker.flip(self.rng)
                elif ah and not dh and defender.coins >= 1:
                    defender.coins -= 1
                    dh = defender.flip(self.rng)
            if ah and dh:
                if r.attacker_wins_hh:
                    a_pts += 1
            elif ah:
                a_pts += 1
            elif dh:
                d_pts += 1
        winner, loser = (attacker, defender) if a_pts >= 3 else (defender, attacker)
        self.ev(t="battle", a=attacker.idx, d=defender.idx, rounds=rounds_log,
                winner=winner.idx)
        if winner is attacker:
            self.battles_won_by_attacker += 1
        # spoils: loser gives ingredient of winner's choice, or 5 coins
        if r.asym_spoils and loser is attacker:
            take = min(2, loser.coins)
            loser.coins -= take
            winner.coins += take
            # attacker lost (raider penalty): no square is taken, so no swap
            return winner
        wanted = [i for i in loser.ingredients if i in winner.needs()]
        if r.loser_protects and loser.coins >= 5:
            loser.coins -= 5; winner.coins += 5
        elif loser.coins >= 5 and not wanted:
            loser.coins -= 5; winner.coins += 5
        elif wanted:
            i = wanted[0]
            loser.ingredients.remove(i); winner.ingredients.append(i)
        elif loser.ingredients:
            i = loser.ingredients[0]
            loser.ingredients.remove(i); winner.ingredients.append(i)
        else:
            take = min(5, loser.coins)
            loser.coins -= take; winner.coins += take
            self.bankrupt_spoils += 1
        # only a winning attacker takes the loser's square; a repelled attack moves no one.
        # only ships that actually swapped into a new berth may dock — a ship that never
        # left its square shouldn't trigger a re-dock.
        if winner is attacker:
            attacker.pos, defender.pos = defender.pos, attacker.pos
            for pl in (attacker, defender):
                port = self.adjacent_port(pl)
                if port and port not in pl.port_first_flip_done:
                    self.do_dock(pl, port)
        return winner

    # ---------- strategy decisions ----------
    def choose_target(self, p):
        needs = p.needs()
        if not needs:
            return self.home  # recipe done — sail home to win, hoard be damned
        # monopolist gambit: corner the market first, own recipe second
        if p.strategy == "monopolist" and p.corner and self.tokens.get(p.corner, 0) > 0:
            return self.island_of[p.corner]
        # nearest island that still has tokens for a needed ingredient
        cands = [self.island_of[i] for i in needs if self.tokens[i] > 0]
        if self.rules.merchant_cargo and p.strategy == "trader":
            # opportunistically route via islands whose goods opponents need (mild detour)
            extra = [self.island_of[i] for i in self.ings
                     if i not in needs and i not in p.ingredients and self.tokens[i] > 0
                     and any(i in q.needs() for q in self.players if q is not p and not q.finished)]
            if cands:
                best = min(manhattan(p.pos, c) for c in cands)
                extra = [c for c in extra if manhattan(p.pos, c) + 3 <= best]
            cands = cands + extra
        if not cands:
            # must get via trade/battle: chase nearest opponent holding a needed ingredient
            holders = [q for q in self.players if q is not p and not q.finished
                       and any(i in needs for i in q.ingredients)]
            if holders:
                return min(holders, key=lambda q: manhattan(p.pos, q.pos)).pos
            return self.home
        return min(cands, key=lambda c: manhattan(p.pos, c))

    def wants_attack(self, p):
        if p.strategy in ("rusher", "fisher"):
            return None
        if p.coins < self.rules.attack_cost:
            return None
        for q in self.adjacent_opponents(p):
            steals = any(i in p.needs() for i in q.ingredients)
            rich = q.coins >= 5
            if p.strategy == "pirate" and (steals or rich):
                return q
            if p.strategy in ("balanced", "trader") and steals:
                return q
            # dock contention: q is hogging a berth p needs
            if self.rules.single_dock and p.strategy != "rusher":
                for ing in p.needs():
                    if self.tokens.get(ing, 0) > 0 and self.dock_occupied_by(ing) is q:
                        return q
        return None

    def take_turn(self, p, wind_dir, storm):
        r = self.rng
        self.turns += 1
        if p.coins == 0:
            self.broke_turns += 1
        # 1. wind
        self.wind_push(p, DIRS[wind_dir], 2 if storm else 1)
        p.just_docked = False  # protection lasts one turn; re-set if they dock again
        # port-visit lock resets when not adjacent
        port = self.adjacent_port(p)
        if not port:
            p.docked_ports.clear()
        # 2. sail
        target = self.choose_target(p)
        if p.strategy == "pirate" and p.needs():
            # pirates also chase loaded opponents
            prey = [q for q in self.players if q is not p and not q.finished and
                    any(i in p.needs() for i in q.ingredients)]
            if prey:
                nearest_prey = min(prey, key=lambda q: manhattan(p.pos, q.pos))
                if manhattan(p.pos, nearest_prey.pos) < manhattan(p.pos, target):
                    target = nearest_prey.pos
        dist = manhattan(p.pos, target)
        # single-dock berths require exact arrival, so sailing from dist 1 is worth it
        exact = target in self.dock_cells
        sail_worth = dist > 1 or (dist == 1 and exact)
        min_bank = 2 if p.strategy == "fisher" else 0
        if sail_worth and p.coins > min_bank:
            p.coins -= 1
            self.step_toward(p, target, 3)
            if not self.adjacent_port(p):
                p.docked_ports.clear()  # leaving a port re-arms its dock flip
        # 3. act
        port = self.adjacent_port(p)
        if (p.strategy == "trader" or self.rules.global_trade) and self.try_trade(p):
            return
        victim = self.wants_attack(p)
        if victim is not None:
            # negotiation first: try trade, else battle
            if not self.try_trade(p):
                self.battle(p, victim)
            return
        if port and p.strategy == "monopolist" and port == p.corner and self.tokens[port] > 0:
            if self.do_dock(p, port):  # hoard every crate, even duplicates
                return
        if port and port in p.needs() and self.tokens[port] > 0:
            if self.do_dock(p, port):
                return
        if port and self.rules.merchant_cargo and p.strategy in ("trader", "balanced"):
            ing = port
            if (self.tokens[ing] > 0 and ing not in p.ingredients
                    and any(ing in q.needs() for q in self.players if q is not p)):
                if self.do_dock(p, port):
                    return
        if port and port not in p.port_first_flip_done:
            if self.do_dock(p, port):  # grab first-dock coins even if not needed
                return
        # fish if broke or idling
        if p.coins <= (3 if p.strategy == "fisher" else 1):
            self.fish_attempts += 1
            if p.flip(r):
                p.coins += 2
                self.fish_hits += 1

    def check_finish(self, p):
        if not p.needs() and manhattan(p.pos, self.home) <= 1:
            p.finished = True
            self.finish_order.append(p.idx)
            return True
        return False

    def play(self):
        r = self.rng
        order = list(range(len(self.players)))
        if self.rules.random_start_order:
            r.shuffle(order)
        self.turn_order = list(order)
        if self.rules.staggered_start_coins:
            for pos, i in enumerate(order):
                self.players[i].coins = self.rules.start_coins + pos
        while self.round < self.rules.max_rounds:
            self.round += 1
            if self.rules.rotate_order and self.round > 1:
                order = order[1:] + order[:1]
            wind = r.choice("NSEW")
            storm = r.random() < self.rules.storm_prob
            for i in order:
                p = self.players[i]
                if p.finished:
                    continue
                self.take_turn(p, wind, storm)
                if self.check_finish(p):
                    if len(self.finish_order) == 1:
                        # everyone else gets one more turn
                        for j in order:
                            q = self.players[j]
                            if q.finished or j == i:
                                continue
                            self.take_turn(q, wind, storm)
                            self.check_finish(q)
                        return self.resolve_end()
            # nobody finished; continue
        return self.resolve_end()

    def resolve_end(self):
        if not self.finish_order:
            self.winner = None
            return None
        if len(self.finish_order) == 1:
            self.winner = self.finish_order[0]
            return self.winner
        # bakeoff: first to 5, pairwise bracket in finish order
        contenders = [self.players[i] for i in self.finish_order]
        champ = contenders[0]
        for ch in contenders[1:]:
            a_pts = d_pts = 0
            while a_pts < 5 and d_pts < 5:
                ah = champ.flip(self.rng)
                dh = ch.flip(self.rng)
                if ah and dh:
                    if self.rules.attacker_wins_hh:
                        a_pts += 1
                elif ah:
                    a_pts += 1
                elif dh:
                    d_pts += 1
            if d_pts >= 5:
                champ = ch
        self.winner = champ.idx
        return self.winner


def tournament(strategy_sets, rules, n_games=1500, seed=42):
    rng = random.Random(seed)
    stats = {
        "wins_by_strategy": defaultdict(int),
        "games_by_strategy": defaultdict(int),
        "wins_by_seat": defaultdict(int),
        "wins_by_turnpos": defaultdict(int),
        "rounds": [], "battles": [], "trades": [], "unfinished": 0,
        "attacker_winrate": [0, 0], "bankrupt_spoils": 0,
        "fish": [0, 0], "dodge": 0, "anchor": 0, "aground": 0, "broke": [0, 0],
        "luck_wins": 0, "luck_games": 0,  # winner had most heads-rate
        "bakeoffs": 0,
    }
    for g in range(n_games):
        strategies = list(strategy_sets)
        rng.shuffle(strategies)  # rotate seats
        game = Game(strategies, rules, random.Random(rng.randrange(10**9)))
        w = game.play()
        for i, s in enumerate(strategies):
            stats["games_by_strategy"][s] += 1
        stats["rounds"].append(game.round)
        stats["battles"].append(game.battles)
        stats["trades"].append(game.trades)
        stats["attacker_winrate"][0] += game.battles_won_by_attacker
        stats["attacker_winrate"][1] += game.battles
        stats["bankrupt_spoils"] += game.bankrupt_spoils
        stats["fish"][0] += game.fish_attempts
        stats["fish"][1] += game.fish_hits
        stats["dodge"] += game.dodges
        stats["anchor"] += game.anchors
        stats["aground"] += game.groundings
        stats["broke"][0] += game.broke_turns
        stats["broke"][1] += game.turns
        if len(game.finish_order) > 1:
            stats["bakeoffs"] += 1
        if w is None:
            stats["unfinished"] += 1
        else:
            stats["wins_by_strategy"][strategies[w]] += 1
            stats["wins_by_seat"][w] += 1
            stats["wins_by_turnpos"][game.turn_order.index(w)] += 1
            # luck metric: did the winner have the highest heads rate?
            rates = [(p.heads_count / p.flip_count) if p.flip_count else 0 for p in game.players]
            if game.players[w].flip_count and rates[w] == max(rates):
                stats["luck_wins"] += 1
            stats["luck_games"] += 1
    return stats


def report(name, stats):
    n = sum(stats["wins_by_seat"].values()) + stats["unfinished"]
    lines = [f"=== {name} (n={n}) ==="]
    for s in sorted(stats["games_by_strategy"]):
        g = stats["games_by_strategy"][s]
        w = stats["wins_by_strategy"][s]
        lines.append(f"  {s:<10} win rate: {w / (g or 1) * 100:5.1f}%  ({w}/{g})")
    lines.append(f"  seat wins: " + " ".join(
        f"P{i}:{stats['wins_by_seat'][i]}" for i in sorted(stats['wins_by_seat'])))
    if stats["wins_by_turnpos"]:
        ordinal = ["1st", "2nd", "3rd", "4th"]
        lines.append(f"  turn-order wins: " + " ".join(
            f"{ordinal[i]}:{stats['wins_by_turnpos'][i]}" for i in sorted(stats['wins_by_turnpos'])))
    avg = lambda x: sum(x) / len(x) if x else 0
    lines.append(f"  avg rounds: {avg(stats['rounds']):.1f}   unfinished: {stats['unfinished']}")
    lines.append(f"  battles/game: {avg(stats['battles']):.2f}   trades/game: {avg(stats['trades']):.2f}   bakeoffs: {stats['bakeoffs']}")
    aw, ab = stats["attacker_winrate"]
    lines.append(f"  attacker battle win rate: {aw / ab * 100:.1f}% ({ab} battles)" if ab else "  no battles")
    if ab:
        lines.append(f"  broke-loser spoils (nothing worth 5): {stats['bankrupt_spoils'] / ab * 100:.1f}% of battles")
    if stats["luck_games"]:
        lines.append(f"  winner-was-luckiest-flipper: {stats['luck_wins'] / stats['luck_games'] * 100:.1f}%")
    ng = len(stats["rounds"]) or 1
    fa, fh = stats["fish"]
    bt, tt = stats["broke"]
    lines.append(f"  fishing: {fa / ng:.1f} casts/game ({fh / (fa or 1) * 100:.0f}% catch)   "
                 f"broke-at-turn-start: {bt / (tt or 1) * 100:.1f}% of turns")
    lines.append(f"  wind-vs-island events/game: dodge {stats['dodge'] / ng:.2f}, "
                 f"anchor {stats['anchor'] / ng:.2f}, aground {stats['aground'] / ng:.2f}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "baseline"
    mix = ["rusher", "pirate", "trader", "balanced"]
    if mode == "baseline":
        for coins in (3, 5):
            rules = Rules(start_coins=coins)
            print(report(f"BASELINE start_coins={coins}, mixed strategies",
                         tournament(mix, rules, 1500)))
            print()
    elif mode == "mirror":
        rules = Rules()
        for s in ["rusher", "pirate", "trader", "balanced"]:
            print(report(f"MIRROR all-{s}", tournament([s] * 4, rules, 800)))
            print()
    elif mode == "variants":
        variants = {
            "A attacker_wins_hh": Rules(attacker_wins_hh=True),
            "B battle_reflip": Rules(battle_reflip=True),
            "C scarcity=3": Rules(scarcity_tokens=3),
            "D trade_bonus": Rules(trade_bonus=True),
            "E dock_buy": Rules(dock_buy=True),
            "F cargo_risk": Rules(cargo_risk=True),
            "COMBO A+C+D+E": Rules(attacker_wins_hh=True, scarcity_tokens=3,
                                   trade_bonus=True, dock_buy=True),
            "COMBO A+B+C+D+E+F": Rules(attacker_wins_hh=True, battle_reflip=True,
                                       scarcity_tokens=3, trade_bonus=True,
                                       dock_buy=True, cargo_risk=True),
        }
        for name, rules in variants.items():
            print(report(f"VARIANT {name}", tournament(mix, rules, 1500)))
            print()
    elif mode == "variants2":
        variants = {
            "G asym_spoils": Rules(asym_spoils=True),
            "H attack_cost=2": Rules(attack_cost=2),
            "I attacker_free_reflip": Rules(attacker_free_reflip=True),
            "M merchant_cargo+scarcity+trade_bonus": Rules(merchant_cargo=True, scarcity_tokens=3, trade_bonus=True),
            "REC G+H1+I+B+C3+E+M+D": Rules(asym_spoils=True, attack_cost=1,
                                           attacker_free_reflip=True, battle_reflip=True,
                                           scarcity_tokens=3, dock_buy=True,
                                           merchant_cargo=True, trade_bonus=True),
            "REC-lite G+I+C3+E+M+D": Rules(asym_spoils=True, attacker_free_reflip=True,
                                           scarcity_tokens=3, dock_buy=True,
                                           merchant_cargo=True, trade_bonus=True),
        }
        for name, rules in variants.items():
            print(report(f"VARIANT {name}", tournament(mix, rules, 1500)))
            print()
        # mirror check of recommended set: seat fairness + luck
        rec = Rules(asym_spoils=True, attack_cost=1, attacker_free_reflip=True,
                    battle_reflip=True, scarcity_tokens=3, dock_buy=True,
                    merchant_cargo=True, trade_bonus=True)
        for s in ["balanced", "pirate"]:
            print(report(f"REC mirror all-{s}", tournament([s] * 4, rec, 800)))
            print()
    elif mode == "final":
        FINAL = dict(asym_spoils=True, attack_cost=2, attacker_free_reflip=True,
                     scarcity_tokens=3, dock_buy=True, merchant_cargo=True,
                     trade_bonus=True, global_trade=True, rotate_order=True)
        rules = Rules(**FINAL)
        print(report("FINAL mixed", tournament(mix, rules, 2000)))
        print()
        for s in ["rusher", "pirate", "trader", "balanced"]:
            print(report(f"FINAL mirror all-{s}", tournament([s] * 4, rules, 600)))
            print()
        # sensitivity: drop each module
        for drop in FINAL:
            cfg = dict(FINAL)
            cfg[drop] = False if isinstance(cfg[drop], bool) else 0
            print(report(f"FINAL minus {drop}", tournament(mix, Rules(**cfg), 1000)))
            print()
    elif mode == "final2":
        # candidate recommended set WITHOUT asym spoils (tighter strategy balance)
        F2 = dict(attack_cost=2, attacker_free_reflip=True,
                  scarcity_tokens=3, dock_buy=True, merchant_cargo=True,
                  trade_bonus=True, global_trade=True, rotate_order=True)
        print(report("FINAL2 mixed (no asym spoils)", tournament(mix, Rules(**F2), 2000)))
        print()
        print(report("FINAL2+G mixed (asym spoils on)",
                     tournament(mix, Rules(asym_spoils=True, **F2), 2000)))
        print()
        print(report("FINAL2 mirror all-pirate", tournament(["pirate"] * 4, Rules(**F2), 800)))
        print()
        print(report("FINAL2 mirror all-rusher", tournament(["rusher"] * 4, Rules(**F2), 800)))
        print()
    elif mode == "followup":
        F2 = dict(attack_cost=2, scarcity_tokens=3, dock_buy=True, merchant_cargo=True,
                  trade_bonus=True, global_trade=True, rotate_order=True)
        print(report("FREE broadside (rec)", tournament(mix, Rules(attacker_free_reflip=True, **F2), 1500)))
        print()
        print(report("PAID broadside (1 coin)", tournament(mix, Rules(paid_broadside=True, **F2), 1500)))
        print()
        print(report("PAID broadside + loser pays coins first",
                     tournament(mix, Rules(paid_broadside=True, loser_protects=True, **F2), 1500)))
        print()
        print(report("FREE broadside + loser pays coins first",
                     tournament(mix, Rules(attacker_free_reflip=True, loser_protects=True, **F2), 1500)))
        print()
    elif mode == "scaling":
        base = dict(attack_cost=2, attacker_free_reflip=True, dock_buy=True,
                    merchant_cargo=True, trade_bonus=True, global_trade=True, rotate_order=True)
        mixes = {2: ["pirate", "balanced"], 3: ["pirate", "balanced", "trader"], 4: mix}
        for np_, m in mixes.items():
            for tok in sorted({max(1, np_ - 1), np_, 3}):
                rules = Rules(scarcity_tokens=tok, **base)
                print(report(f"{np_} players, {tok} crates/island", tournament(m, rules, 1200)))
                print()
    elif mode == "dimensions":
        REC = dict(attack_cost=2, attacker_free_reflip=True, scarcity_tokens=3,
                   dock_buy=True, merchant_cargo=True, trade_bonus=True, rotate_order=True,
                   global_trade=True)
        print("--- board size sweep (5 ingredients, recipe 4) ---")
        for g in (9, 11, 13, 15):
            print(report(f"grid {g}x{g}", tournament(mix, Rules(grid=g, **REC), 1200)))
            print()
        print("--- ingredient count sweep (11x11, recipe 4) ---")
        for ni in (5, 6, 7):
            print(report(f"{ni} ingredients", tournament(mix, Rules(n_ingredients=ni, **REC), 1200)))
            print()
        print("--- recipe size sweep (11x11, 5 ingredients) ---")
        for rs in (3, 4, 5):
            print(report(f"recipe {rs}", tournament(mix, Rules(recipe_size=rs, **REC), 1200)))
            print()
        print("--- combos: bigger world ---")
        for g, ni, rs in ((13, 6, 4), (13, 6, 5), (13, 7, 5), (15, 7, 5)):
            print(report(f"grid {g}, {ni} ing, recipe {rs}",
                         tournament(mix, Rules(grid=g, n_ingredients=ni, recipe_size=rs, **REC), 1200)))
            print()
    elif mode == "turnorder":
        # matches the live app's shipped config (index.html roundCfg): 15x15, 7 ingredients,
        # recipe of 5, 2x2 islands, single dock, powder 2, paid broadside, dock-buy, merchant,
        # trade bonus, global trade (parley), no asym spoils, 10% storm.
        LIVE = dict(grid=15, n_ingredients=7, recipe_size=5, island_w=2, island_h=2,
                    single_dock=True, scarcity_tokens=3, attack_cost=2, paid_broadside=True,
                    dock_buy=True, merchant_cargo=True, trade_bonus=True, global_trade=True,
                    storm_prob=0.10)
        print(report("CURRENT (rotate every round, fixed seat-0 start)",
                     tournament(mix, Rules(rotate_order=True, **LIVE), 3000)))
        print()
        print(report("NO-ROTATE, no randomization (seat 0 always leads all game — the naive removal)",
                     tournament(mix, Rules(**LIVE), 3000)))
        print()
        print(report("PROPOSED (no rotation, random start seat, fixed all game)",
                     tournament(mix, Rules(random_start_order=True, **LIVE), 3000)))
        print()
    elif mode == "staggeredcoins":
        # does giving the Nth-to-act player N-1 bonus starting coins (3/4/5/6) overcorrect and
        # make going LAST the better seat, instead of just leveling the first-turn edge?
        LIVE = dict(grid=15, n_ingredients=7, recipe_size=5, island_w=2, island_h=2,
                    single_dock=True, scarcity_tokens=3, attack_cost=2, paid_broadside=True,
                    dock_buy=True, merchant_cargo=True, trade_bonus=True, global_trade=True,
                    storm_prob=0.10, random_start_order=True)
        print(report("NO STAGGER (random start order, everyone starts with 3 coins)",
                     tournament(mix, Rules(**LIVE), 4000)))
        print()
        print(report("STAGGERED COINS (1st:3 2nd:4 3rd:5 4th:6)",
                     tournament(mix, Rules(staggered_start_coins=True, **LIVE), 4000)))
        print()
        # mirror check: same strategy in every seat isolates the turn-order/coin effect from
        # any strategy-vs-strategy interaction
        for s in ["balanced", "pirate", "rusher", "trader"]:
            print(report(f"STAGGERED mirror all-{s}",
                         tournament([s] * 4, Rules(staggered_start_coins=True, **LIVE), 1500)))
            print()
