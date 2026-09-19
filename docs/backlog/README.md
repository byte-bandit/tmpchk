# Backlog

One file per work item. Each is written to be picked up by a **fresh session**
with no memory of this conversation, so each states its own current-state facts,
constraints and open questions.

| # | Item | Status | Depends on |
|---|------|--------|-----------|
| [01](01-docking.md) | Realistic docking — attitude and mechanics both **done** | Done | — |
| [02](02-cold-start.md) | Cold start and systems configuration | **Done** | — |
| [03](03-launch.md) | Launch from Earth | **Done** | — |
| [04](04-cargo-and-return.md) | Cargo run: launch, deliver, come home | **Done** | 01, 02, 03 |
| [05](05-mars-round-trip.md) | Mars round trip: refuel, go, get home | **Done** (ends in Earth orbit) | — |
| [06](06-lunar-landing.md) | Lunar landing from a mothership | **Done** | 04 |
| [07](07-lambert-and-coming-down.md) | Lambert solver, and bringing an interplanetary return down | In progress | 05 |

Decisions taken: attitude is built inside item 01 scoped to docking's needs and
extended when launch needs it; cold start and launch are separate items.

Items 01–03 built the machinery. **Items 04–06 are the missions that use it** —
full arcs that go somewhere and come back, rather than one manoeuvre each. They
came from the user's three examples and were split so that each one ships
something playable:

| Example | Item | The new machinery it needs |
|---|---|---|
| Launch, dock, swap cargo, reenter, splash down | 04 | cargo mass, entry corridor, heat shield, parachutes, ordered phases, checkpoints |
| Launch, dock, refuel, Mars flyby, return home | 05 | an encounter solver that works *inbound*, midcourse correction, years of consumables |
| Launch, translunar, separate a lander, land | 06 | a mothership that becomes a docking target while you fly the lander |

Decisions taken on these: the mothership becomes a passive docking target
rather than a second simulated vehicle (which reuses item 01 wholesale); entry
gets the full treatment — shield, two-sided corridor, chutes, splashdown; and a
mission checkpoints at every phase, so an hour of flying is never lost to one
mistake at phase nine.

The north star is one continuous flight in FREE FLIGHT: cold start on the pad →
launch → rendezvous → dock. Item 01 built the last leg, items 02 and 03 the
first two, and FREE FLIGHT now flies all of it.

## Picking up an item

1. Read the item file end to end. It lists the code it touches with current
   line references — re-grep, don't trust the numbers.
2. `./tests/run.sh` before you start. Everything passes on a clean tree; if it
   does not, fix that first rather than building on a broken base.
3. Answer the item's **Open questions** with the user before writing code. They
   are there because getting them wrong means rework, not because they are
   interesting. Bring measurements, not guesses — item 01's suggested answer to
   its own first question turned out to be backwards.
4. `./tests/run.sh` again before publishing. Add suites for what you built.

## How this codebase is arranged

`index.html` is the whole game — no build step, no dependencies. Roughly:

| Region | What lives there |
|--------|------------------|
| script 1 | Constants, bodies, vector maths, universal-variable Kepler propagation, orbital elements |
| script 2 | `S` (vehicle state), `derive()`, the `SYSTEMS` cold-start graph, `burnStep`, SOI patching, `advance()` |
| script 3 | Canvas scope renderer |
| script 4 | Formatters, `say()`/`row()`/`head()` message store |
| script 5 | `exec()` command interpreter and subsystem commands |
| script 6 | `PLAN` solvers: `solveBurn`, `simBurn`, `coastEncounter`, `targetEncounter`, `transferWindow` |
| script 7 | `MISSIONS`, `loadMission`, objectives |
| script 8 | CDU page framework, `PAGES`, input, fullscreen, main loop, boot |

Tests boot the real page under a DOM stub (`tests/harness.js`) or drive it in
Chromium (`tests/browser/`). Fourteen suites; `./tests/run.sh` runs the lot.

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
