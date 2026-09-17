# 06 — Lunar landing from a mothership

**Status:** not started
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
