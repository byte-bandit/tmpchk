# Backlog

One file per work item. Each is written to be picked up by a **fresh session**
with no memory of this conversation, so each states its own current-state facts,
constraints and open questions.

| # | Item | Status | Depends on |
|---|------|--------|-----------|
| [00](00-attitude.md) | Vehicle attitude model | Proposed — decision needed | — |
| [01](01-docking.md) | Realistic docking and berthing | Not started | 00 |
| [02](02-cold-start-launch.md) | Cold start, configuration and launch | Not started | 00 |
| [03](03-new-missions.md) | New missions | Awaiting examples | 01, 02 |

## Picking up an item

1. Read the item file end to end. It lists the code it touches with current
   line references — re-grep, don't trust the numbers.
2. `./tests/run.sh` before you start. Everything passes on a clean tree; if it
   does not, fix that first rather than building on a broken base.
3. Answer the item's **Open questions** with the user before writing code. They
   are there because getting them wrong means rework, not because they are
   interesting.
4. `./tests/run.sh` again before publishing. Add suites for what you built.

## How this codebase is arranged

`index.html` is the whole game — no build step, no dependencies. Roughly:

| Region | What lives there |
|--------|------------------|
| script 1 | Constants, bodies, vector maths, universal-variable Kepler propagation, orbital elements |
| script 2 | `S` (vehicle state), `derive()`, systems integration, `burnStep`, SOI patching, `advance()` |
| script 3 | Canvas scope renderer |
| script 4 | Formatters, `say()`/`row()`/`head()` message store |
| script 5 | `exec()` command interpreter and subsystem commands |
| script 6 | `PLAN` solvers: `solveBurn`, `simBurn`, `coastEncounter`, `targetEncounter`, `transferWindow` |
| script 7 | `MISSIONS`, `loadMission`, objectives |
| script 8 | CDU page framework, `PAGES`, input, fullscreen, main loop, boot |

Tests boot the real page under a DOM stub (`tests/harness.js`) or drive it in
Chromium (`tests/browser/`).

## Constraints that apply to every item

- **The simulation is planar.** All orbits share a plane. There is no
  inclination, no plane change, and no out-of-plane state anywhere.
- **Phone first.** 375×667 is the small case that must still work. The CDU gets
  six-ish rows; anything longer scrolls.
- **The physics is real and tested.** Universal-variable propagation is exact to
  ~1e-10 over a full period. Do not replace it with an approximation for
  convenience; add to it.
- **Every page needs a key or a link**, and a test asserts it.
- **Function keys only navigate.** A test asserts they never mutate vehicle state.
