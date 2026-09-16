# 01 — Realistic docking and berthing

**Status:** not started
**Contains:** the attitude model (phase 0 below) — an approach without alignment is not a docking


## Phase 0 — attitude (scoped to what docking needs)

Decided: attitude is built here rather than as a separate item, scoped to
docking's needs, and extended later when launch needs a pitch program. Build
only what alignment requires; resist generalising ahead of the launch item.

### The problem

There is no attitude state in the simulation. The vehicle is a point mass. What
looks like pointing is actually a direction *derived* from the trajectory:

```js
function thrustDir(mode) {
  const vhat = V.unit(S.v), rhat = V.unit(S.r);
  switch (mode) {
    case 'PRO':  return vhat;            // along velocity
    case 'RET':  return V.mul(vhat, -1);
    case 'ROUT': return rhat;            // away from the primary
    case 'RIN':  return V.mul(rhat, -1);
  }
}
```

`S.att` exists and is set by `HOLD`, but nothing reads it — thrust direction
comes straight from `S.burn.dir`. So the vehicle can change "orientation"
instantly and for free, and cannot be pointed anywhere that is not one of those
four trajectory-relative directions.

That is fine for the orbital mechanics the game has now. It blocks:

- **Docking** — alignment with a port, roll to match a target, approach along a
  port axis rather than a line of sight.
- **Launch** — a pitch program is *by definition* a commanded attitude that
  differs from prograde.
- **Landing** — currently flown on a retrograde hold, which works but is a
  coincidence of the geometry rather than a choice.

### What to build

Planar, so attitude is one number: a heading angle θ in the same inertial frame
as `S.r` / `S.v`. Suggested state:

```js
S.att = {
  theta: 0,        // rad, inertial heading the nose points
  rate: 0,         // rad/s
  mode: 'PRO',     // PRO | RET | RIN | ROUT | HOLD | TGT | ANTI-TGT | INERTIAL
  target: null,    // commanded theta when mode is INERTIAL
};
```

Then:
- An autopilot slews toward the commanded attitude at a finite rate, with a
  maximum rate and acceleration set by the vehicle's RCS authority.
- `thrustDir()` returns the *attitude* vector, not a trajectory-derived one.
- Existing modes keep working by continuously recomputing the commanded θ.

### Attitude open questions

1. **Does attitude cost RCS propellant?** Realistic (and makes a sloppy docking
   approach expensive), but adds a failure mode where you cannot turn. Suggest:
   yes, but cheap, with a separate small budget.
2. **How fast should it slew?** A real spacecraft takes 30-90 s for a large
   reorientation. At 10× warp during a burn that is invisible; at 1× during
   docking it is the whole game. Suggest a per-vehicle `slewRate` around
   2-5 °/s.
3. **Do existing burns need to wait for attitude?** If a burn commands PRO and
   the vehicle is pointing anti-normal, does ignition wait for the slew? Real
   answer: yes. Risk: every armed burn in the existing nine missions now has a
   settling time, which shifts the tested ignition points. Suggest arming
   triggers the slew early so ignition timing is unchanged.
4. **Is attitude shown on the scope?** The craft marker currently points along
   velocity. Making it show real attitude is a small renderer change and a large
   readability win.

### Attitude risk

Question 3 is the one that can break things. Nine missions and three suites
depend on burns igniting at a precise time — `deep.test.js` asserts a lunar
arrival periapsis that moves ~20,000 km per second of ignition error. Any
attitude settling that delays ignition must be accounted for in the solver, not
bolted on afterwards.


### Carry-over for the launch item

Launch needs commanded attitude that is independent of both the trajectory and
any target — a pitch program is a schedule of absolute attitudes. If the
`INERTIAL` mode above is built now, launch inherits it for free. If it is cut to
save time, note that here so the launch item knows it is owed.

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
