# 01 — Realistic docking and berthing

**Status:** phases 0 and 1 done — see "What is left" at the end
**Contains:** the attitude model (phase 0 below) — an approach without alignment is not a docking


## Phase 0 — attitude — **DONE**

`S.att = { theta, rate, mode, inertial, slewing }`. The nose is real state; the
autopilot chases `mode` at a finite rate; thrust leaves the nose. Modes: PRO,
RET, RIN, ROUT, TGT, ATGT, INRT, FREE. `HOLD <mode>` commands it, the ORB and
BURN pages show it, and the scope marker points where the nose does with a cyan
tick for the commanded heading while slewing.

### Decisions taken

1. **Turning costs power, not propellant** — reaction wheels, `slewPower` 90 W
   while turning, drawn through the existing electrical model. This was forced
   by a measurement, not a preference: see the pitfall below. A dead bus means
   no attitude control, which is a real and interesting failure mode.
2. **Slew rate** 4°/s with 2°/s² acceleration, per vehicle. A 180° reversal
   takes ~47 s.
3. **Ignition waits for alignment.** `burnStep` returns without thrusting while
   pointing error exceeds 0.5°, and the burn clock does not run — so a commanded
   duration is always a duration of thrust. Arming a burn commands the attitude
   immediately, so the slew finishes during the lead-in and ignition timing is
   unchanged.
4. **Attitude is shown on the scope**, including the commanded heading.

### Pitfalls found — worth knowing before touching this again

- **Do not integrate attitude at the Kepler chunk size.** `advance()` hands out
  chunks of up to hundreds of seconds while coasting. A bang-bang controller at
  that step diverges instead of converging — the first version pinned the rate
  at maximum forever and drained the tanks. `stepAttitude` now settles
  analytically when the whole slew fits inside the chunk, and only sub-steps
  (0.25 s) when it does not.
- **Attitude must be updated before thrust, not after.** Running the slew after
  `burnStep` makes the engine use the previous step's pointing, and the solver —
  which assumes the vehicle is pointed — stops predicting the flight. Over an
  800 s Mars injection that lag missed the sphere of influence entirely.
- **Anything that changes vehicle mass changes tested trajectories.** Charging
  0.25 kg of RCS for the slew shifted the Mars injection by 0.047 m/s, and over
  a 259-day transfer that became a **550,000 km miss**. The sensitivity is real
  physics, so the fix was to stop changing the mass. Any future feature that
  touches `craftMass()` during flight must be checked against `deep.test.js`.
- The nose snaps exactly onto the commanded reference once inside tolerance.
  That is deliberate: a tracking lag of even a hundredth of a degree during a
  long burn would quietly move every arrival.

### Carry-over for the launch item

`INRT` (inertial hold) exists and is wired but unused — a pitch program is a
schedule of `INRT` headings, so launch inherits it. What launch still needs:
a pitch *schedule* (altitude/heading pairs) and a guidance loop to fly it.

### Coverage

`tests/attitude.test.js`: starts pointed, holds a rotating reference, a
reversal takes real time and respects the rate limit, a slew spends no
propellant but draws wheel power and stops when settled, ignition waits on
attitude and burns its full duration afterwards, arming commands attitude
immediately and M-01 still lands within a kilometre of its pre-attitude result,
HOLD TGT points at the target, and a dead bus means no attitude control.

---

## Phase 1 — docking mechanics — **DONE**

Capture used to be a radius check: `rg < 20 && rel < 0.30 && lat < 0.10` and the
mission ended. It is now a port, a corridor, an envelope, three possible
outcomes, a hard dock and four utility procedures.

`S.dock` holds it all: `phase` walks `FREE → SOFT → RETRACT → RETRACTED →
LATCHING → HARD`, plus `leg` (the approach leg being flown), the capture
quality, and one sub-object per utility group.

### Decisions taken — the six open questions, answered by the owner

1. **The station is Earth-facing** (nose along its velocity, port facing aft),
   not inertially fixed. The original suggestion here was wrong and the measured
   reason is in the pitfalls below. An approach therefore runs up the velocity
   vector from behind — and a vehicle on that line is in the station's own
   orbit, so it holds position for free. That is what makes a corridor flyable.
2. **A nominal M-03 approach takes 5–8 minutes.** Measured: 8.4 min from the
   rendezvous arrival to soft capture. But docking is deliberately **not
   M-03-only** — the north star is cold start → launch → rendezvous → dock in
   free flight, so it works wherever a station exists. Free flight (mission 0)
   now has one.
3. **Nothing is ever unrecoverable.** Three outcomes: clean capture, crooked
   capture (latched but off-axis; the ring has to pull it straight before the
   latches will close), and a bounce off the ring at e = 0.5 that costs
   propellant and time. An empty RCS tank means drifting, not destruction.
4. **Each utility is a real multi-step procedure**, not one key. This went
   against the implementer's recommendation; the owner chose authenticity
   knowing the tedium risk. Two to four steps each, every step with something
   you can watch: a valve, a pressure climbing, a bus voltage, a flow rate.
5. **M-03 grew from two objectives to four**: inside 30 km → soft capture →
   hard dock → utilities connected.
6. **AUTO DOCK exists but M-03 does not offer it.** The skill is learned by
   hand once; free flight and later missions get the key.

### The single alignment angle

The envelope sketch below originally listed *axial* and *roll* misalignment as
separate limits. This world is planar: there is exactly one rotation angle per
vehicle, so those collapse into one number. As built:

| Quantity | Clean | Marginal | Past the limit |
|---|---|---|---|
| Closing rate | ≤ 0.10 m/s | to 0.15 | bounce |
| Off centre | ≤ 0.10 m | to 0.25 | bounce |
| Lateral rate | ≤ 0.02 m/s | to 0.05 | bounce |
| Nose off axis | ≤ 4° | to 10° | bounce |

Marginal on any of them captures **crooked**: latched, carrying the
misalignment, latches inhibited until `DOCK RETRACT` pulls it straight — and a
crooked interface takes proportionally longer to straighten (55 s vs 28 s in
the suite). Wider than 1.0 m off centre is a fly-past with no contact at all.

### Ports have masts, and that is the point

Both vehicles carry a port on an arm (`PORT_ARM` 2.5 m, `PORT_ARM_STN` 6 m), so
nose angle and port position are coupled: 10° of misalignment swings this
vehicle's port 0.43 m sideways. Without the mast, pointing would be cosmetic.

### The approach is a box, not a straight line

A rendezvous does not leave you on the corridor. Measured from M-03's own
`PLAN RDV` → `PLAN CIRC AP`: the vehicle arrives **56 m ahead of the port and
51 m to one side, 90° off the axis**. So the guidance flies out to the side,
astern to a hold point 35 m out, across to the centreline, then in. The route
never crosses the station's face.

`dockGuide(geometry, leg)` is a pure function returning the commands it would
issue. `dockAutoStep` applies them for AUTO DOCK, the DOCK page prints them as
the flight director for a hand-flying player, and `deep.test.js` drives the
same function step by step — so M-03 can withhold the AUTO key without the test
needing a second controller that would drift out of step with the real one.

### Pitfalls found — worth knowing before touching this again

- **An inertially-fixed station is the HARDER option, not the easier one.** Its
  port sweeps 78° across the relative frame during a 20-minute approach —
  0.065°/s, a full turn every 92 minutes. There is no corridor to fly. An
  Earth-facing station's corridor stands still. Open question 1 originally
  suggested inertial "for the first pass"; that was backwards.
- **Rates must be measured in the PORT's rotating frame, not an inertial one.**
  This was a real bug and cost the most time. The corridor turns with the
  station, so `d(lateral)/dt = dot(Δv, lat) − ω·axial` and
  `d(axial)/dt = dot(Δv, axis) + ω·lateral`. Reported inertially, the lateral
  rate on the page did not match the lateral offset it was supposed to be
  moving — off by ω·axial, which is 13.6 mm/s at 12 m, most of the 0.02 m/s
  clean budget. Capture would have been judged against a rate the interface
  never sees. `tests/docking.test.js` asserts the reported rates equal the
  measured rates of change; keep that assertion.
- **Consequence of the above, and it is good physics:** holding a constant
  inertial velocity slides you across the corridor. Station-keeping costs
  propellant continuously. That is correct and it is what makes the corridor
  require active flying.
- **A leg-selecting controller must latch its leg.** Deciding afresh each step
  chatters: a leg's exit test and the next leg's target disagree by a metre or
  two, orbital drift carries the vehicle back over the boundary, and the
  command flips between 0.8 m/s and 0 m/s. The first version burned all 26 m/s
  of RCS in a limit cycle at 25 m. `dockLeg(g, leg)` only ever moves forward,
  and falls back out of the corridor only for a miss far wider than the one
  that would have stopped it entering.
- **A fixed proportional gain plus a fixed deadband cannot centre the last
  quarter metre.** Near the centreline the commanded lateral rate falls below
  the thruster deadband and nothing corrects: every approach ended on the
  0.25 m limit, with twelve bounces before one happened to fall inside. The cap
  and the deadband both scale with range now, and the time-to-contact is taken
  from the approach *profile*, never from the held command — holding range
  drives time-to-contact to infinity and the lateral command to zero.
- **Inside twelve metres the law stops and centres rather than pressing on.**
  Holding range is much cheaper than a bounce, and it is what a crew does.
- **`advance()`'s chunk is sized for orbits and will step through the
  envelope.** 17.3 s at station altitude is 1.8 m of travel at a docking
  closing rate. There is now a proximity cap inside 500 m bounded by travel per
  chunk (2 m far out, 2 cm at contact) against the *relative speed*, not just
  the closing rate — during a sideways leg the closing rate is zero and the
  cap would not have bitten. Warp is held to 10× inside 500 m as well.
- **Only judge a contact when the vehicle has actually gone by the port.**
  Without a range guard, a rendezvous arriving ahead of the station crosses the
  port *plane* tens of kilometres out and gets told it flew past the ring by
  35 km. There is a regression test for this.
- **`fmtDist` and `fmtVel` cannot express docking.** They render both 0.15 m
  and 0.25 m as "0 m", and 0.03 m/s as "0.0 m/s" — the difference between a
  clean capture and a bounce. `fmtRange` and `fmtRate` exist for the corridor.
- **Mass changes are still the canary.** Propellant transfer changes
  `craftMass()` in flight, which is exactly what constraint 1 warns about. It is
  safe only because it can run only while hard docked, where the vehicle is
  placed on the station rather than propagated. `deep.test.js`'s Moon and Mars
  missions have no station and are untouched — verified, not assumed.
- **O₂ now depletes** (`crew` crew-hours per hour) so the ECLSS hookup has a
  visible consequence. No hazard is attached to reaching zero; adding one would
  belong to item 02. Margins are wide: M-03 uses 10 of 520 crew-hours.

### What the player sees

- `DOCK` (function key) — two sub-pages. **PROXIMITY OPS**: axial range, off
  centre, nose off axis, closing and lateral rate each coloured against the
  clean/marginal/limit bands, ±0.05 m/s axial and ±0.01 m/s lateral pulse keys
  *in the docking-axis frame*, `HOLD DOCK AXIS`, `AUTO DOCK` where fitted, the
  leg being flown and a flight director line that speaks the guidance law.
  **CAPTURE**: interface state, misalignment, the ring gauge, the latch count,
  `RETRACT RING*`, `CLOSE LATCHES*`, `UNDOCK*`.
- `UTIL` — reached by a link from DOCK, not a thirteenth function key (a test
  asserts there are exactly twelve). Four sub-pages:
  - **VESTIBULE**: `EQUALISE*` (101.3 kPa over 90 s, on a gauge) → `LEAK CHECK*`
    (valve shut, 60 s hold; reopening the valve aborts it) → `OPEN HATCH*`.
  - **ELECTRICAL**: `MATE UMBILICAL*` → `CLOSE BUS TIE*`. 2000 W from the
    station, data link up, and your battery stops draining and starts charging.
  - **ECLSS**: `INSTALL DUCT*` (needs the hatch open) → `START FAN*`. Your own
    O₂ stops going down.
  - **PROPELLANT**: `CONNECT LINE*` → 30 s purge → `START TRANSFER*` (needs the
    bus tie: the pumps run off the station). 0.5 kg/s into the main tank, then
    RCS, stopping itself when both are full.
- `HOLD DOCK` points the nose down the station's port axis (attitude mode
  `PAXS`). The station's 0.065°/s rotation is nothing to a 4°/s autopilot.
- The proximity scope draws the port, its axis, the corridor cone and the nose.
- While mated the main engine and RCS translation are both inhibited.

### Coverage

`tests/docking.test.js` (new, 60 checks): port geometry and exact placement;
reported rates equal measured rates of change; the clock cannot step through
the envelope and warp is held down; clean capture, too fast, too misaligned,
too much lateral rate, and a fly-past; crooked capture carries its
misalignment, the latches refuse, retraction straightens it and costs more time
than a clean one; mated the vehicle is carried round the orbit and both
engine and RCS are inhibited; every utility refuses out of order; pressurisation
takes clock time and the leak check can be aborted; the power tie stops battery
drain *in eclipse* and charges instead; the fan stops O₂ drain; the transfer
refuses without the bus, fills both tanks, and tells a full vehicle there is
nothing to move; undocking; an empty RCS tank drifts rather than dying; AUTO
DOCK refused in M-03 and flying a clean capture in free flight; the formatters;
the pages.

`tests/deep.test.js` M-03 now flies the real guidance law from the rendezvous
arrival through capture, hard dock and all four utilities. `physics.test.js`
gained the M-03 RCS budget, the corridor rotation rate and the contact-rate
profile. `layout.test.js` walks DOCK and all four UTIL sub-pages at 375×667 and
390×844 checking for clipping and horizontal scroll.

Measured on the M-03 flight: **8.4 min, 0 bounces, 4.3 m/s of RCS spent of the
26.5 m/s aboard, captured 0.02° off axis and 0.022 m off centre.**

---

## What is left

- **Free flight has a station; the scripted missions other than M-03 do not.**
  Adding one elsewhere is one line (`S.objects = [ makeStation(...) ]`) — item
  04 should decide which missions want one.
- **Undocking is minimal**, as recommended: `UNDOCK*` safes the hatch and the
  utilities itself and gives a 0.10 m/s separation push. There is no departure
  procedure and no corridor-clearing objective. Fine for now.
- **The station is a point with a port.** It has no structure to collide with
  other than the 1.0 m ring, no mass, and only one port.
- **The leak check's 60 s hold is the one step that is a timer rather than a
  procedure** — Δ reads 0.0 kPa throughout and the only interaction is the
  abort. Flagged to the owner rather than silently simplified. The `INSTALL
  DUCT*` step is the next thinnest: its only consequence is enabling the fan.
- **`INRT` is still unused**, waiting for the launch item's pitch schedule.

---

## Original design notes (kept for reference)

### Where docking was before this (superseded)

Docking is a proximity check with no mechanism behind it.

- `targetRel()` returns relative position and velocity to the target.
- `cmdTrans(A)` applies an **instantaneous** RCS impulse along a line-of-sight
  frame: `TGT | AWAY | PORT | STBD | PRO | RET | NULL`. `TRANS NULL` cancels all
  relative motion in a single pulse.
- RCS budget is Tsiolkovsky on `S.craft.rcs` / `rcsIsp`; M-03 carries ~22 m/s.
- **Capture is automatic** the instant three numbers are simultaneously true —
  M-03 objective 2, currently:
  ```js
  rg < 20 && rel < 0.30 && lat < 0.10      // metres, m/s, m/s
  ```
  There is no port, no alignment, no latching, and nothing after capture.
- The scope switches to a relative view inside 30 km (`proxMode` in `draw()`).
- The `DOCK` page shows range, closing rate, lateral rate, RCS ΔV and pulse keys.

### What the user asked for

> Instead of auto capture when 20m apart, lets make it realistic. Proper
> approach all the way until capture, imperfect captures, the need to circle
> air, connect electrical, environment, fuel systems etc…

Read as four separate pieces:

1. **A real approach corridor** — not a radius check. Approach along the target
   port's axis, inside an angular corridor, within a closing-rate profile.
2. **Capture quality** — soft capture can be off-centre, off-axis or too fast.
   A bad one is not a pass/fail; it is a capture with a misalignment you then
   have to correct, or a bounce-off that costs propellant.
3. **Hard dock** — latches, then the physical connection.
4. **Post-dock utility hookup** — pressurise the vestibule ("circle air" is
   almost certainly *equalise/circulate air*), then electrical, ECLSS, fuel
   transfer. Each with its own state, preconditions and failure modes.

### Design sketch as originally written

> Superseded by "The single alignment angle" above: this world is planar, so
> the axial and roll misalignment rows below are one number, and the numbers
> that shipped differ from the sketch.


**Ports.** Give both vehicles a port: an offset from the centre of mass and an
outward axis in body frame. Alignment error is then the angle between the two
port axes, and lateral offset is the miss distance of the two port centres.

**Capture envelope** (numbers to argue about at kickoff, loosely Apollo/IDSS):

| Quantity | Nominal | Marginal | Fail |
|---|---|---|---|
| Closing rate | 0.03–0.10 m/s | to 0.15 | > 0.15 bounce |
| Lateral offset | < 0.10 m | to 0.25 | > 0.25 miss |
| Lateral rate | < 0.02 m/s | to 0.05 | > 0.05 bounce |
| Axial misalignment | < 4° | to 8° | > 8° miss |
| Roll misalignment | < 4° | to 10° | > 10° latches fail |

**Sequence to model:** station keeping → approach corridor → soft capture →
retract/align → hard dock (latches) → pressurise vestibule → hatch → utilities.

**Utilities as real state,** each needing the previous: `LATCHED → VESTIBULE
PRESSURISED → HATCH OPEN`, and independently `POWER TIE`, `DATA`, `ECLSS`,
`PROP TRANSFER`. Power tie should actually matter — tie to the station and the
vehicle's own battery drain stops.

### Open questions as originally written — all six now answered above

> Note on question 1: the suggested answer below is **wrong** and was corrected
> at kickoff. Inertially fixed is the harder option, not the easier one.

1. **Does the station rotate, or is it inertially fixed?** A rotating target
   means matching its rate, which is a large step up in difficulty. Suggest
   inertially fixed for the first pass.
2. **How punishing is a failed capture?** Bounce-off with a velocity change and
   a propellant cost, or damage/mission loss? Suggest bounce-off, always
   recoverable while RCS remains — running the tanks dry is the real failure.
3. **How much of the utility hookup is interactive** versus a single `CONNECT
   UTILITIES*` key? There is a real risk of it becoming tedious button-pushing.
   Suggest each utility is one key with a precondition and a visible consequence,
   not a multi-step procedure each.
4. **Is undocking and departure in scope?** Suggest yes, minimally — latches
   release, a separation pulse, and clear of the corridor.
5. **Does the existing RCS budget survive this?** M-03 has ~22 m/s. A real
   corridor approach with alignment will cost more. Expect to re-balance, and
   expect `deep.test.js`'s docking autopilot to need rewriting.
6. **Manual or assisted?** A `DOCK AUTO` that flies the corridor would be
   authentic (Kurs/AR&D do exactly this) and a mercy on a phone. Suggest
   building manual first, then an autopilot that uses the same inputs.

### Code this touches

- `cmdTrans` — impulses may need to become finite RCS burns.
- `targetRel`, `PAGES.DOCK`, `drawProximity` in the scope renderer.
- M-03's objectives, and its craft's RCS budget.
- `tests/deep.test.js` — its docking autopilot will not survive unchanged.

### Definition of done — met

- Capture is earned by flying a corridor, not by entering a radius.
- A marginal capture produces a marginal outcome, not a binary pass.
- Utilities are state with preconditions and visible effects.
- New CDU page(s) for approach and for utilities, reachable by key.
- New suite: a nominal approach captures; too fast bounces; misaligned misses;
  utilities refuse out of order; power tie stops battery drain.
- Attitude suite: slew reaches the commanded attitude, respects its rate limit,
  spends the expected propellant, and a burn armed at a node still ignites on
  time — lunar and Mars arrivals unchanged.
- All seven existing suites pass.
