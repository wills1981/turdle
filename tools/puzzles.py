#!/usr/bin/env python3
"""Check and generate Turdle's daily puzzles (puzzles.txt).

  python3 tools/puzzles.py check
  python3 tools/puzzles.py generate --from 2027-01-01 --to 2027-03-31 [--seed N] [--append]

Routes are found the same way the game does (findRoute in js/app.js): through the
everyday words in dictionaries/common-N.txt, plus the puzzle's own start and target.
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
MIN_PAR = 4
MAX_PAR = {3: 5, 4: 6, 5: 6, 6: 6}
MIN_ROUTES = 2           # distinct shortest routes, so one wrong turn isn't fatal
MAX_WORD_USES = 2        # times a word may appear as start/target in the file
PAR_WEIGHTS = {4: 3, 5: 3, 6: 1}  # generator favours mid-length ladders
# ---------------------------------------------------------------------------

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


def fairness_problems(start, target, result):
    n = len(start)
    problems = []
    if result is None:
        return ["no route through common words"]
    par, routes, _ = result
    if not MIN_PAR <= par <= MAX_PAR[n]:
        problems.append(f"par {par} outside {MIN_PAR}-{MAX_PAR[n]}")
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
        problems += fairness_problems(start, target, result)
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


def fair_pairs():
    """All (start, target) silly pairs that pass the fairness rules, per length."""
    out = {}
    for n, silly in silly_words().items():
        out[n] = []
        common = words("common", n)
        for s in silly:
            dist, ways, _ = explore(s, common | set(silly))
            for t in silly:
                if t > s and t in dist and MIN_PAR <= dist[t] <= MAX_PAR[n] and ways[t] >= MIN_ROUTES:
                    # confirm with the exact pool the game uses (start/target only, not all silly words)
                    r = analyse(s, t)
                    if not fairness_problems(s, t, r):
                        out[n].append((s, t, r[0]))
    return out


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
            options = [(s, t, par) for s, t, par in pairs_by_len[n]
                       if frozenset((s, t)) not in used_pairs and uses[s] < MAX_WORD_USES and uses[t] < MAX_WORD_USES]
            if options:
                s, t, _ = rng.choices(options, weights=[PAR_WEIGHTS.get(o[2], 1) for o in options])[0]
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
