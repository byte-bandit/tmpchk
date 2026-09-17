# 04 — Cargo run: launch, deliver, come home

**Status:** not started
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
surface at **~580 m/s**. There is no heat shield, no parachute, no water, and
no notion of a survivable entry corridor. `grep -c 'cargo\|chute\|parachute\|splash'`
over `index.html` returns zero for all of them.

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
