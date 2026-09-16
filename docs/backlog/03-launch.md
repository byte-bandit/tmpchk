# 03 — Launch from Earth

**Status:** not started
**Depends on:** 01 (attitude lands there) and 02 (the pad state)

Split from cold start by decision; that half is now item 02.

## Where it is today

Every mission begins in flight with systems already running.

- `loadMission()` calls `rig({...})` then `setOrbit(...)` or `setHelio(...)`,
  so the vehicle is placed directly on a trajectory. M-01 starts at MECO,
  182 km up and already moving at 7.5 km/s.
- Systems boot configured: `S.loads = { HEAT:true, COMM:true, SCI:false }`,
  battery full, arrays deployed, hull at 20 °C. Nothing has to be turned on,
  and nothing can be turned on in the wrong order.
- **There is no launch.** No atmosphere force, no staging, no throttle, no
  launch site, no rotating planet.
- `BODIES.EARTH.atmo = 140` is only a warning threshold in `checkHazards`.
  **Drag is not simulated at all** — a periapsis inside the atmosphere simply
  triggers a caution, and impact is a radius check.

## What the user asked for

> cold start, setting up and configuring all systems, launch from earth, roll
> programs, etc…

The launch half (cold start is item 02):

Sit on the pad, ignite, clear the tower, roll onto the flight
azimuth, pitch over, stage, and shut down at a target orbit. Requires physics
the game does not have: atmospheric density, drag, dynamic pressure, thrust
varying with ambient pressure, staging, and throttle.

This is the largest single piece of new physics in the backlog.

## What launch actually needs

- **Atmosphere:** exponential density `ρ = ρ₀ exp(-h/H)`, Earth H ≈ 8.5 km,
  ρ₀ = 1.225 kg/m³. Cheap and good enough.
- **Drag:** `F = ½ ρ v² Cd A`, opposing velocity. Needs `Cd·A` per vehicle.
- **Max Q:** dynamic pressure `q = ½ρv²` peaks around 11-14 km. A real
  constraint worth showing and worth throttling for.
- **Thrust vs altitude:** sea-level versus vacuum Isp, roughly linear in ambient
  pressure. Makes first stages behave correctly.
- **Staging:** `S.craft` is currently one stage. Needs a stack, each with its
  own dry mass, propellant, thrust and Isp, and a `STAGE` command.
- **Throttle:** currently binary. Needed for max-Q throttling and for landing.
- **Launch site and planet rotation:** a surface launch starts with the planet's
  rotational velocity (465 m/s at Earth's equator). In a planar sim this is a
  free boost in the prograde direction and worth including.
- **Gravity turn:** the pitch program. This is where item 00 is load-bearing.

## Open questions

1. **Is the pitch program flown or scripted?** Real options: (a) the player
   commands pitch at intervals, (b) they enter a program (altitude/pitch pairs)
   and the guidance flies it, (c) a single `LAUNCH` that flies a canned profile.
   (b) is the most authentic and the most interesting on a phone. Suggest (b),
   with (c) as a fallback for players who want to skip it.
2. **Does ascent need drag losses to be *accurate*, or just present?** Accurate
   means ~1,500-2,000 m/s of gravity and drag losses on a real ascent, so a
   9.4 km/s launch reaches a 7.8 km/s orbit. Suggest aiming for that ballpark so
   the budget teaches something true.
3. **Does drag apply retroactively to existing missions?** M-01 starts with
   periapsis 900 km below the surface; with drag modelled it would now decay
   during the coast. That changes a tested trajectory. Suggest drag is only
   active below ~140 km and verifying M-01 is unaffected — it starts at 182 km.
4. **Which missions get a launch?** Retrofitting M-01 changes the tutorial
   substantially. Suggest launch is a *new* mission ahead of M-01, leaving the
   existing ladder intact.

## Risk

Question 3 is the one to watch. Adding any force to `advance()` that acts during
normal flight risks perturbing the nine tested missions. Drag must be strictly
bounded by altitude, and `physics.test.js` plus `deep.test.js` must be run before
and after to prove the existing trajectories are untouched.

Also note: drag is not conservative, so the exact Kepler propagation cannot be
used while it acts. The powered/atmospheric phase needs numeric integration
(`burnStep` already does RK4 — extend that path rather than the Kepler path).

## Definition of done

- Atmosphere, drag and max-Q, active only in the atmosphere, with the existing
  missions proven unchanged.
- Staging and throttle.
- A launch that reaches orbit with realistic losses.
- New suite: drag acts only below the line and existing trajectories are
  bit-for-bit unchanged; a scripted ascent reaches a target orbit within a
  realistic ΔV budget; staging and throttle behave.
- All existing suites pass, with lunar and Mars arrivals unchanged.
