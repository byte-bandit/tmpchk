# 07 — A Lambert solver, and bringing an interplanetary return down

**Status:** Not started · **Depends on:** 05 (Mars round trip), 04 (entry, chutes,
splashdown), 06 (the capture-then-enter pattern)

This item exists because item 05 stopped short and said so in the mission brief.
M-11 MARS ROUND TRIP ends **in Earth orbit** rather than in the water. The crew
get home and then sit there. This item brings them down.

---

## The actual blocker, restated

It is not the heat shield. It is the **aim**.

Every `PLAN XFER` rests on `transferWindow()` (`index.html:3765`), which opens:

```js
const b = soiBody(), mu = b.mu, e = el(), tb = BODIES[tk];
const r1 = e.r, r2 = tb.a, at = (r1+r2)/2;
```

`r1 = e.r` is the craft's *current radius*, and everything after it is a textbook
Hohmann between two **circular** orbits. The game admits this to the player's face:

```js
if (e.e > 0.02) say('Your orbit is not circular — circularize first ...')
```

A Mars flyby leaves the ship on roughly 1.03 × 1.73 AU, **e ≈ 0.25**. So M-11's
return leg is planned with a tool the game itself documents as invalid for the
orbit the mission is actually on. Item 05 measured the consequence: the same
mission, flown twice, arrived at Earth on **e = 1.90** one time and **e = 5.16**
another. The arrival is not chosen; it is whatever falls out.

`targetEncounter()` (`index.html:3535`) does integrate properly and does refine —
it sweeps ignition time, bisects brackets, and walks an aim-point ladder. But it
seeds itself from `transferWindow`: the burn magnitude comes from `solveBurn`
driving `ra`/`rp` to `w.r2`, and the ignition scan is centred on `w.wait`. **A
good search from a wrong seed is still a wrong answer.**

## Why the aim is worth propellant

Arriving where you choose is not cosmetics — it is thousands of m/s, because of
where the capture burn gets lit.

Item 05 measured the return arriving at **periapsis 6,110 km altitude**, and the
capture burn there costing **6,839 m/s** against **8,274 m/s** aboard. Arrive on
the same hyperbola but with periapsis aimed at ~300 km instead and the same
capture is lit far deeper in the well, where the Oberth effect pays.

Back-of-envelope from item 05's measured arrival (v∞ ≈ 10.7 km/s), **to be
measured, not trusted**:

| Aim point | Capture at periapsis into a ~24,500 km ellipse |
|---|---|
| 6,110 km alt (what the mission gets today) | ~6.84 km/s — matches the measured 6,839 |
| 300 km alt (what a Lambert aim could buy) | ~5.6 km/s |

That ~1.2 km/s is roughly the difference between "ends in orbit" and "has the
budget to come down". The first job of the flight test is to confirm or destroy
this table with a real number.

## Why it cannot just enter directly

M-12 already measured this exact wall and the mission brief carries the finding:

> 'You arrive at Earth at {10.5 km/s} and no shield survives that: measured,
> every aim point either takes the ablator off at {three times} its rate limit
> or skims and burns the whole budget on the way past. So you {stop first}.'

So the shape of the ending is already established by the ladder: **capture, come
down to a low orbit, then it is M-10's entry**. Item 07 does not need to invent
new entry physics. It needs to make the arrival aimable enough that the capture
is affordable, and then fly the ending M-12 already flies.

---

## Scope

1. **A real Lambert solver.** Given `r1`, `r2` and a time of flight, return the
   two velocity vectors. Universal-variable formulation, so it shares the
   Stumpff `C(z)`/`S(z)` machinery already in script 1 (`keplerStep`,
   `index.html:471`). Planar, prograde/retrograde selectable, short-way and
   long-way. It must be tested as *mathematics* before it is tested as a
   mission: round-trip it against `propagate()` — propagate a known orbit for
   `dt`, hand Lambert the endpoints and `dt`, and the velocities must come back
   to the ones you started with.

2. **A planner that uses it.** A porkchop-style search over departure time and
   time of flight, from wherever the ship actually is — eccentric orbit and all
   — to a target body's position at arrival, aiming a specified periapsis
   altitude. Lambert supplies the seed; `targetEncounter`'s integrator still
   verifies it through the SOI change, because a two-body solution is a guess
   about a patched-conic world.

3. **M-11 flown to splashdown.** Extend the mission past EARTH CAPTURE: lower the
   orbit, deorbit into the corridor, entry, chutes, water. If the propellant
   does not close, say so with numbers and bring the options back rather than
   quietly growing the depot.

## Constraints

- **Both pinned arrivals must not move.** Lunar **708 × 823 km**; Mars
  **229 × 1080 km at MET 344:08:49:17** (`tests/deep.test.js`). Item 05's own
  notes record that a tie-break inside the first sweep moved the Mars arrival to
  233 × 1089 km and was confined to the wide sweep for exactly this reason. If
  Lambert is wired into the path `PLAN XFER` already walks, it must be proven
  bit-for-bit on every shipped mission or it does not go in.
- **M-06 must still land on the Moon** (`tests/cargo.test.js` A/B) and M-12 must
  still fly to splashdown (`tests/lunar.test.js`).
- Planar. No inclination anywhere, including in Lambert.
- Phone first, 375×667. Twelve function keys, not thirteen.
- Every page needs a key or a link, and a test asserts it.

## Acceptance

**The end-to-end headless flight is the acceptance test, not the last step.**
Item 05 shipped thirteen green suites around a mission that could not be
completed, because the suite tested the inbound solver from a circular orbit the
mission never encounters. Fly M-11 from the dark pad to the water, headless, and
paste the numbers: MET, propellant at each burn, arrival periapsis, entry
interface speed, peak heating rate against the shield's limit, shield remaining,
splashdown speed.

Then `./tests/run.sh` — all fourteen suites, plus whatever this item adds.

## Decisions taken with the owner

1. **Lambert is a new command.** `PLAN XFER` keeps its existing code path
   untouched, so the pinned lunar and Mars arrivals are safe by construction
   rather than by re-proof. The return leg gets the new planner. The cost is two
   transfer tools in the game, so the briefs and the help text have to make it
   obvious which one is for what: `PLAN XFER` is "I am in a circular orbit and I
   want to go to that body"; the Lambert command is "I am on whatever arc I am
   on and I need to be *there* at a time I choose".

2. **M-11 grows to splashdown.** Add phases after EARTH CAPTURE and rewrite the
   brief that currently apologises for stopping in orbit. One mission, one
   complete arc. The Mars flyby tripwire sits *before* the new phases, so it must
   come through unmoved — prove that, do not assume it.

3. **If the propellant does not close, the answer is aerobraking, not a bigger
   depot.** Measure the shortfall first and report the number either way. But the
   sanctioned fix is multi-pass atmospheric capture — skim, exit, come round,
   repeat — paying shield budget instead of propellant. The drag model already
   does the physics; what is missing is the planning and the readout that make it
   flyable rather than a lucky accident. Do not resize CERES to paper over a
   shortfall.
