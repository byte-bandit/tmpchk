# 03 — New missions

**Status:** awaiting examples from the user
**Depends on:** 01 and 02 for anything involving docking or launch

## Where it is today

Ten entries in `MISSIONS` (script 7): M-01 orbital insertion, M-02 orbit
raising, M-03 rendezvous and dock, M-04 lunar flyby, M-05 lunar orbit, M-06
lunar landing, M-07 Earth escape, M-08 Mars transfer and capture, M-09 sundive,
plus FREE flight.

A mission is a plain object:

```js
{
  id, code, name,
  brief: ['paragraph', 'paragraph'],   // free text, wraps on the MSN page
  hint: 'PLAN CIRC AP',                // shown as PROCEDURE
  setup() { rig({...}); setOrbit(...); /* S.power, S.thermLimit, flags */ },
  obj: [ { text, check: (S, D) => bool } ],
}
```

`check` runs about once per simulation chunk. Objectives latch when met and the
mission completes when all have latched.

## What is needed before this item can start

The user's examples. Each new mission needs, at minimum:

- What the vehicle is doing at t=0 and where.
- What the player has to achieve, expressed as something checkable from `S`/`D`.
- What makes it *interesting* — the constraint that makes it more than a repeat
  of an earlier mission.

## Things worth knowing when writing one

- **ΔV budgets must be verified, not guessed.** `physics.test.js` checks every
  mission is solvable with the propellant it carries. Four of the nine were
  unflyable on first write and were caught only by that test.
- **The planar constraint rules some things out.** No plane changes, no
  inclination, no polar orbits, no launch-window geometry that depends on
  inclination.
- **Transfers to a body need the encounter targeter**, not a textbook Hohmann;
  aiming at a body's orbital radius is a collision course.
- **Available bodies:** Sun, Earth, Moon, Venus, Mars. Venus is defined and
  reachable but no mission uses it. Adding a body is a few lines in `BODIES`
  plus a `phase0` chosen so a window opens at a sane time.
- **Mission completion pauses the clock** but no longer cuts a running burn.
- Objectives should be checkable without ambiguity. `d.e.e < 0.03` is good;
  "fly a good approach" is not, unless 01 gives it a real definition.

## Candidate directions (unconfirmed — the user's list supersedes these)

- A launch mission, once 02 lands.
- A station resupply that requires docking *and* a propellant transfer, once 01 lands.
- Venus — the only defined body with nothing to do.
- A rescue: reach a target in a decaying orbit before it re-enters.
- A comms or power constrained mission where eclipse and battery drive the plan.
- A free-return abort: something fails mid-transfer and you fly home.

## Open questions

1. What are the examples?
2. Do they extend the existing ladder (M-10 onward), or slot into it?
3. Should any of them be *hard* — no procedure hint, failure likely first time?
4. Is a mission allowed to start mid-emergency (an abort scenario)?

## Definition of done

- Each new mission has verified ΔV margin in `physics.test.js`.
- Each is flown to completion headlessly in `missions.test.js` or `deep.test.js`.
- Each has a briefing and a procedure line.
- All existing suites pass.
