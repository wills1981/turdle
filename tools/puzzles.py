#!/usr/bin/env python3
"""Check and generate Turdle's daily puzzles (puzzles.txt).

  python3 tools/puzzles.py check
  python3 tools/puzzles.py generate --from 2027-01-01 --to 2027-03-31 [--seed N] [--append]

Routes are found the same way the game does (findRoute in js/app.js): through the
everyday words in dictionaries/common-N.txt, plus the puzzle's own start and target.
Generated puzzles have at least one word from tools/silly_words.txt; the other is silly or an everyday word.
The fairness rules below are the single source of truth; see CLAUDE.md.
"""
import argparse
import datetime as dt
import random
import sys
from collections import Counter, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_DIR = ROOT / "dictionaries"
PUZZLES = ROOT / "puzzles.txt"
SILLY_WORDS = Path(__file__).resolve().parent / "silly_words.txt"
BLOCKLIST = Path(__file__).resolve().parent / "blocklist.txt"
HEADER = "# Date (YYYY-MM-DD) | Start Word | Target Word"

# --- Fairness rules -------------------------------------------------------
LENGTHS = (3, 4, 5, 6)
MIN_PAR = {3: 5, 4: 4, 5: 4, 6: 4}   # 3-letter puzzles are short, so make them work harder
MAX_PAR = {3: 6, 4: 6, 5: 6, 6: 6}
MIN_ROUTES = 2           # distinct shortest routes, so one wrong turn isn't fatal
MAX_WORD_USES = 2        # times a word may appear as start/target in the file
# generator weights by par: favour mid-length ladders, but push 3-letter ones as long as possible
PAR_WEIGHTS = {3: {5: 1, 6: 2}, 4: {4: 3, 5: 3, 6: 1}, 5: {4: 3, 5: 3, 6: 1}, 6: {4: 3, 5: 3, 6: 1}}
# start and target share no letter in the same position
# puzzles before this date predate this rule and the 3-letter MIN_PAR of 5 (they used 4), so are exempt
NEW_RULES_FROM = dt.date(2026, 11, 13)
# ---------------------------------------------------------------------------


def shared_positions(start, target):
    return [i + 1 for i, (a, b) in enumerate(zip(start, target)) if a == b]


ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_cache = {}


def words(kind, n):
    key = (kind, n)
    if key not in _cache:
        path = DICT_DIR / f"{kind}-{n}.txt"
        _cache[key] = set(path.read_text(encoding="utf-8").split()) if path.exists() else set()
    return _cache[key]


def blocklist():
    if not BLOCKLIST.exists():
        return set()
    return {l.strip().upper() for l in BLOCKLIST.read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.startswith("#")}


def explore(start, pool):
    """BFS from start through pool. Returns (dist, ways, parent) maps."""
    dist, ways, parent = {start: 0}, {start: 1}, {start: None}
    q = deque([start])
    while q:
        cur = q.popleft()
        for i in range(len(cur)):
            for c in ALPHABET:
                nxt = cur[:i] + c + cur[i + 1:]
                if nxt == cur or nxt not in pool:
                    continue
                if nxt not in dist:
                    dist[nxt], ways[nxt], parent[nxt] = dist[cur] + 1, ways[cur], cur
                    q.append(nxt)
                elif dist[nxt] == dist[cur] + 1:
                    ways[nxt] += ways[cur]
    return dist, ways, parent


def analyse(start, target):
    """(par, number of shortest routes, one route) through common words, or None."""
    n = len(start)
    dist, ways, parent = explore(start, words("common", n) | {start, target})
    if target not in dist:
        return None
    path = [target]
    while parent[path[-1]]:
        path.append(parent[path[-1]])
    return dist[target], ways[target], path[::-1]


def fairness_problems(start, target, result, date=None):
    n = len(start)
    problems = []
    new_rules = date is None or date >= NEW_RULES_FROM
    if new_rules:
        shared = shared_positions(start, target)
        if shared:
            problems.append(f"shares a letter in position {', '.join(map(str, shared))}")
    if result is None:
        return problems + ["no route through common words"]
    par, routes, _ = result
    min_par = MIN_PAR[n] if new_rules else 4
    if not min_par <= par <= MAX_PAR[n]:
        problems.append(f"par {par} outside {min_par}-{MAX_PAR[n]}")
    if routes < MIN_ROUTES:
        problems.append(f"only {routes} shortest route (need {MIN_ROUTES}+)")
    return problems


def parse(path=PUZZLES):
    entries = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        entries.append((lineno, *[p.strip() for p in line.split("|")]))
    return entries


def check(path=PUZZLES, verbose=True):
    """Validate puzzles.txt against every rule. Returns True if it passes."""
    errors, uses, pairs, prev = [], Counter(), set(), None
    blocked = blocklist()
    pars = Counter()
    for lineno, *fields in parse(path):
        where = f"line {lineno}"
        if len(fields) != 3:
            errors.append(f"{where}: expected DATE|START|TARGET")
            continue
        date_s, start, target = fields
        try:
            date = dt.date.fromisoformat(date_s)
        except ValueError:
            errors.append(f"{where}: bad date {date_s!r}")
            continue
        if prev and date != prev + dt.timedelta(days=1):
            errors.append(f"{where}: {date} does not follow {prev} (dates must be consecutive)")
        prev = date
        problems = []
        if start != start.upper() or target != target.upper():
            problems.append("words must be uppercase")
        start, target = start.upper(), target.upper()
        n = len(start)
        if len(target) != n or n not in LENGTHS:
            errors.append(f"{where}: words must be the same length, 3-6 letters")
            continue
        problems += [f"{w} is not in dictionary-{n}.txt" for w in (start, target) if w not in words("dictionary", n)]
        problems += [f"{w} is blocklisted" for w in (start, target) if w in blocked]
        if frozenset((start, target)) in pairs:
            problems.append("pair already used")
        pairs.add(frozenset((start, target)))
        uses.update((start, target))
        result = analyse(start, target)
        problems += fairness_problems(start, target, result, date)
        if result:
            pars[result[0]] += 1
        if verbose:
            desc = f"par {result[0]}, {result[1]} routes  {' > '.join(result[2])}" if result else "NO ROUTE"
            print(f"  {date} {start:>6} -> {target:<6} {desc}{'  !! ' + '; '.join(problems) if problems else ''}")
        errors += [f"{where} ({date} {start}->{target}): {p}" for p in problems]
    errors += [f"{w} used {c} times (max {MAX_WORD_USES})" for w, c in uses.items() if c > MAX_WORD_USES]
    if verbose:
        print(f"\n{sum(pars.values())} puzzles, pars {dict(sorted(pars.items()))}")
        print("\n".join(["\nPROBLEMS:"] + errors) if errors else "All puzzles pass the fairness rules.")
    return not errors


def silly_words():
    text = "\n".join(l for l in SILLY_WORDS.read_text(encoding="utf-8").splitlines() if not l.startswith("#"))
    blocked = blocklist()
    return {n: sorted(w for w in set(text.upper().split())
                      if len(w) == n and w in words("dictionary", n) and w not in blocked)
            for n in LENGTHS}


# Everyday words that make a flat start/target: function words, and past tenses (RARED, HALED)
DULL_PLAIN_WORDS = set("""
ADO AGO ALL AND ANY ARE ATE AYE BUT CAN DID DUE EGO ERA FOR FRO GOT HAD HAS HER HIM HIS HOW ILL INN
ION ITS LET MAY NOR NOT NOW OFF OUR OUT OWE OWN PER SHE THE TOO TWO USE VIA WAS WHO WHY YES YET YOU
ALSO BEEN FROM HAVE INTO JUST ONLY SOME THAN THAT THEM THEN THEY THIS UPON WERE WHAT WHEN WITH YOUR
ABOUT AFTER THEIR THERE THESE THOSE WHICH WHILE WOULD COULD SHALL
""".split())


def plain_word_too_dull(w):
    return w in DULL_PLAIN_WORDS or w.endswith("ED")


def fair_pairs():
    """All fair (start, target, par, both_silly) pairs per length. At least one word is silly;
    the other is another silly word or an everyday (common) word."""
    out = {}
    blocked = blocklist()
    for n, silly in silly_words().items():
        common = words("common", n)
        silly_set = set(silly)
        found = {}
        for s in silly:
            # the game's pool for s->t is common | {s, t}; a common target adds nothing to that,
            # so one BFS covers every common target, and other silly targets get an exact check
            dist, ways, _ = explore(s, common | {s})
            plain = {w for w in common if not plain_word_too_dull(w)}
            for t in (plain | silly_set) - blocked - {s}:
                key = frozenset((s, t))
                if key in found or shared_positions(s, t):
                    continue
                if t in common:
                    ok = t in dist and MIN_PAR[n] <= dist[t] <= MAX_PAR[n] and ways[t] >= MIN_ROUTES
                    par = dist.get(t)
                else:
                    r = analyse(s, t)
                    ok = not fairness_problems(s, t, r)
                    par = r[0] if r else None
                if ok:
                    found[key] = (s, t, par, t in silly_set)
        out[n] = list(found.values())
    return out


SILLY_PAIR_WEIGHT = 3  # favour pairs where both words are silly


def generate(start_date, end_date, seed=None, existing=()):
    rng = random.Random(seed)
    pairs_by_len = fair_pairs()
    uses = Counter(w for _, s, t in existing for w in (s, t))
    used_pairs = {frozenset((s, t)) for _, s, t in existing}
    out, day = [], start_date
    while day <= end_date:
        lengths = list(LENGTHS)
        rng.shuffle(lengths)
        for n in lengths:
            options = [o for o in pairs_by_len[n]
                       if frozenset(o[:2]) not in used_pairs and uses[o[0]] < MAX_WORD_USES and uses[o[1]] < MAX_WORD_USES]
            if options:
                weights = [PAR_WEIGHTS[n].get(par, 1) * (SILLY_PAIR_WEIGHT if both else 1)
                           for _, _, par, both in options]
                s, t, _, _ = rng.choices(options, weights=weights)[0]
                if rng.random() < 0.5:
                    s, t = t, s
                break
        else:
            sys.exit(f"Ran out of fair silly pairs at {day}; add words to {SILLY_WORDS.name}")
        uses.update((s, t))
        used_pairs.add(frozenset((s, t)))
        out.append((day.isoformat(), s, t))
        day += dt.timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="validate puzzles.txt")
    g = sub.add_parser("generate", help="write a new schedule")
    g.add_argument("--from", dest="start", required=True, type=dt.date.fromisoformat)
    g.add_argument("--to", dest="end", required=True, type=dt.date.fromisoformat)
    g.add_argument("--seed", type=int)
    g.add_argument("--append", action="store_true", help="add to the end of puzzles.txt instead of replacing it")
    args = ap.parse_args()

    if args.cmd == "check":
        sys.exit(0 if check() else 1)

    existing = [tuple(e[1:]) for e in parse()] if args.append and PUZZLES.exists() else []
    if existing and dt.date.fromisoformat(existing[-1][0]) + dt.timedelta(days=1) != args.start:
        sys.exit(f"--from must be the day after the last puzzle ({existing[-1][0]})")
    new = generate(args.start, args.end, args.seed, existing)
    lines = [HEADER] + [f"{d}|{s}|{t}" for d, s, t in existing + new]
    PUZZLES.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(new)} puzzles to {PUZZLES.name}\n")
    sys.exit(0 if check() else 1)


if __name__ == "__main__":
    main()
