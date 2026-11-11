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
