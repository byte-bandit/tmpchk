# 00 — Vehicle attitude model

**Status:** proposed, needs a decision before 01 or 02 start
**Why it exists:** items 01 and 02 both need it, and building it twice would be worse.

## The problem

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

## What to build

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

## Open questions

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

## Risk

Question 3 is the one that can break things. Nine missions and three suites
depend on burns igniting at a precise time — `deep.test.js` asserts a lunar
arrival periapsis that moves ~20,000 km per second of ignition error. Any
attitude settling that delays ignition must be accounted for in the solver, not
bolted on afterwards.

## Definition of done

- `S.att` is real state, integrated in `advance()`, costing propellant if q1 says so.
- `thrustDir()` reads attitude.
- Scope marker shows commanded vs actual attitude.
- All seven existing suites still pass, with lunar and Mars arrivals unchanged.
- New suite: slew reaches the commanded attitude, respects the rate limit,
  spends the expected propellant, and a burn armed at a node still ignites on time.
