# 01 — Realistic docking and berthing

**Status:** phase 0 done, docking mechanics next
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

## Phase 1 — where docking is today

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

## What the user asked for

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

## Design sketch

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

## Open questions

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

## Code this touches

- `cmdTrans` — impulses may need to become finite RCS burns.
- `targetRel`, `PAGES.DOCK`, `drawProximity` in the scope renderer.
- M-03's objectives, and its craft's RCS budget.
- `tests/deep.test.js` — its docking autopilot will not survive unchanged.

## Definition of done

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
