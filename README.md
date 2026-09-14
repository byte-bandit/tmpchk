# Delta-V — Flight Console

A browser game about the actual puzzles of spaceflight, played entirely through a
command scratchpad. Phone-first.

Live: published as a Claude Artifact.

## What it simulates

Planar patched-conic orbital mechanics, done properly:

- **Universal-variable Kepler propagation** (Stumpff functions, Newton iteration).
  Exact for elliptic, parabolic and hyperbolic arcs alike, which is what lets time
  warp jump days in one step without drift.
- **Sphere-of-influence patching** between Sun, Earth, Moon, Venus and Mars, with
  step size tightened on approach so a boundary is never crossed blind.
- **Finite burns** integrated with RK4 under thrust, with Tsiolkovsky mass flow —
  so a long burn under-delivers against its impulsive figure, exactly as a real one does.
- Power (solar flux, eclipse, battery), thermal (radiative equilibrium), comms
  (light-time), and propellant budgets that actually constrain the missions.

## The flight computer

`PLAN` solves manoeuvres by *flying* them, not by impulse:

- `PLAN CIRC AP|PE`, `PLAN APO <km>`, `PLAN PERI <km>`, `PLAN ESC` — burn duration
  found by binary search over simulated burns.
- `PLAN XFER <BODY>` — a full encounter targeter. It searches ignition time,
  propagating each candidate forward through the SOI change, because a textbook
  Hohmann aimed at a body's orbital radius is a collision course.
- `PLAN RDV` — Hohmann phasing for the station rendezvous.

Every answer ends in a command line you can type straight back.

## Missions

Nine, in order: orbital insertion, orbit raising, rendezvous and docking, lunar
flyby, lunar orbit, lunar landing, Earth escape, Mars transfer and capture, and a
solar dive with a thermal limit. Plus free flight.

## Development

`index.html` is the whole game — no build step, no dependencies.

Test suites live outside the repo (they extract the script blocks and run them
under a headless DOM stub): physics and mission-balance checks, plus two
end-to-end suites that fly every mission to completion.
