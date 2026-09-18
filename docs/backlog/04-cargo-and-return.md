# 04 — Cargo run: launch, deliver, come home

**Status:** **DONE**
**Depends on:** 01 (docking), 02 (cold start), 03 (launch) — all shipped

The first of three full-arc missions. Where the existing ladder teaches one
manoeuvre per mission, this one is a whole flight: cold and dark on the pad,
launch, rendezvous, dock, swap cargo, undock, deorbit, survive entry, and come
down under parachutes. The user's words for what these are for:

> much more in depth mission design that actually goes places and returns, full
> missions, not just "raise apo here, circularise, done"

## What already exists

Everything up to and including the dock. Verified, not assumed:

- Cold and dark on the pad, with a dependency graph and a countdown — item 02/03.
- Launch to a 185 km parking orbit, 1,506 m/s of losses, max Q 35.0 kPa — item 03.
- `PLAN RDV` phasing, corridor approach, capture, ring, latches — item 01.
- Propellant transfer across a hard dock (`DOCK LINE` → `DOCK XFER`), which is
  the pattern cargo should follow.
- Drag, per-body atmospheres, and reentry heating on `sqrt(rho)·v³` — item 03.

## What does not exist, measured

**There is no way to survive coming home.** Booting the page, putting a vehicle
in a 60 × 200 km orbit and flying it down:

```
ENTRY : status lost | peak hull 800 °C | thermal failure
```

and with the thermal limit out of the way, drag alone leaves it arriving at the
surface at **578 m/s** — but only for the free-flight TESTBED with full tanks
(22,700 kg, Cd·A 9 m², a ballistic coefficient of 2,522 kg/m²), and **464.6 m/s
of that is the planet turning underneath it**. It is an inertial-frame number.
Measured against the air, that vehicle arrives at 227 m/s; every other shipped
airframe arrives at 468–474 m/s inertial and **55–94 m/s air-relative**
(AURIGA-1 dry 55, M-02 66, M-03 68, M-06 EAGLE 94). The original figure here
generalised one measurement to every vehicle and was corrected in item 04.

There is no heat shield, no parachute, no water, and no notion of a survivable
entry corridor. `grep -ci` over `index.html` returns zero for `cargo`, `splash`,
`drogue`, `ablat` and `checkpoint`; `chute`/`parachute` returns **1** — M-06's
briefing, "No atmosphere, no parachutes" — and `shield` returns 3, all of them
prose. No mechanism behind any of them.

So this item is three new mechanisms plus a mission that uses them.

## What to build

### 1. Cargo

Mass that moves between two docked vehicles and that the trajectory feels.

- `S.craft.cargo` in kg, with a capacity, carried in `craftMass()` exactly as
  propellant is. A loaded ship is a heavier ship and every burn costs more.
- Transfer across a hard dock, on the pattern `DOCK XFER` already sets: a
  precondition (hatch open), a rate, something to watch, and a stop.
- The delivery is one way and the return load is another, so the mission has
  the vehicle heavy on the way up and heavy again on the way down — or not,
  which is the player's problem to notice.
- It belongs on the UTILITIES pages beside the propellant transfer, not on a
  thirteenth function key.

### 2. Entry: a corridor, and a shield that can be used up

The decision taken with the user is the **full version**: a heat shield, an
entry corridor with two ways to get it wrong, then chutes.

- **Too steep** — the peak heating rate exceeds what the shield can take and
  the vehicle is lost. The 800 °C hull limit is the wrong instrument for this:
  it is a *bus* limit, and M-09 uses it for something else entirely. The shield
  needs its own budget.
- **Too shallow** — the vehicle skips back out, having spent the deorbit
  propellant, and comes round again on a worse orbit. This should be
  recoverable, not fatal.
- The corridor has to be **visible before you commit**: a target periapsis band
  on the page, the way max Q is shown against its limit on the LAUNCH page.
  Flying blind into a two-sided limit is not a puzzle, it is a coin toss.

### 3. Parachutes and splashdown

- Drogue then mains, each with a deployment envelope in altitude and dynamic
  pressure. Deploy too fast and they are torn away; too low and they do not
  inflate in time.
- Under full chutes the vehicle descends at a survivable rate. The existing
  touchdown check (`S.landingAllowed`, under 4 m/s vertical and 3 m/s lateral
  in `checkHazards`) is the right shape; the chutes are what get you inside it.
- Splashdown is a water landing, so it needs no landing site, which suits a
  planar world with no map.

### 4. Ordered mission phases

The objectives model is a flat list of latching checks — `checkObjectives`
marks any objective whose `check` returns true, in any order. That is fine for
"raise periapsis, then circularise" and wrong for a ten-phase flight, where
"splashdown" must not be markable before "launch".

- Phases run in order; only the current one is checked.
- The MSN page shows the current phase and what it wants, not a wall of ten.
- The briefing needs to be per-phase or it is unreadable on a phone.

### 5. Checkpoints

Decided with the user: **the mission checkpoints at each phase.** An hour of
flying must not be lost to one mistake at phase nine. RESTART offers the last
completed phase; starting over from the pad stays available. What a checkpoint
stores is the whole of `S` that a phase boundary needs — position, velocity,
mass, consumables, systems, dock state — and restoring it must put the vehicle
in exactly the state the phase began in, which is worth a test of its own.

## The mission

Cold dark on the pad → launch to orbit → rendezvous with CERES → dock →
deliver cargo and take on the return load → undock → deorbit burn → entry
through the corridor → drogue → mains → splashdown.

Every leg already has its lesson except the last two, which are this item's.

## Risks

- **The consumables have to cover the whole flight.** Nine missions were sized
  for one manoeuvre each. A full arc is hours of mission time with a crew
  aboard; the O₂ and the battery both have to be sized against the real
  profile, measured, not guessed. M-05 once flew on a flat battery for 5.3
  hours and nobody noticed until it was measured.
- **Cargo mass must not perturb anything.** A vehicle with no cargo must fly
  bit-for-bit as it does today. `deep.test.js` pins lunar arrival at
  708 × 823 km and Mars at 229 × 1080 km at MET 344:08:49:17 — those are the
  tripwire.
- **Entry is integrated, not propagated.** Drag is non-conservative; the entry
  runs down the `burnStep` RK4 path, as item 03 established. Do not touch the
  Kepler path.
- **Chute deployment at warp.** A chute envelope is a few seconds wide and the
  coasting chunk can be hundreds of seconds. The chunk must be bounded through
  an entry, the way it already is inside 500 m of a station and near an SOI
  boundary. This has bitten the project three times.

## Definition of done

- Cargo mass transfers, is carried, and changes the trajectory; an empty
  vehicle is unchanged bit-for-bit against the page before this item.
- An entry corridor with two failure modes, both reachable and both survivable
  to read about: too steep is lost, too shallow skips and can be re-flown.
- Drogue and mains with real envelopes, and a splashdown inside the touchdown
  limits.
- Ordered phases, with the MSN page showing the current one.
- Checkpoints that restore exactly, proven by restoring one and flying on.
- The whole mission flown end to end headlessly in a new suite, from dark pad
  to splashdown.
- All existing suites pass, arrivals unmoved.

---

## What shipped

Decided with the product owner before any code was written, and every number
below produced by a run rather than an argument.

- **Cargo is mass.** `S.craft.cargo` sits in `craftMass()` beside the
  propellant, so the solver, the ΔV remaining, the thrust-to-weight and the
  ascent all feel it without being told about it. `cargoMax` is a per-vehicle
  `rig()` number. Both default to 0, and `x + 0 === x`, which is why nothing
  that shipped before moved.
- **Cargo crosses a hard dock** through the open hatch at 4 kg/s, on the
  `DOCK XFER` pattern, as a fifth UTILITIES sub-page. No thirteenth function key.
- **The shield has a budget and a rate**, not a hull temperature: 90 MJ/m² it
  can absorb and 420 kW/m² it cannot survive for an instant. Those are the two
  sides of the corridor.
- **The shallow failure is not a skip.** Drag only ever removes energy, so the
  orbit after a grazing pass is always lower, never worse. Too shallow means
  you skim, exit, come round again, and spend shield budget every lap; when it
  is gone the hull is next. Proven in the suite by measuring six consecutive
  passes: 384 → 368 → 350 → 332 → 313 → 292 km of apoapsis, monotonic.
- **Altitude arms a canopy; dynamic pressure tears it away.** q is pinned near
  1.9 kPa from 30 km to the sea, so a q gate down there could never be broken.
  The drogue arms below 25 km, the mains below 6 km and tear above 0.80 kPa —
  which is what makes the drogue compulsory, because on the shield alone the
  vehicle is still at 1.99 kPa passing 6 km.
- **Touchdown is judged against the ground where there is air**, against the
  stars where there is none. Earth's surface moves at 464.6 m/s and the Moon's
  at 4.62, so this is the only split that lets a capsule splash down without
  making M-06's lunar landing unflyable. Earth carries `ocean: true` and a
  10 m/s / 8 m/s splashdown gate; everything else keeps 4 / 3.
- **Warp is clamped to 10× inside an atmosphere**, on the proximity-ops
  precedent.
- **Phases are opt-in.** A mission declares `phases` instead of `obj`; the nine
  that shipped before declare `obj` and walk exactly the code they always did.
- **Checkpoints** are a deep copy of `S` minus the mission record, the phase
  list and themselves. In-memory, offered by `RESTART PHASE`; `RESTART PAD` is
  the old behaviour unchanged, and both are keys on the MISSION page.
- **M-10 CARGO RUN** takes id 11, the only free one, at the end of the ladder.
  M-09 now chains forward to it instead of backwards to M-00.

## Measured, not assumed

The corridor for AURIGA-10 as it comes home (4,981 kg, Cd·A 26 m², from the
400 km station orbit):

| target periapsis | deorbit ΔV | passes | peak rate | shield spent | outcome |
|---|---|---|---|---|---|
| 125 km | 80 m/s | 2 | 319 kW/m² | 90.0 MJ/m² | burned through, then the hull |
| **118** | 82 | 1 | 320 | 90.0 | survives, with nothing left |
| **80 (published edge)** | 93 | 1 | 318 | 71.6 | 20% shield left |
| **20 (mid-band)** | 112 | 1 | 352 | 60.1 | 33% left |
| **−40 (published edge)** | 130 | 1 | 383 | 54.3 | 40% left |
| −120 | 155 | 1 | 415 | 49.4 | survives, 99% of the rate limit |
| −140 | 161 | 1 | 420 | 29.4 | shield fails — too steep |

Published corridor: **−40 to +80 km**, inside true edges of −120 and +118 at
the flown mass and −80 and +118 at the heaviest plausible return (5,520 kg).
The same relationship as max Q's 40 kPa design limit against a 56 kPa break-up.

| | |
|---|---|
| M-10 flown end to end, dark pad → splashdown | **14 h 46 min** |
| Power-up by hand | 4 min 14 s |
| Max Q on M-10's program | **36.5 kPa** against a 40 kPa limit |
| Parking orbit | **185.1 × 187.8 km, e = 0.0002** at MET 12:15 |
| Alongside CERES | 2,339 m at MET 10:37:58, 42.0 m/s of RCS left |
| Cargo swap | 5,756 → 3,956 → 5,156 kg |
| Deorbit | periapsis 19 km, mid-corridor |
| Peak heating | **348 kW/m²** of 420; 59.3 MJ/m² of 90 spent, 34% shield left |
| Drogue / mains | 24.5 km at 2.53 kPa / 5.9 km at 0.36 kPa |
| Splashdown | **8.11 m/s vertical, 0.00 m/s lateral** against a 10 / 8 gate |
| Oxygen | 30 crew-hours of 900 used — a 30× margin on the flown profile |
| Lunar arrival (unchanged) | 708 × 823 km, e = 0.0229 |
| Mars arrival (unchanged) | 229 × 1080 km, e = 0.1052, MET 344:08:49:17 |

M-02, M-03, M-05, M-08 and M-06-flown-to-touchdown all come out **bit-for-bit
identical** against `fa7742d` in position, velocity, mass and elapsed time.

## The one thing the ascent needed

M-10's payload is a third of M-00's, so the filed pitch program puts apoapsis
through 185 km while the vehicle is still at 132 km and doing 3.8 km/s — a
ballistic arc, not an orbit. Only the two entries above the atmosphere moved,
26° → 22° at 40 km and 10° → 7° at 130 km. Max Q is unchanged at 36.5 kPa
because nothing about the turn through the air changed.

The entry body is blunt: Cd·A 26 m², not the 12 m² an ordinary spacecraft
carries. At 12 m² there is **no surviving corridor at all** — measured, every
aim point either burns the budget through or overruns the rate.

## Not done

- **Persisting checkpoints across a page reload.** In-memory was the bar; the
  snapshot is 2.7 kB of plain JSON, so `localStorage` remains cheap to add.
- **The "too low to inflate" failure is thin.** The canopies are large enough
  relative to the vehicle that a late deployment still works down to about
  80 m; at 60 m the arrival is 13.2 m/s and the flight is lost. The failure
  that actually bites is streaming the mains without the drogue.
