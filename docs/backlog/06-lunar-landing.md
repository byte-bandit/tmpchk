# 06 — Lunar landing from a mothership

**Status:** done — flown end to end, sixteen phases, pad to splashdown
**Depends on:** 04 (phases and checkpoints), and item 01's docking

The third full-arc mission:

> start cold dark, launch, burn for moon, orbit moon, detach lander, land on
> moon

## The shape of it, as decided

The game has **one active vehicle**. `S.craft` is the ship; `S.objects` are
passive point masses propagated by `stepObject` with no systems, no propellant
and no attitude. A lander that separates while the mothership waits in orbit
would normally mean two fully simulated vehicles — the largest architectural
change in the backlog.

The decision taken with the user avoids that entirely:

**On separation the mothership becomes a docking target.** It turns into
exactly what CERES already is — a passive object carrying a port — and the
player flies the lander. Descend, land, lift off, rendezvous, and re-dock with
it. Item 01's corridor, capture envelope, ring, latches and utilities all apply
unchanged, and the hardest part of the mission becomes something the game
already does well.

What that needs:

- A separation that swaps the active vehicle for the lander and leaves the
  mothership behind as an object with a port and an orbit. `makeStation` is the
  shape to follow; the mothership is a station that happens to be yours.
- The lander is its own `rig()`: its own dry mass, propellant, thrust, Isp,
  RCS, crew and consumables. Staging (item 03) already models a descent stage
  left on the surface, which is exactly right for the ascent.
- Re-docking has to hand control back, and the mothership's own consumables
  have to have been ticking over while you were away — it is not in stasis.

## What already exists

- **M-06 lands on the Moon** and is flown to touchdown in the test suite, so
  the descent, the retrograde brake, the descent-rate and lateral-drift
  readouts and the touchdown limits are all built and proven.
- Launch, cold start, translunar injection (`PLAN XFER MOON`, measured to a
  708 × 823 km capture) and lunar orbit insertion all exist.
- Docking works wherever a station exists, not only in M-03.

So this mission is mostly assembly — the one genuinely new mechanism is the
separation and the vehicle swap.

## The interesting part

An ascent from the surface to a rendezvous is the one thing in the game that
punishes a bad launch *time* rather than a bad burn: lift off at the wrong
moment and the mothership is on the far side of the Moon. Item 03 built a
phasing readout for CERES on the LAUNCH page; the same idea belongs here, and
it is the reason this mission is not just M-06 with extra steps.

## Risks

- **Two sets of consumables.** The mothership keeps breathing and drawing power
  while the lander is away. A crew split across two vehicles is the kind of
  thing that is easy to get silently wrong — measure both.
- **The swap must not leak state.** `S.craft`, `S.sys`, `S.power`, `S.therm`,
  `S.dock` and the attitude all belong to whichever vehicle is active. A
  separation that carries the mothership's battery charge into the lander would
  be invisible and wrong.
- **Re-docking with a moving target in lunar orbit** is item 01's code in a
  place it has never run: different `mu`, no atmosphere, a much shorter period.
  Worth flying before trusting.
- M-06 is flown to touchdown in the existing suites. Do not disturb it.

## Definition of done

- Separation leaves the mothership in orbit as a dockable object with its own
  state, and hands the player the lander.
- Descent and landing reuse M-06's proven path.
- Ascent, phasing, rendezvous and re-dock, with control handed back.
- Both vehicles' consumables tracked independently and measured.
- The mission flown end to end headlessly: dark pad → launch → translunar →
  lunar orbit → separate → land → lift off → re-dock.
- M-06 unchanged; all existing suites pass.


---

## What shipped, and what had to be measured to ship it

M-12 TRANQUILLITY RUN, mission id 13, sixteen phases: dark pad → launch →
parking orbit → CERES → refuel → translunar → lunar orbit → **separate** →
descent → surface work → **ascent on a window** → re-dock → injection home →
Earth capture → entry → splashdown. Flown headlessly in `tests/lunar.test.js`,
which is the acceptance test; the suite around it is not.

### Measured, flown

| | |
|---|---|
| Whole flight | **MET 010:14:38:50**, sixteen phases, 3 crew, 300 kg of samples in the water |
| Depot | 14,000 kg at CERES, drawn to 2,475; the ship launches with 2,000 kg and fills to 13,000 |
| Lunar arrival | 887 km periapsis after `PLAN TRIM MOON`, into a 102 × 102 km orbit |
| Lander | separates with 2,161 m/s + 50 m/s RCS; lands with 171 kg in the descent stage |
| Surface | 300 kg of samples, and going outside costs 1.9 crew-hours of reserve |
| Ascent | on the window: 104 × 106 km, and 238 m/s of RCS still aboard |
| Re-dock | closed from 2,005 m, crew and samples back across, control handed back |
| Injection home | `PLAN TEI` → 291 km perigee from a 435,000 km apogee |
| Entry | peak **361 kW/m² (0.86×)**, 63.1 MJ/m² of 90 spent, 365 kg of propellant left |

### The three things that were not assembly

**1. The entry does not close directly, and that decided the mission.** A lunar
return arrives at 10.96 km/s inertial, **10.50 km/s air-relative**. Measured
with the limits lifted so the peaks are real rather than the value at which the
flight terminated: aim −40 km peaks at **1,433 kW/m² — 3.41× the shield's rate
limit**; +40 km at 2.61×; +80 km at 1.63× with 0.95 of the budget gone; and by
+95 km, where the rate is finally survivable at 0.92×, the budget needs
**2.19×** what the shield holds. The two limits cross past each other, a
blunter airframe changes nothing, and the mechanism is that the rate limit is
reached at **95 km altitude**, before the vehicle has decelerated at all.
Aiming cannot open a corridor that speed has already closed.

So the mission stops first. `PLAN APO 400` at perigee, about 3.0 km/s, then the
entry is M-10's — and the band published for SELENE-3 is **−20 to +80 km**,
measured on this airframe from this orbit (0.76–0.93× on rate, 0.62–0.91× on
budget across it). Nothing about the shield was widened.

**2. There was no way home from a moon.** `PLAN XFER EARTH` refuses correctly —
EARTH does not orbit MOON — and `PLAN ESC` solves only the size of the burn and
fires it at the lunar periapsis, an arbitrary point: flown, it throws the ship
onto a 344,354 × 1,229,412 km orbit, apogee past Earth's own sphere of
influence. Measured, at a fixed 750 m/s escape impulse the geocentric perigee
runs **358,830 km at one point in the orbit and 10,477 km 140° later**. WHERE
it is lit is the manoeuvre. `PLAN TEI` is the new solver: it scans the orbit
for the departure point, then sizes the burn to put the parent-body perigee on
an aim point. About 790 m/s from a 100 km lunar orbit.

**3. The swap.** `SEP` stashes every vehicle-owned key — `craft`, `sys`,
`power`, `therm`, `dock`, `att`, `loads`, `shield`, `chute`, `pad`, `throttle`,
`fairing`, `landingAllowed`, `manifest`, `surf`, `landed` — into a bag, turns
the mothership into an object with a port, and rigs the lander. `DOCK CREW`
does the reverse. The ship left behind is stepped by **wearing it for one step
and taking it off again**, so it is simulated by exactly the code that
simulates the one you are flying: measured, it crosses 40.6% of every orbit in
shadow, its battery works for a living, and left with its loop off it dies and
takes the mission with it.

### Two bugs this found

- **`ignite()` weighed every vehicle at Earth's gravity**, on every body. A
  15 kN engine under a 2,560 kg lander — a lunar thrust-to-weight of 3.62 — was
  refused as "15 kN against 25 kN of vehicle". Now weighed on the body it is
  standing on; M-00, M-10, M-11 and FREE all lift off bit-for-bit as before.
- **A vehicle waiting for its nose does not move.** `burnStep` returns before
  propagating while `attError()` is over tolerance, so an immediate `BURN`
  issued while pointing the wrong way freezes the ship in space for the length
  of the slew while the clock and every other object keep running — measured at
  3° of phase angle for one 180° turn. **Not fixed**: M-06's pinned descent is
  flown with exactly these commands, so the fix would move a tripwire. It is
  written up for the owner instead.

### Sized against the flown profile

- The mothership is **nuclear**: the ladder is TLI 3,145 + lunar capture and
  descent to 100 km 964 + injection home 790 + Earth capture 2,705 + deorbit 54
  = **7,658 m/s**, carrying a 7.9 t lander through the first two. At isp 315
  that is a 51 t tank on a 3 t ship. At 900 it is 13 t on a 4.2 t ship.
- **600 kg of RCS**, not 300: at 14 t all-up, 300 kg is 45 m/s and the CERES
  approach alone needs most of it. Phasing on a heavy ship is main-engine work.
- **The lander carries 2,000 Wh**, not 900. It draws 340 W on the surface, the
  window comes round every 118 minutes, and 900 Wh is 2.6 hours of that — it
  died on the pad in a headless flight. Lunar night is 13.7 days and no battery
  covers it: land in daylight.
- The count is **ten minutes** long, so it is resumed ten minutes before the
  window, not at it.
