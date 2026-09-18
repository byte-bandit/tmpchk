# 05 — Mars round trip: refuel, go, and get home

**Status:** done, with scope cut
**Depends on:** 04 (phases, checkpoints, entry and splashdown all land there)

The second full-arc mission, and the longest flight in the game:

> start cold, launch, orbit, rendezvous with station, dock, refuel ship,
> detach, burn to mars, flyby, return home

## What already exists

The outbound half is genuinely solved, and the refuelling is already built:

- Refuelling at the station is item 01's propellant transfer. `DOCK LINE`,
  wait out the purge, `DOCK TIE` for pump power, `DOCK XFER`. Measured: it
  fills the main tank then RCS and stops itself, 400 → 700 kg in one test.
- `PLAN ESC` from a 200 km Earth orbit returns a real solution — measured,
  `BURN PRO 506.1 AT PE`.
- From solar orbit, `PLAN XFER MARS` solves a true encounter through the SOI
  change — measured, `BURN PRO 809.63 AT T+7752950.06`, and M-08 flies it to a
  229 × 1080 km capture.

## The hole: coming back

Put a vehicle in a circular solar orbit at Mars' distance — where a returning
ship is — and ask for a transfer home:

```
at 1.524 AU, circular
plan  : BURN RET 757.6 AT XFER EARTH
        Falling back to the analytic window. Expect a midcourse trim.
```

`targetEncounter` **fails to find an intercept inbound** and the solver drops
to the textbook Hohmann window. The game then tells the player to expect a
midcourse trim — and gives them no tool to make one. Outbound is solved;
inbound is a hint and a shrug.

This is the item's real work. Two parts:

1. **Make the encounter targeter work inbound.** Find out why it fails before
   changing it. Candidates worth measuring rather than assuming: the search
   span is derived from the departure period and may not bracket an inbound
   solution; the aim point (`goal = max(800, R*0.5)`) is tuned for arrivals
   from below; the inbound geometry may need the scan widened rather than the
   bisection changed. Fix the cause, not the symptom.
2. **Give midcourse correction a real tool**, because even a solved transfer
   drifts. Something that reads the current closest approach to the target and
   solves the small burn that moves it — which is most of `targetEncounter`
   already, pointed at the trajectory you are on rather than one you might fly.

## What else this mission needs

- **Consumables over years.** Earth → Mars is ~259 days each way plus the wait
  for the return window. A crewed round trip is on the order of two to three
  years: roughly 20,000–26,000 crew-hours for three, against the 2,400 M-05
  carries. Size it against the real flown profile and measure it, the way M-04
  and M-05's batteries had to be resized when their eclipses were finally
  measured.
- **A flyby, not a capture.** The user said flyby. That is cheaper than M-08's
  capture and it makes the return window a thing you hit rather than choose —
  worth checking whether a free-return-style trajectory exists in this planar
  world, and saying so plainly if it does not.
- **The propellant only closes if you refuel.** That is the point of the
  station leg: launch with what a launcher can lift, top up in orbit, then go.
  The budget should be provably impossible without the refuel — `physics.test.js`
  already asserts every mission is solvable with what it carries, and this
  mission's version of that has to account for the transfer.
- **Entry and splashdown on the way home** come from item 04. An interplanetary
  return enters faster than an orbital one, which the corridor should reflect.

## Risks

- **Warp and long flights.** M-08 already runs at 1,000,000×, where one frame
  is eleven days. Every event on this flight — window, encounter, SOI entry,
  midcourse burn — must bound the chunk or be stepped straight over.
- **`advance()` has a 220-chunk guard per call.** A multi-year coast at high
  warp is worth checking against it rather than assuming it is generous.
- Arrival geometry for M-05 and M-08 is pinned in `deep.test.js`. Any change to
  `targetEncounter` touches the code that produced those numbers, so they are
  the first thing to re-measure — before and after.

## Definition of done

- `PLAN XFER EARTH` solves a real encounter from Mars' distance, not a
  fallback, proven by flying it to an Earth SOI entry headlessly.
- A midcourse correction tool that measurably moves closest approach.
- The mission flown end to end: dark pad → orbit → dock → refuel → escape →
  Mars flyby → return → entry → splashdown.
- Consumables and propellant measured against the flown profile, and the
  mission provably unflyable without the refuel.
- M-05 and M-08 arrival geometry unchanged: 708 × 823 km and 229 × 1080 km at
  MET 344:08:49:17.
- All existing suites pass.


---

## What shipped, and the scope that was cut

The mission ends **in Earth orbit**, not in the water. That was a deliberate cut
taken with the owner after the flight proved the entry could not close.

### The cut, and why

An interplanetary return arrives at about 11 km/s. No shield in the game
survives it, and the deeper reason is that `transferWindow()` (which every
`PLAN XFER` rests on) takes `r1 = e.r` — the craft's current radius — and builds
a textbook Hohmann as though the ship were in a **circular** orbit of that
radius. The game already says so:

    if (e.e > 0.02) say('Your orbit is not circular — circularize first ...')

A Mars flyby leaves the ship on 1.03 × 1.73 AU, e ≈ 0.25. So the return is
planned with a tool documented as invalid for the orbit the mission is on, and
the arrival it produces varies wildly with how the injection was flown —
measured at e = 1.90 on one flight and e = 5.16 on another.

Capturing is affordable. Coming down from that is not, and faking it would be
worse than stopping. **Bringing the crew home through the atmosphere needs a
Lambert solver** — a transfer between two positions and a time of flight — which
this codebase does not have. That is the next item, not this one.

### Measured, flown end to end

| | |
|---|---|
| Whole flight | dark pad → orbit → CERES → refuel → escape → TMI → Mars flyby → return → capture |
| Duration | **1,523 days — 4.17 years**, nine phases |
| Depot | 32,000 kg, drawn to 485 kg; the ship launches with 600 kg and 964 m/s |
| After refuel | 16,997 m/s — the flight is impossible without it |
| Arrival | Earth SOI at MET 1522:14:44:55, periapsis 6,110 km, **e = 4.571** |
| Capture | 6,839 m/s needed against 8,274 aboard → 6,090 × 18,201 km, **1,436 m/s spare** |
| Air | **2,000 crew-hours of reserve still aboard after 4.17 years** |

The depot was sized against the *worst* return the trajectory produces, not the
luckiest. At 26,000 kg the ship arrived with 6,538 m/s, needed 7,245, and
captured into a 46,000 km ellipse with a dry tank — a mission that depends on
flying the injection well is a mission that strands people who flew it
adequately.

### The Kepler bug this item found

`propagate()` diverged for a band of step sizes on a high-eccentricity
hyperbola at large radius: at dt = 1,764 s from Mars' SOI edge it returned
2.9e19 km against a true 5.7e5 km. Eighty Newton iterations with no convergence
test, and only an `isFinite` guard, which a diverged-but-finite result passes.
Every shipped mission escaped it by capturing before `advance()`'s step shrank
into the band; a flyby does not. Fixed, and a flyby is now bit-identical from
1× to 1,000,000×. **Both pinned arrivals are unmoved** — lunar 708 × 823 km and
Mars 229 × 1080 km at MET 344:08:49:17 — which is the proof the fix only
touched cases that were already wrong.

### Also in here

- Regenerative life support on every crewed vehicle: the loop closes on power,
  so 30 days of cruise costs no oxygen and the tank is a 6.9-day reserve for
  when the bus is down. Replaces the old count-down-to-zero model.
- `PLAN TRIM <BODY>`, a real midcourse correction: moves closest approach onto
  the number it quotes (−2,205 km → 301 km on a 2,506 km correction).
- The inbound `solveBurn` metric: apoapsis does not move on a retrograde burn,
  so the solver could never bracket an inbound target and gave up before
  searching. It now targets periapsis inbound.
