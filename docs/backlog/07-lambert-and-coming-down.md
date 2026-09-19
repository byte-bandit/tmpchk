# 07 — A Lambert solver, and bringing an interplanetary return down

**Status:** Done · **Depends on:** 05 (Mars round trip), 04 (entry, chutes,
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


---

## What shipped, and what it measured

M-11 now flies **dark pad → launch → CERES → refuel → Mars flyby → home → the
water**: twelve phases, **MET 1110:14:04:18 = 3.04 years**.

### The solver

A universal-variable Lambert on the same Stumpff `C(z)`/`S(z)` as `keplerStep`.
The unknown is `z` and flight time is monotone in it wherever `y(z) > 0`, so it
is solved by **bisection rather than Newton** — deliberately, because Newton is
exactly what diverged on the Mars hyperbola that item 05 had to fix.

Tested as mathematics before it was tested as a mission, 22 round trips across
LEO circular, e = 0.70, a lunar arc, heliocentric cruise, the e = 0.247 flyby arc
and a hyperbola: worst velocity residual **1.03e-7 m/s**, worst time-of-flight
residual **1.49e-7 s**, worst forward-check miss **6.9e-7 km**.

`PLAN XFER`'s path is untouched, and that is verified rather than asserted:
`transferWindow`, `targetEncounter`, `solveBurn` and `teiSolve` are byte-identical
to the previous commit, and `coastEncounter` differs by one added field that no
existing caller reads. Both pinned arrivals are unmoved — lunar **708 × 823 km**,
Mars **229 × 1080 km at MET 344:08:49:17**.

### The scoreboard

| | shipped return | Lambert return |
|---|---|---|
| Departure | 2,115 m/s | 3,529 m/s |
| Arrival v∞ | 10.679 km/s | 4.803 km/s |
| Capture | 6,839 m/s | 4,211 m/s |
| **Total** | **8,954 m/s** | **7,740 m/s** |
| Duration | 4.17 years | **3.04 years** |

Entry interface 7.860 km/s inertial, 7.386 air-relative; peak heating
**337 kW/m² = 0.80×** the 420 limit; **32.8%** of the shield left; splashdown
**8.32 m/s** against a 10 m/s limit.

### Propellant was never the blocker — so aerobraking was not built

The owner sanctioned aerobraking as the fix *if the budget did not close*. It
closes, so it was not built. The reason is worth keeping:

The cheapest transfer Lambert finds costs **1,383 m/s** departure and 1,475 m/s
capture — v∞ 2.62 km/s against 10.68. It is also **unflyable**. The engine is the
only way a spacecraft sheds mass, so the cheap transfer is the *heavy* arrival:
it comes home at **10,212 kg** against an airframe that can land **7,600**. At
that mass every periapsis from 10 to 100 km exceeds the rate limit and 110–120 km
spends the whole 90 MJ/m² budget. **There is no corridor.**

Aerobraking would not have helped: the shallow end already spends the entire
shield budget, so more passes spend more shield, not less. Measured, not assumed.

The fix is a knob on the planner instead. `PLAN LAMBERT EARTH 300 **30**`
constrains the departure window: leave at once, pay 3,529 m/s instead of 1,383,
arrive at **7,339 kg**, and get home **705 days sooner**. That trade — cheap
against flyable — is now the lesson of M-11's second half.

### Which way round the planet you arrive is worth 1.44× the heating rate

The impact parameter can be laid off either side of the target's centre: same
periapsis, same propellant, opposite directions round the body. The air turns
with the planet, so a retrograde arrival meets it at `v + ωr`.

Verified independently of the mission, same orbit and mass with only the
direction reversed: **7.436 km/s air-relative prograde against 8.380
retrograde** from an identical 7.908 km/s inertial. Cubed, that is **1.43×** the
heating rate. It was the difference between having a corridor and not having one.
`coastEncounter` now reports the arrival's sense and the planner prefers the side
that turns with the body.

### Per-vehicle entry hardware

ARES-2 carries its own: `cda: 39`, `chutes: { DROGUE: 150, MAIN: 1500 }`,
`entryMax: 7600`. Sized by M-10's own stated rule (β ≈ 190) and by mass ratio.
With the reference canopies the drogue streams at **4.33 kPa against a 3.00 kPa
tear limit** and the capsule hits the sea at **68 m/s** — ARES-2's dry mass plus
RCS alone exceeds M-12's entire landing mass. `S.craft.chutes` and
`S.craft.entryMax` default to `null`, so M-10, M-12 and the M-12 lander fly the
reference set unchanged.

### Found and not fixed

- **`rollSeal()` uses `Math.random()`** (pre-existing; three occurrences, all
  older than this item). Measured on an unchanged tree, M-12's splashdown lands
  on MET 010:14:43:19 or :10 depending on whether the seal re-seats. Any
  "byte-identical" claim about a suite that docks is luck, not proof. The pinned
  arrivals are safe because M-04/M-05/M-08 never dock. Wants a seeded RNG.
- **`targetEncounter`'s aim ladder is mass-fragile** — 32,000 kg picks the
  k = 1.12 rung and 24,000 kg picks k = 1.30, and the second misses. Not on any
  shipped path; left alone because `PLAN XFER` stays frozen.
- **`PLAN LAMBERT`'s aim across an interplanetary SOI patch** is exact to the
  Moon, Venus and Earth but lands 239 km against 300 asked at Mars. The readout
  warns and points at `PLAN TRIM`. Honest, not solved.

### Fixed in review

- The `Both burns` field shipped as `3.929 km/s / 5.214 km/s` and **ran off the
  side of a 375 px screen** — measured in Chromium, not guessed. Now
  `3.929 / 5.214 km/s` via `fmtDVPair`, which prints the shared unit once.
- `layout.test.js` had not been extended to the new page, which is why nothing
  caught it. It now walks ARC TRANSFER in both its empty and solved states.
