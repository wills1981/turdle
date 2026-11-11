#!/usr/bin/env python3
"""Build Turdle's word lists from SCOWL (British English).

Outputs, for each word length in LENGTHS:
  dictionaries/dictionary-N.txt  broad list of accepted guesses (SCOWL size <= VALID_MAX)
  dictionaries/common-N.txt      everyday words used for Par, hints, Give Up and
                                 free-play puzzles (SCOWL size <= COMMON_MAX)
Both lists exclude tools/blocklist.txt.

Usage:
  python3 tools/build_dictionaries.py                 # downloads the pinned SCOWL release
  python3 tools/build_dictionaries.py --scowl-dir DIR # use an already-extracted scowl-2020.12.07
"""
import argparse
import hashlib
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

SCOWL_VERSION = "2020.12.07"
SCOWL_URL = f"https://downloads.sourceforge.net/wordlist/scowl-{SCOWL_VERSION}.tar.gz"
SCOWL_SHA256 = "5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc"

LENGTHS = (3, 4, 5, 6)
VALID_MAX = 60   # SCOWL's recommended "large spellchecker" size; real words, few oddities
COMMON_MAX = 35  # everyday vocabulary
SIZES = (10, 20, 35, 40, 50, 55, 60, 70, 80, 95)

# british = -ise spellings, british_z = Oxford -ize spellings
VALID_CATEGORIES = ("english-words", "british-words", "british_z-words")
COMMON_CATEGORIES = ("english-words", "british-words")

ROOT = Path(__file__).resolve().parent.parent
DICT_DIR = ROOT / "dictionaries"
BLOCKLIST = Path(__file__).resolve().parent / "blocklist.txt"
WORD_RE = re.compile(r"^[a-z]+$")


def fetch_scowl(dest: Path) -> Path:
    archive = dest / "scowl.tar.gz"
    print(f"Downloading {SCOWL_URL}")
    with urllib.request.urlopen(SCOWL_URL) as r, open(archive, "wb") as f:
        shutil.copyfileobj(r, f)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != SCOWL_SHA256:
        sys.exit(f"SHA-256 mismatch for SCOWL archive: {digest}")
    with tarfile.open(archive) as tar:
        tar.extractall(dest, filter="data")
    return dest / f"scowl-{SCOWL_VERSION}"


def read_words(final_dir: Path, categories, max_size):
    words = set()
    for cat in categories:
        for size in SIZES:
            if size > max_size:
                continue
            path = final_dir / f"{cat}.{size}"
            if not path.exists():
                continue
            for line in path.read_text(encoding="latin-1").splitlines():
                w = line.strip()
                if WORD_RE.match(w) and len(w) in LENGTHS:
                    words.add(w.upper())
    return words


def load_blocklist():
    if not BLOCKLIST.exists():
        return set()
    return {
        l.strip().upper()
        for l in BLOCKLIST.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scowl-dir", type=Path, help="extracted scowl-2020.12.07 directory")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        scowl = args.scowl_dir or fetch_scowl(Path(tmp))
        final_dir = scowl / "final"
        blocked = load_blocklist()
        valid_all = read_words(final_dir, VALID_CATEGORIES, VALID_MAX) - blocked
        common_all = read_words(final_dir, COMMON_CATEGORIES, COMMON_MAX) - blocked
        shutil.copyfile(scowl / "Copyright", DICT_DIR / "LICENSE-SCOWL.txt")

    valid_all |= common_all
    valid, common = {}, {}
    print(f"{'len':>3} {'valid':>7} {'common':>7}")
    for n in LENGTHS:
        valid[n] = sorted(w for w in valid_all if len(w) == n)
        common[n] = sorted(w for w in common_all if len(w) == n)
        (DICT_DIR / f"dictionary-{n}.txt").write_text("\n".join(valid[n]) + "\n", encoding="utf-8")
        (DICT_DIR / f"common-{n}.txt").write_text("\n".join(common[n]) + "\n", encoding="utf-8")
        print(f"{n:>3} {len(valid[n]):>7} {len(common[n]):>7}")

    # Re-check the daily puzzles against the new lists (rules live in tools/puzzles.py)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import puzzles
    print("\nChecking puzzles.txt:")
    sys.exit(0 if puzzles.check() else 1)


if __name__ == "__main__":
    main()
