# 💩 Turdle - Daily Word Shift Puzzle

A client-side daily Word Ladder puzzle web app powered by open-source dictionaries and dynamic pathfinding algorithms (BFS).

## 🐳 Run Locally with Docker

```bash
docker compose up --build
```

Then open http://localhost:8080. Source files are mounted into the container, so edits to `index.html`, `puzzles.txt`, `css/`, `js/` or `dictionaries/` show up on a browser refresh. Stop with `Ctrl+C` (or `docker compose down`).

Without Compose:

```bash
docker build -t turdle .
docker run --rm -p 8080:80 turdle
```

## 📖 Dictionaries

Word lists come from [SCOWL](http://wordlist.aspell.net/) (British English, including Oxford `-ize` spellings), licensed as described in [dictionaries/LICENSE-SCOWL.txt](dictionaries/LICENSE-SCOWL.txt).

- `dictionaries/dictionary-N.txt`: every word accepted as a guess (SCOWL size ≤ 60).
- `dictionaries/common-N.txt`: everyday words (SCOWL size ≤ 35) used for Par, hints, Give Up and free-play puzzles.
- Words in [tools/blocklist.txt](tools/blocklist.txt) are excluded from both lists.

Puzzle start and target words don't need to be in either list. The solver routes through common words first and falls back to the full list.

To regenerate the lists and check every puzzle in `puzzles.txt` has a route:

```bash
python3 tools/build_dictionaries.py
```
