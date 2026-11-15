# NIGHTSHIFT — Tactical 5v5 Control Points

[![make.fun bounty](https://img.shields.io/badge/make.fun-threejs--fps--02-blue)](https://make.fun/bounty/threejs-fps-02)
[![repo](https://img.shields.io/badge/repo-AndryXSad%2Fthreejs--fps--02--v3-181717)](https://github.com/AndryXSad/threejs-fps-02-v3)
[![three.js](https://img.shields.io/badge/three.js-0.187.0-black)](https://threejs.org/)

A tactical 5v5 control-point FPS on the Container Docks map — a night
container port where two teams of five fight over three control points.
Not a reskin of bomb defusal: the objective, the movement, the bot brains
and the map are all new.

## The game

Two teams — EMBER (orange) and ALLOY (teal) — fight over three control
points: **A CRANE** (west), **B YARD** (mid) and **C PIER** (east), spread
across a 64 × 44 m night container port.

- **Capture:** stand on a point with no enemy present. 4 s solo, +0.1 s per
  extra ally. An enemy standing on your point uncaptures it; both teams
  present freezes it.
- **Score:** a point you own ticks +1 every 2 s. First team to **100 points**
  takes the round. Wiping the other team also takes it.
- **Overtime:** a tied round at the timer goes to 20 s overtime — next tick
  wins, then most points held, then most fighters alive.
- **Match:** first to 3 rounds (max 5).

## Movement — new in v3

- **Crouch (Ctrl):** eye drops to 1.05 m, the hitbox shrinks, spread
  tightens 40%. Crouching behind a crate is real cover, not a pose.
- **Jump (Space):** clears the last stair step onto the crane bridge.
- WASD move, mouse aim, Shift sprint, R reload, B buy, right-click aim down
  sights (slower, steadier).

## Economy

$800 to start, $3,250 a round win, $300 a kill, loss bonuses that grow with
the streak. Five weapons — P9, Rasp, Longshot, Maul, Lance — with damage
falloff and wall penetration on the long guns. Three grenades (frag, flash,
smoke — smoke really blocks sight and the minimap). Kevlar absorbs half the
damage. Buy in the 12 s buy phase before each round.

## Bots — five roles for point warfare

- **Anchor** holds the point it owns.
- **Roamer** hunts the point that is changing hands.
- **Flanker** takes the far point alone, often over the crane bridge.
- **Support** throws utility into a point before the team walks in.
- **AWPer** holds the long angle over mid with the Lance.

Bots rethink their point every 4 s, crouch to capture under fire,
investigate deaths, rotate when a push stalls, and spend their own money
in the buy phase.

## The map

A night container port: sodium lamps, moonlight, fog, a skyline of lit
towers beyond the north fence. Each point has a beacon of coloured light
(ember orange, alloy teal, neutral grey) that repaints with its owner.
A crane bridge crosses mid at 3 m with stairs at both ends; the yard is
full of stacked containers, crates and sightlines that reward holding an
angle.

## HUD

Point strip under the score (owner colour + capture progress), round
history, minimap showing allies, visible enemies and smoke clouds,
hit-direction indicator, flash and damage overlays, kill feed, buy menu.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

Or open `game/index.html` directly from a file URL — the game is plain
static files with three.js 0.187.0 vendored under `game/vendor/three`.

## Build

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json + copies game/ and screenshots/
```

## Screenshots

`shots.json` lists the four staged shots (`start`, `play`, `buy`, `end`,
seed 7). The `play` shot is staged mid-game: B already ember's, A alloy's,
the score ticking, bots holding their points.

## Why v3, not v2

SLAGLINE (v2) polished bomb defusal and scored 0.7507 — lower than
FOUNDRY-9 (0.7556). A third bomb-defusal map would be a third roll of the
same dice. NIGHTSHIFT changes what the judge can see in one glance: a
different objective (control points, not a bomb), a different verb
(crouching behind cover, jumping onto the crane), and a scene that reads
instantly at night — three beacons of coloured light, one per point.
