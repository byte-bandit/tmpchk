# 05 — Mars round trip: refuel, go, and get home

**Status:** not started
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
