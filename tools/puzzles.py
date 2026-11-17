#!/usr/bin/env python3
"""Check and generate Turdle's daily puzzles (puzzles.txt).

  python3 tools/puzzles.py check
  python3 tools/puzzles.py generate --from 2027-01-01 --to 2027-03-31 [--seed N] [--append]
  python3 tools/puzzles.py replace --from 2026-11-17 --lengths 3 [--seed N]

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

# --- Fairness rules (mirrored in gen-puz/index.html: keep in sync) --------
LENGTHS = (3, 4, 5, 6, 7)            # lengths check accepts (3s are in the past schedule)
# lengths the generator picks, with weights (6s now and then). No 7s: with no shared positions they need
# par 7+ and no fair pairs exist. To bring them back, add 7 here plus e.g. MIN_GAP_DAYS {7: 21}, DUE_DAYS {7: 35}.
GEN_LENGTHS = {4: 10, 5: 10, 6: 3}
MIN_GAP_DAYS = {}        # length -> min days between puzzles of that length
DUE_DAYS = {}            # length -> pick it first once this many days have passed
KEEP_DAYS = {"12-25", "12-26", "01-01"}  # hand-picked themed days (MM-DD) that replace never touches
MIN_PAR = {3: 5, 4: 5, 5: 5, 6: 5, 7: 5}   # from HARDER_FROM (before that: 4, and 5 for 3s)
MAX_PAR = {3: 6, 4: 8, 5: 8, 6: 8, 7: 8}
MIN_ROUTES = 2           # distinct shortest routes, so one wrong turn isn't fatal
MAX_WORD_USES = 2        # times a word may appear as start/target within REPEAT_DAYS
REPEAT_DAYS = 30         # repeats further apart than this are fine: players will have forgotten
                         # (check only; generate/replace still avoid repeats across the whole file)
# generator weights by par: favour mid-length ladders, but push 3-letter ones as long as possible
HARDER = {5: 2, 6: 3, 7: 2, 8: 1}  # mostly par 6, some 5s and 7s, the odd 8
PAR_WEIGHTS = {3: {5: 1, 6: 2}, 4: HARDER, 5: HARDER, 6: HARDER, 7: HARDER}
# start and target share no letter in the same position
# puzzles before this date predate this rule and the 3-letter MIN_PAR of 5 (they used 4), so are exempt
NEW_RULES_FROM = dt.date(2026, 11, 13)
# puzzles from this date are harder: par 5+ (MIN_PAR); earlier ones keep the old minimum
HARDER_FROM = dt.date(2026, 11, 18)
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


def neighbours(w, stretchy=False):
    """Words one move from w: change a letter; stretchy puzzles may also add or drop one
    (staying within LENGTHS). Mirrors neighbours() in js/app.js and gen-puz/index.html."""
    out = {w[:i] + c + w[i + 1:] for i in range(len(w)) for c in ALPHABET if c != w[i]}
    if stretchy:
        if len(w) < max(LENGTHS):
            out |= {w[:i] + c + w[i:] for i in range(len(w) + 1) for c in ALPHABET}
        if len(w) > min(LENGTHS):
            out |= {w[:i] + w[i + 1:] for i in range(len(w))}
    return out


def explore(start, pool, stretchy=False):
    """BFS from start through pool. Returns (dist, ways, parent) maps."""
    dist, ways, parent = {start: 0}, {start: 1}, {start: None}
    q = deque([start])
    while q:
        cur = q.popleft()
        for nxt in neighbours(cur, stretchy):
            if nxt not in pool:
                continue
            if nxt not in dist:
                dist[nxt], ways[nxt], parent[nxt] = dist[cur] + 1, ways[cur], cur
                q.append(nxt)
            elif dist[nxt] == dist[cur] + 1:
                ways[nxt] += ways[cur]
    return dist, ways, parent


def is_stretchy(start, target):
    """Different lengths: each turn may change, add or drop one letter (hand-picked special days)."""
    return len(start) != len(target)


def stretchy_pool():
    return set().union(*(words("common", n) for n in LENGTHS))


def analyse(start, target):
    """(par, number of shortest routes, one route) through common words, or None."""
    if is_stretchy(start, target):
        dist, ways, parent = explore(start, stretchy_pool() | {start, target}, stretchy=True)
    else:
        dist, ways, parent = explore(start, words("common", len(start)) | {start, target})
    if target not in dist:
        return None
    path = [target]
    while parent[path[-1]]:
        path.append(parent[path[-1]])
    return dist[target], ways[target], path[::-1]


def fairness_problems(start, target, result, date=None):
    n = max(len(start), len(target))
    problems = []
    new_rules = date is None or date >= NEW_RULES_FROM
    if new_rules and not is_stretchy(start, target):  # positions don't line up across lengths
        shared = shared_positions(start, target)
        if shared:
            problems.append(f"shares a letter in position {', '.join(map(str, shared))}")
    if result is None:
        return problems + ["no route through common words"]
    par, routes, _ = result
    min_par = (MIN_PAR[n] if date is None or date >= HARDER_FROM else 5 if n == 3 else 4) if new_rules else 4
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
    errors, prev, recent = [], None, deque()  # recent: (date, start, target) within REPEAT_DAYS
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
        if len(start) not in LENGTHS or len(target) not in LENGTHS:
            errors.append(f"{where}: words must be 3-7 letters")
            continue
        # Words outside the dictionary are allowed (e.g. names for fun): the game accepts the day's own
        # start and target. They're flagged in the listing so typos still stand out.
        notes = [f"{w} not in dictionary (name? check spelling)" for w in (start, target) if w not in words("dictionary", len(w))]
        problems += [f"{w} is blocklisted" for w in (start, target) if w in blocked]
        while recent and (date - recent[0][0]).days >= REPEAT_DAYS:
            recent.popleft()
        if any(frozenset((s, t)) == frozenset((start, target)) for _, s, t in recent):
            problems.append(f"pair already used within {REPEAT_DAYS} days")
        for w in {start, target}:
            count = sum((s, t).count(w) for _, s, t in recent) + (start, target).count(w)
            if count > MAX_WORD_USES:
                problems.append(f"{w} used {count} times within {REPEAT_DAYS} days (max {MAX_WORD_USES})")
        recent.append((date, start, target))
        result = analyse(start, target)
        problems += fairness_problems(start, target, result, date)
        if result:
            pars[result[0]] += 1
        if verbose:
            desc = f"par {result[0]}, {result[1]} routes  {' > '.join(result[2])}" if result else "NO ROUTE"
            if is_stretchy(start, target):
                desc = "(stretchy) " + desc
            print(f"  {date} {start:>6} -> {target:<6} {desc}{'  !! ' + '; '.join(problems) if problems else ''}"
                  f"{'  (' + '; '.join(notes) + ')' if notes else ''}")
        errors += [f"{where} ({date} {start}->{target}): {p}" for p in problems]
    if verbose:
        print(f"\n{sum(pars.values())} puzzles, pars {dict(sorted(pars.items()))}")
        print("\n".join(["\nPROBLEMS:"] + errors) if errors else "All puzzles pass the fairness rules.")
    return not errors


def silly_words():
    text = "\n".join(l for l in SILLY_WORDS.read_text(encoding="utf-8").splitlines() if not l.startswith("#"))
    blocked = blocklist()
    return {n: sorted(w for w in set(text.upper().split())
                      if len(w) == n and w in words("dictionary", n) and w not in blocked)
            for n in GEN_LENGTHS}


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


def length_order(rng):
    """Generator lengths in a weighted random order: the first is the pick, the rest are fallbacks."""
    pool, order = dict(GEN_LENGTHS), []
    while pool:
        n = rng.choices(list(pool), weights=list(pool.values()))[0]
        order.append(n)
        del pool[n]
    return order


def pick_pair(rng, pairs_by_len, uses, used_pairs, day=None, last_seen=None):
    """A fresh fair (start, target), or None if every pair is used up. Lengths seen within
    MIN_GAP_DAYS of day (last_seen: length -> date) are skipped."""
    order = length_order(rng)
    if day and last_seen:
        due = [n for n in DUE_DAYS if (day - last_seen.get(n, day)).days >= DUE_DAYS[n]]
        order = due + [n for n in order if n not in due]
    for n in order:
        if day and last_seen and n in MIN_GAP_DAYS and n in last_seen \
                and abs((day - last_seen[n]).days) < MIN_GAP_DAYS[n]:
            continue
        options = [o for o in pairs_by_len[n]
                   if frozenset(o[:2]) not in used_pairs and uses[o[0]] < MAX_WORD_USES and uses[o[1]] < MAX_WORD_USES]
        if options:
            weights = [PAR_WEIGHTS[n].get(par, 1) * (SILLY_PAIR_WEIGHT if both else 1)
                       for _, _, par, both in options]
            s, t, _, _ = rng.choices(options, weights=weights)[0]
            return (t, s) if rng.random() < 0.5 else (s, t)
    return None


def replace(from_date, lengths, seed=None):
    """Swap every puzzle on/after from_date whose length is in lengths for a fresh pair;
    every other line keeps its date and words."""
    rng = random.Random(seed)
    pairs_by_len = fair_pairs()
    entries = [tuple(e[1:]) for e in parse()]
    uses = Counter(w for _, s, t in entries for w in (s, t))
    used_pairs = {frozenset((s, t)) for _, s, t in entries}
    out, changed = [], 0
    last_seen = {n: from_date - dt.timedelta(days=DUE_DAYS[n] - 14) for n in DUE_DAYS}  # first one ~2 weeks in
    for d, s, t in entries:
        day = dt.date.fromisoformat(d)
        # stretchy days are hand-picked, like KEEP_DAYS, so replace leaves them alone
        if day >= from_date and len(s) in lengths and len(t) == len(s) and d[5:] not in KEEP_DAYS:
            uses.subtract((s, t))  # freed up (the old pair stays in used_pairs, so it isn't reused)
            pair = pick_pair(rng, pairs_by_len, uses, used_pairs, day, last_seen)
            if not pair:
                sys.exit(f"Ran out of fair silly pairs at {d}; add words to {SILLY_WORDS.name}")
            s, t = pair
            uses.update(pair)
            used_pairs.add(frozenset(pair))
            changed += 1
        last_seen[len(s)] = day
        out.append((d, s, t))
    return out, changed


def generate(start_date, end_date, seed=None, existing=()):
    rng = random.Random(seed)
    pairs_by_len = fair_pairs()
    uses = Counter(w for _, s, t in existing for w in (s, t))
    used_pairs = {frozenset((s, t)) for _, s, t in existing}
    last_seen = {n: start_date - dt.timedelta(days=DUE_DAYS[n] - 14) for n in DUE_DAYS}
    last_seen.update({len(s): dt.date.fromisoformat(d) for d, s, _ in existing})
    out, day = [], start_date
    while day <= end_date:
        pair = pick_pair(rng, pairs_by_len, uses, used_pairs, day, last_seen)
        if not pair:
            sys.exit(f"Ran out of fair silly pairs at {day}; add words to {SILLY_WORDS.name}")
        uses.update(pair)
        used_pairs.add(frozenset(pair))
        out.append((day.isoformat(), *pair))
        last_seen[len(pair[0])] = day
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
    r = sub.add_parser("replace", help="swap puzzles of some lengths for fresh ones from a date on")
    r.add_argument("--from", dest="start", required=True, type=dt.date.fromisoformat)
    r.add_argument("--lengths", required=True, type=lambda v: {int(x) for x in v.split(",")},
                   help="comma-separated word lengths to replace, e.g. 3")
    r.add_argument("--seed", type=int)
    args = ap.parse_args()

    if args.cmd == "check":
        sys.exit(0 if check() else 1)
    if args.cmd == "replace":
        if args.start <= dt.date.today():
            sys.exit("--from must be after today: never change today's or past puzzles")
        entries, changed = replace(args.start, args.lengths, args.seed)
        PUZZLES.write_text("\n".join([HEADER] + [f"{d}|{s}|{t}" for d, s, t in entries]) + "\n", encoding="utf-8")
        print(f"Replaced {changed} puzzles in {PUZZLES.name}\n")
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
