# 02 — Cold start and systems configuration

**Status:** **DONE**
**Depends on:** nothing — it ran in parallel with docking

Split from the launch item by decision: they share only the idea of a vehicle
that is not yet flying, and this half is self-contained systems modelling.

## What shipped

The vehicle can begin dark. Powering it up is a dependency graph of ten
systems, each with prerequisites, a warm-up and a power draw, and the order
matters. `S.sys` holds one record per system — `state` walks
`OFF → START → ON`, plus `t` counting the warm-up and, for the guidance
platform, the residual drift you watch fall.

A mission declares which systems it wakes up with. Omitting that means all of
them, which is how every scripted mission has always booted and still does.
**A warm vehicle is a cold start that has already finished** — one code path,
not two, and that is what keeps nine tested missions safe.

```
BATT ──┬── BUS ──┬── AVIO ──┬── ATT ── GNC        (180 s alignment)
       │         │          ├── PRESS
       │         │          └── COMM
       │         ├── ARRAY   (75 s deployment)
       │         ├── THERM
       │         └── ECLSS   (crewed vehicles only)
```

Longest path is `BATT → BUS → AVIO → ATT → GNC`. Everything else runs beside
it. Measured by hand: **4 min 13 s**, about twenty seconds of key presses.

## Decisions taken — the six open questions, answered by the owner

1. **A dependency graph, not a checklist.** Any order that satisfies the graph
   works. An invalid step is refused by name — "GUIDANCE PLATFORM needs
   ATTITUDE CONTROL first" — never silently ignored.
2. **Only free flight starts dark.** The owner's words: *"Not every mission
   needs to start cold dark. All current existing missions may start
   preconfigured as they are today. Only free flight should start cold/dark. I
   would like future missions to partially start in cold/dark mode."* So
   `m.sys` is a **list of the systems that start running**, not a boolean:
   `sys: []` is fully dark, omitted is fully warm, and
   `sys: ['BATT','BUS','AVIO']` is the partial case a future mission wants.
   This went against the implementer's recommendation, which was to leave free
   flight warm and add a `COLD START*` key; the owner took the test rework
   knowingly, and it came to two suites and four lines.
3. **The console is dark too.** The whole display is dead until the player
   finds the battery — also against the implementer's recommendation. It is
   made survivable by exactly one lit key on the dark screen, `CLOSE BATTERY
   TIE*`, plus a standing scratchpad line saying the same thing. A dead screen
   with no affordance would be a bug, not atmosphere.
4. **Mostly refusal, one real failure.** Wrong order costs you a refusal with a
   reason. Flattening the battery costs you the bus: everything downstream
   drops, **the guidance alignment with it**, and that is the real price.
5. **Life support is in the graph, and air is now lethal.** Also stronger than
   the implementer's recommendation. Running life support costs one crew-hour
   per hour per crew member, exactly as before; running without it puts the
   crew on emergency oxygen at **four times** that rate. Reaching zero ends the
   flight, called a day out and again four hours out.
6. **Four to five minutes, not two and a half.** The owner wanted more ritual.
   The alignment is the long pole at three minutes, and the other five systems
   are started and watched beside it rather than after it.

## The stakes are in the eclipse, not the wattage

**Measured before designing anything:** sunlit generation runs 5,500–15,800 W
against a 340 W bus — between 12× and 46× margin — and across all ten scenarios
the battery never dropped below 56% over a day of flight. The work item's
promise that a bad power-up "costs battery and time" was **empty**. Power is
only a real currency in two places: before the arrays are deployed, and in
eclipse.

So free flight starts **in eclipse**, about fifteen minutes short of sunrise,
on a fifth of a 1,200 Wh pack. Measured:

| | |
|---|---|
| Power-up by hand, brisk | 4 min 13 s, 240 → 205 Wh |
| Battery at sunrise | 139 Wh (12%) |
| Recharge to full after sunrise | 2.8 min, 23,681 W coming in |
| Idle with everything on, arrays stowed | bus trips at 21 min |
| Recovery from a trip | bus + arrays on the reserve, everything back by 29 min |

## The alignment is something to read

Straight from item 01's leak-check lesson: a three-minute wait with nothing on
it would be the same mistake. The platform reports **residual drift**, falling
from 12.00 °/h toward the 0.05 °/h it has to reach, with the time remaining
beside it. Firing thrusters through an alignment pushes it back — 25 s plus
50 s per m/s — and says so. A slew does the same, which is what makes the
re-alignment after a bus trip its own small problem.

## Mission balance changed — deliberately, and here is why

Three numbers moved. None of them is a trajectory, and every arrival is
bit-identical: lunar orbit 708×823 km at e=0.0229, Mars capture 229×1080 km at
e=0.1052, Mars SOI at MET 344:08:49:17.

- **M-04's battery 1,400 → 4,400 Wh and M-05's 1,800 → 4,600 Wh.** A translunar
  coast crosses Earth's shadow for **10.6 continuous hours** out near apogee,
  where the vehicle is barely moving. That needs ~3,350 Wh. Both missions were
  already flying it on half of that — verified against the pre-item commit,
  where M-04 sits with a **completely flat battery for 6.5 hours** and M-05 for
  5.4. It was invisible because a flat battery had no consequence. Now that the
  bus trips, it would have ended both flights.
- **M-05's oxygen 900 → 2,400 crew-hours.** Its flight takes 78 hours and it
  carried 300 hours of air for three crew — a 3.9× margin, an order of
  magnitude thinner than any other crewed mission, and thin enough to matter
  once air can kill. Warp runs to a million times: one careless frame at that
  rate is four and a half hours of air. It is now 10×, in line with the ladder.
  **This is the one change the owner may want to veto**; it was reported rather
  than made quietly.
- **Free flight's oxygen 9,000 → 90,000 crew-hours** and its battery
  4,000 → 1,200 Wh. The sandbox is open-ended and people warp through
  259-day transfers in it, so air must not be a timer there; the smaller pack
  is what makes a fifth of a battery mean twenty-five minutes rather than an
  hour and a half.

Oxygen margins as they now stand: M-03 48×, M-05 10×, M-06 79×, free flight
effectively unbounded. Asserted in the suite, so they cannot rot quietly.

## Corrections to this file as it was originally written

- **A `PRELAUNCH` status would not have worked.** `advance()` returns
  immediately unless `S.status === 'flight'`, so a new status freezes the clock
  and no warm-up would ever tick. Cold start stays in `'flight'` with the
  systems themselves carrying the darkness. A true pad state — a vehicle on the
  ground, not being propagated — is item 03's problem and nothing here needs it.
- **"Getting it wrong costs battery" was not true**, as measured above. It took
  a deliberate eclipse start to become true.
- **The candidate list was stale on two entries.** Attitude control and the
  guidance platform now exist, built in item 01: real nose angle, eight hold
  modes, a rate limit, wheel power and an ignition gate. Cold start gates that
  machinery, it does not invent it.
- **Life support had changed underneath the item** — oxygen already depleted,
  added by the docking work, with no consequence attached.
- **`SYS` was already taken**, as a typed alias for the index page. It now
  opens the systems page; `MENU`, `INDEX` and `STATUS` still open the index.
- **"Ten systems will not fit six rows" is no longer a hard limit** — rows size
  to their content and the display scrolls. Two pages of five is still the
  right answer on a phone, for readability rather than because six is a ceiling.
- **"All nine missions" is ten entries** — nine scripted plus free flight, and
  free flight is the one the north star cares about.

## Pitfalls found — worth knowing before touching this again

- **Do not give the new systems "realistic" power draws.** The first version
  did: 25 W of bus, 90 W of life support, 70 W of platform, 30 W of propulsion,
  which took a warm crewed vehicle from 340 W to 555 W. **M-05 died on the way
  to the Moon within one test run** — 1,800 Wh survives a 10.6-hour shadow
  crossing at 340 W and does not at 555 W. The draws now **itemise** the old
  model rather than adding to it: the five systems that draw anything sum to
  exactly the old 120 W avionics floor on a crewed vehicle, and to 95 W on one
  with no life support, so a warm mission's margin does not move by a watt.
  Anything that wants to raise the total has to be measured against every
  mission's longest eclipse first, and `coldstart.test.js` pins 340 W / 315 W.
- **Zero battery used to be free.** Nothing in the game cared, so two missions
  were quietly flying with dead packs for hours. Giving a flat battery a
  consequence is what exposed it. Any future feature that attaches a cost to a
  resource should first check whether the resource was already being exhausted.
- **A bus trip must leave a way back.** Without a protected reserve, a vehicle
  that flattened itself with the arrays still stowed could never deploy them —
  deployment needs the bus, the bus needs power, and there is none. Shedding
  the bus now hands back 2% of the pack (`BUS_FLOOR`), which is a quarter of an
  hour of bus and deployment motors against a 75-second deployment. The first
  attempt trapped the trip threshold at the reserve instead, which re-tripped
  every step and deadlocked exactly the same way.
- **Do not gate the reaction wheels on the platform.** It reads as obvious —
  no alignment, no attitude control — and it makes the alignment impossible to
  disturb, because nothing can then command a slew. `stepAttitude` checks the
  wheels only; the platform gates what can be *commanded* (`HOLD` is refused,
  and a cold vehicle boots in `FREE`). An autopilot that was already chasing a
  reference when the bus dropped goes on chasing it when the wheels come back,
  and that slew is what fouls the re-alignment. `HOLD FREE` is the remedy and
  is deliberately allowed without a platform.
- **Warm-ups must bound the chunk.** They are countdowns, not controllers, so
  they settle inside any chunk `advance()` hands them — but a 300-second chunk
  would charge a 45-second start-up its full draw for the whole chunk, and
  would step clean over a three-minute alignment. `advance()` caps the chunk at
  10 s while anything is starting. A warm mission never has anything starting,
  so this never touches one. That is the same shape as item 01's proximity cap.
- **`loadMission` did not clear the scratchpad**, so a standing caution from
  the previous flight survived into the new one — and the message priority rule
  (a lower-severity line cannot displace a higher one inside six seconds) then
  swallowed the one instruction a dark vehicle has to give. It clears now.
- **`cmdMis` and the roster row forced the MISSION page** after `loadMission`,
  overriding the landing page `loadMission` had just chosen. A dark vehicle
  opens on SYSTEMS so that closing the battery tie lands the player exactly
  where the rest of the sequence is.
- **Hidden CDU rows kept their line-select keys enabled** from whatever longer
  page rendered before them. Harmless, since they are `display:none`, but it
  made "exactly one key is live on the dark screen" false at desktop width.
- **`tests/docking.test.js` had a one-run-in-six flake** that is not this
  item's: `DOCK EQUALISE` is a toggle and the leak-check section fired it
  blind. A randomly bad seal on the first capture bleeds the vestibule below
  101.2 kPa during the twenty-second hold, and the next step then waited for a
  pressure that was falling away from it. `reEqualise()` makes it state-aware.

## What the player sees

- **A dark screen.** No title, `UNPOWERED` where the reference usually is, one
  lit key — `CLOSE BATTERY TIE*` — and two lines saying what this is. Every
  function key still navigates; every page renders the same dark screen.
- **`SYS`** — reached by a link from the index and from ELECTRICAL, not a
  thirteenth function key. Two pages of five systems, each with its state,
  what it is waiting for, and one key to start or stop it. The title line
  carries the bus load and the state of charge. `AUTO POWER-UP*` on page one
  runs the sequence at the same speed it takes by hand.
  - `BATT · BATTERY` `READY · instant` → `RUNNING · 0 W`
  - `GNC · GUIDANCE PLATFORM` `ALIGNING · drift 4.80 °/h · T−00:02:00`
  - `ARRY · SOLAR ARRAY` `DEPLOYING · [====·····] 42%`
  - `ECLS · LIFE SUPPORT` `NOT FITTED` on an uncrewed vehicle
- **No avionics, no numbers.** The rail and the readout grid go to dashes, the
  lamp reads `NO NAV DATA` (or `DARK`), and the ORBIT page says the vehicle is
  still exactly where physics is putting it — you simply cannot see any of it.
- **`LIFE`** leads with O₂ endurance and the consumption rate producing it, and
  says plainly that reaching zero is fatal.
- Typed: `BATT`, `SYS`, `START <sys>`, `STOP <sys>`, `PWR UP`, `PWR DOWN`.
  A `WAKING A DARK VEHICLE` reference page sits in HELP.

## Coverage

`tests/coldstart.test.js` (new, 52 checks): the graph is acyclic and rooted at
the battery; every system downstream of it is refused on a dark vehicle, by
name; the dark console renders for every page without throwing, offers exactly
one live key, and wakes on it; no avionics means no solver, no attitude hold
and no numbers; a valid order brings everything up in four to five minutes and
lands on exactly the warm vehicle's 340 W; the warm-up is paid for out of the
pack in eclipse and the arrays are worth nothing until sunrise; the alignment's
drift falls, is on the page with its countdown, is set back by thrusters and
still converges; guidance and pressurisation each gate the engine and the
thrusters; the bus trips, is called first, takes the alignment with it, and the
reserve is enough to get the arrays out; life support is crew-only, the
emergency rate is 4×, the two cautions fire and running out is fatal; every
crewed mission's air margin; every scripted mission still boots warm at exactly
the load it always drew; a partly-cold boot; both systems pages.

`tests/browser/layout.test.js` walks the dark console and both systems pages at
375×667, 390×844 and 1100×780, checking the lit-key count, clipping and
horizontal scroll.

All ten suites pass.

## What is left

- **Nothing is partly cold yet.** The mechanism is built and tested
  (`sys: ['BATT','BUS','AVIO']`), but no shipped mission uses it. Item 04
  should decide which new missions want which subset.
- **Automatic load shedding** would be the authentic next step and would have
  saved M-04 and M-05 without resizing their batteries: a real EPS sheds
  non-essential loads at a low state of charge and only then drops the bus.
  Left out deliberately — it would silently override the player's own load
  switches, which is a bigger behavioural change than a battery number.
- **The thermal loop does nothing yet.** `THERM` gates the 140 W heater load,
  but hull temperature is still pure radiative equilibrium and does not care
  whether the loop is running. Making it care would touch M-09, which flies to
  a thermal limit, so it wants its own measurement pass.
- **`BUS_FLOOR` is generous by design.** Shedding the bus hands the reserve
  back every time, so a determined player can cycle it indefinitely. It is
  bounded in practice — every orbit has a sunlit half — and it is the price of
  "nothing is unrecoverable".
