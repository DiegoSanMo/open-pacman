# AGENTS.md

Vanilla-JS Pac-Man on a `<canvas>`. Intentionally no build system, package manager, tests, lint, or CI — do not invent npm scripts or add tooling unless asked.

## Run & verify

- Serve the app from `src/`, because all asset paths are relative to it:
  `python3 -m http.server 8000 --directory src` → http://localhost:8000
- No automated tests exist. Verify changes manually in the browser.
- Only syntax check available: `node --check src/js/*.js`

## Architecture

- Entry point: `src/index.html`. It loads four **classic scripts** (no ES modules, no bundler) in dependency order: `maze.js` → `game.js` → `render.js` → `main.js`. New files must be added here in the same order, after their dependencies.
- Modules communicate only through `window` globals exported at the end of each file:
  - `maze.js`: `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`
  - `game.js`: `createGame`, `update`, `DIRS`
  - `render.js`: `draw`
  - `main.js`: DOM wiring, input, and the `requestAnimationFrame` loop (no exports)
- All four files share one global lexical scope. Top-level `const`/`let` names must be unique across every file (duplicating `TILE`, `canvas`, etc. is a `SyntaxError`).

## Game-model gotchas

- Grid is 28×31 cells, `TILE = 20` → canvas is 560×620. That size is hardcoded in three places: `#game` attributes in `index.html`, `#game-wrap` in `style.css`, and `TILE` in `render.js`; change them together.
- Tile codes: `0` empty/walkable, `1` wall, `2` dot, `3` pen door. Pac-Man is blocked by `1` and `3`; ghosts only by `1`, which is how they leave the pen.
- Row `TUNNEL_ROW` (14) wraps horizontally at both edges.
- Movement is in fractional cells per animation frame, not delta-time. Direction changes and dot eating only happen on aligned cells (`aligned()` uses a `1e-3` tolerance). `PACMAN_SPEED = 0.125` (8 frames/cell) and `GHOST_SPEED = 0.1` (10 frames/cell) rely on being exact reciprocals; keep speeds as `1/n` and do not add delta-time without reworking the alignment logic in `movePacman`/`moveGhost`.
- `MAZE` is pristine and must never be mutated. Each game gets a copy in `game.grid`; update and render must read `game.grid`, or eaten dots reappear.
- `createGame` clears the dot under Pac-Man's start cell and counts remaining dots from the copied grid.

## Conventions

- Comments, UI text, README, and specs are written in **Spanish**. Keep new text in Spanish.
- This repo exists to practice spec-driven development. Large features should go through the `spec` skill (`.agents/skills/spec/SKILL.md`, tracked in `skills-lock.json`) and be saved to `specs/NN-slug.md` before implementation. `specs/` does not exist yet, so the first spec is `01-`.
