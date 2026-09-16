# 02 — Cold start and systems configuration

**Status:** not started
**Depends on:** nothing — this one can run any time, in parallel with docking

Split from the launch item by decision: they share only the `PRELAUNCH` state,
and this half is self-contained systems modelling that can ship on its own.

## Where it is today

Every mission begins with systems already running.

- `loadMission()` calls `rig({...})` then `setOrbit(...)`, placing the vehicle
  directly on a trajectory with everything live.
- Systems boot configured: `S.loads = { HEAT:true, COMM:true, SCI:false }`,
  battery full, arrays deployed, hull at 20 °C.
- Nothing has to be turned on, and nothing can be turned on in the wrong order.

## What to build

The vehicle begins dark. Power up in an order that matters: batteries before
buses, buses before avionics, avionics before guidance, and guidance needs an
alignment before it can fly. Getting it wrong costs time and battery.

Suggested shape: a dependency graph of 8-10 systems, each with a state
(`OFF | STARTING | ON | FAULT`), a set of prerequisites, a power draw and a
warm-up time. Any order satisfying the graph works; the graph is the puzzle.

Candidate systems: batteries, main bus, avionics, guidance platform (needs an
alignment period), attitude control, comms, thermal loop, array deployment,
propulsion pressurisation, life support.

## Open questions

1. **How deep?** A dozen switches in a fixed order, or a dependency graph where
   any valid order works? Suggest the graph — more interesting, no harder to test.
2. **Is a bad sequence recoverable?** Suggest yes, always. It costs battery and
   time, which on a limited battery is punishment enough.
3. **Does the guidance alignment gate flight?** Realistic (no alignment, no
   attitude reference, no burns), and it gives the cold start real stakes.
   Suggest yes.
4. **Does this retrofit onto existing missions?** Making all nine start dark
   would change every tested mission. Suggest it is opt-in per mission via a
   `coldStart: true` flag, used by new missions only at first.
5. **One page or several?** Ten systems will not fit six rows. Suggest a paged
   `SYS` page listing systems with state and a line-select key to start each.

## Risk

Low, provided question 4 holds the line: if existing missions keep booting warm,
nothing tested can regress. The failure mode is scope — a cold start that takes
five minutes of button pushing before every flight would be tedious rather than
authentic. Keep it under about a minute once the order is known.

## Definition of done

- A `PRELAUNCH`/dark vehicle state, opt-in per mission.
- Systems with real prerequisites, warm-up times and power draw.
- A paged systems page with per-system line-select keys.
- Guidance alignment gates flight if q3 says so.
- New suite: a valid order powers up; an invalid one is refused with a reason;
  battery drains during warm-up; a warm-booting mission is unaffected.
- All existing suites pass.
