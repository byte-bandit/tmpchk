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

## The interface

A CDU modelled on the Airbus MCDU, which is what "scratchpad" means in a cockpit:

- **Title line** with page number and slew keys.
- **Six label/data row pairs**, split left and right, small type for labels and
  large for data.
- **Line-select keys** (1L-6L, 1R-6R) beside each row. `<TEXT` and `TEXT>` mark a
  field whose key is live; `TEXT*` commits an action. Type a value into the
  scratchpad and press a key to load it into that field.
- **Scratchpad line** carrying typed entry and system messages. A lower-severity
  advisory never wipes a standing caution.
- **Free multi-line text** where a page needs prose - mission briefings, the
  message log, the reference pages, uplink latency notes. Rows size to their
  content and the display scrolls; data pages stay on one line per field.
- **Twelve function keys** that only ever change page, never vehicle state.

Pages refresh once per second, as a flight management computer does. Every page
is reachable from a function key or a link, and that is asserted by a test.

## The flight computer

`PLAN` solves manoeuvres by *flying* them, not by impulse:

- `PLAN CIRC AP|PE`, `PLAN APO <km>`, `PLAN PERI <km>`, `PLAN ESC` - burn duration
  found by binary search over simulated burns.
- `PLAN XFER <BODY>` - a full encounter targeter. It searches ignition time,
  propagating each candidate forward through the SOI change, because a textbook
  Hohmann aimed at a body's orbital radius is a collision course.
- `PLAN RDV` - Hohmann phasing for the station rendezvous.

A solution lands on its own page with an `ARM BURN*` key, so nothing has to be
retyped. Every typed command still works.

## Missions

Nine, in order: orbital insertion, orbit raising, rendezvous and docking, lunar
flyby, lunar orbit, lunar landing, Earth escape, Mars transfer and capture, and a
solar dive with a thermal limit. Plus free flight.

## Development

`index.html` is the whole game — no build step, no dependencies.

Test suites live outside the repo (they extract the script blocks and run them
under a headless DOM stub, or drive the page in Chromium):

- physics and mission-balance checks
- two end-to-end suites that fly every mission to completion
- a CDU suite: every page builds cleanly in every mission state, every page is
  reachable, function keys never touch vehicle state, and a plan can be selected,
  reviewed, armed and flown entirely from line-select keys
- layout and fullscreen suites in a real browser at three screen sizes
- a text suite asserting nothing is clipped, long paragraphs really wrap, rows
  never overlap, and data pages stay single-line
