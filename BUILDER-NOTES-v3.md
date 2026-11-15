# NIGHTSHIFT — threejs-fps-02 v3 builder notes

## The direction, and why this one

SLAGLINE (v2) polished bomb defusal and scored **lower** than FOUNDRY-9
(0.7507 vs 0.7556). A third bomb-defusal map would be a third roll of the
same dice. v3 changes the game the judge can see in one glance:

**Control points, not a bomb.** Three points — A CRANE, B YARD, C PIER —
across a 64 × 44 m night container port. Stand on a point unopposed to
capture it (4 s solo, faster with allies); an owned point ticks +1 every
2 s; first to 100 takes the round, or wipe the other team. Tied rounds go
to a 20 s overtime. First to 3 rounds takes the match.

Why this direction, against the judge's own criteria (RULES.txt):

- **Criterion 2 (gunplay & movement) names *crouching* explicitly** — and
  neither v1 nor v2 had it. v3 has it, and it is real: eye 1.6 → 1.05 m,
  hitbox shrinks (verified: a ray at 1.5 m hits a standing fighter and
  misses a crouched one), spread tightens 40%. Crouching behind a crate is
  cover, not a pose. Jump (Space) is new too — it clears the last stair
  step onto the crane bridge.
- **Criterion 3 (tactics) wants an objective other than killing.** The bomb
  was used twice already. Control points are a different objective with a
  different verb: hold ground, rotate, retake — and the bots are built for
  it (five roles: anchor, roamer, flanker, support, AWPer; rethink every
  4 s; crouch to capture under fire; investigate deaths; rotate when a
  push stalls).
- **Criterion 4 (map & look) wants a scene that reads at a glance.** Night
  does that: sodium lamps, moonlight, fog, a lit skyline — and three
  beacons of coloured light, one per point, that repaint with the point's
  owner (ember orange / alloy teal / neutral grey). The point strip under
  the score shows the same state in the HUD. One look tells you the game.
- **Criterion 1 (complete game)** is unchanged in shape — buy, live,
  overtime, match end, HUD, kill feed, minimap — but the loop is driven by
  the points, not a bomb timer.
- **Criterion 5 (code):** one module per job, fixed-step sim (points.js,
  rounds.js, bots.js) separate from rendering (main.js), no new objects in
  the hot loop (beacon colours prebuilt, one shared Box3 probe).

One direction, done fully. No half-finished variants.

## What is new vs v2

- `points.js` (new): capture state machine — contest freezes, uncapture
  unwinds, +1 tick / 2 s per owned point, overtime tiebreaks.
- `rounds.js` (rewritten): no bomb; rounds end on 100 points, elimination,
  or the clock (higher score wins, tie → overtime → zones, then fighters).
- `map.js` (rewritten): Container Docks — 57 colliders, crane bridge over
  mid (deck y=3.0, 9-step stairs both ends), 26-node waypoint graph, ring
  of crates at B, skyline + moon, beacons (ring + beam + letter glyph +
  glow light).
- `bots.js` (rewritten): 5 point roles, `pickPoint` (enemy-capturing point
  first, then nearest unowned, then nearest), crane routing (anchor/roamer
  ~35% crane, AWPer holds craneMid), capture stance (stand + crouch on the
  point), utility thrown into the point before the team walks in.
- `main.js` (rewritten): crouch/jump physics + step-up + gravity, point
  strip HUD, beacon repaint, timer, `window.__nightshift` debug handle.
- `hud.js` (rewritten): point strip (owner colour + capture bar), minimap
  with points + smoke clouds, round history, no bomb/plant UI.
- `combat.js` (kept, fixed): rayFighter hitbox scales with fighter height;
  burst/muzzle/flash/step restored to the v2 originals after a from-memory
  rewrite diverged (verified line-by-line against repo-v2).
- Kept from v2 unchanged in behaviour: 5 weapons + falloff + penetration,
  3 grenades (smoke really blocks sight), economy, viewmodel, textures
  (new night palette + container/NS-07 stencils).

## Validation (all run in this session)

**Headless sim (`sim-v3.mjs`, NOT shipped): 20/20 PASS**, 360 s, 3 rounds.
- Static: 57 colliders; waypoint graph fully connected 26/26; crane route
  via stairs (`stairW>stairTopW>craneW>craneMid`); falloff 1.0 near /
  0.933 far; longshot penetrates a 1 m wall, rasp does not, longshot stops
  at a 3 m wall; crouch hitbox test (see above).
- Forced crane climb: bot reaches deck y=3.20, route 14/14.
- Full match: 3 rounds ended, 8 captures, **maxScore 103 — a round was
  won on points, not just elimination** (score resets each round, so the
  check tracks the max a round reached); 12–13 kills, 13–15 grenade
  throws, 9 point arrivals, bots travelled up to 43 m, crane climbed in
  live play, **0 wall violations, 0 NaN**.

**Headless Chrome (file://, SwiftShader, TESTING.md method): 4/4 modes,
0 console errors**, screenshots read back visually:
- start: NIGHTSHIFT title screen, clean.
- play: night yard, NS-07 containers, orange B beacon + moon + skyline,
  Longshot viewmodel, point strip (A alloy / B ember), minimap, kill feed
  live (bots killing each other), scores ticking 12–9.
- buy: buy menu (5 weapons, 3 grenades, Kevlar), timer counting, neutral
  beacons dimmed.
- end: EMBER WINS THE MATCH, final score 2–1, history E A E, A+B ember.

**Dossier:** `MAKEFUN_OUTPUT_DIR=out node main.ts` → dossier.json,
text **131.681 byte ≤ 163.840 cap**. Note: `start.png` was 359.827 byte
(over the 256 KiB screenshot cap) — re-encoded as `start.jpg` (47.325
byte, JPEG allowed); other shots 130–195 KiB PNG.

**Kit check** (`check --worktree`, no transcripts — submitter's job):
PASS competition_open, snapshot (50 files, 6.439.335 byte), license_osi
(MIT), entrypoint (main.ts, node22). FAIL only transcripts_present, as
expected. No local grade exists for this competition (server grades).

**No network references** in game source (only a localhost comment in
main.ts and badge links in README, as in v2). three.js 0.187.0 vendored
flat under `game/vendor/three/` (byte-identical to v2/kit).

## Bugs found and fixed during validation

1. Import map pointed at `vendor/three/build/three.module.js` (does not
   exist) — the game never loaded, black screen. Fixed to v2's flat path
   `./vendor/three/three.module.min.js`.
2. `MOVE.walkSpeed` etc. do not exist — config uses short keys
   (`walk`/`sprint`/`ads`/`crouch`). `speed` was `undefined`, the player
   went NaN, the camera rendered the void. Fixed the one line in main.js
   and audited every `MOVE.*` use.
3. `ctx.onShoot/onDamage/onThrow` missing from main.js's bot context —
   every bot shot threw. Added (tracer + burst, dealDamage, util.throw).
4. `rounds.step` was only called from updateBots, which only runs in the
   live phase — **the buy phase never counted down in the browser** (the
   match would never start on its own). Moved to `stepRounds()` in the
   main loop; buy→live transition verified live in Chrome
   (phase `live`, timeLeft 99.8).
5. Timer never updated (`hud.setTimer` never called). Added to updateHud.
6. Beacon "letter" was a solid glowing box (a white monolith on camera).
   Replaced with a canvas-glyph texture on a transparent plane; neutral
   beacon colour dimmed (#cfd6e4 → #8a9ab0).
7. End-shot staging used `rounds.state.wins` (does not exist; the field
   is `score`). Fixed.
8. `rounds.begin()` does not exist (it is `startMatch()`); no auto-advance
   from phase `over`; alive-field names mismatched between main.js and
   rounds.js (`emberAlive`/`alloyAlive` vs `attackersAlive`/
   `defendersAlive`). All fixed; `pointsOwned` now passed for the
   overtime tiebreak.
9. `map.js` imported `PALETTE` from config.js — it lives in palette.js.
10. Sim only: forced-crane test was invalid until the bot's 4 s rethink
    was pinned off; the "points scored" check read the final (just-reset)
    score instead of the round max.

## Honest assessment — does this plausibly close the 0.19 gap?

**As a step-change: yes, genuinely.** New mode, new movement verbs
(crouch — named explicitly in criterion 2 — plus jump), new bot brains,
new map and look. Nothing here is a reskin of SLAGLINE.

**As a prize-zone claim: no, the evidence does not stretch that far.**
The bar is 0.9436 (rank 10); v1 scored 0.7556, v2 0.7507. That is a
0.19 jump — from ~#1.100 to the top 10, where entries are near-perfect.
Nothing local can measure that: there is no local judge, and the judge is
pairwise and noisy — v2 was a better game than v1 by every local measure
(sim, screenshots, check) and still scored *lower*. A mode change aimed
at exactly the criteria the judge names is the best available shot, and
every mechanic in it is verified end-to-end (including a round won on
points), but "best available shot" is not "plausibly reaches 0.9436".

**Recommendation: DO NOT submit as a prize-zone entry.** Under the user's
rule — submit only what plausibly enters the prize zone — this build does
not meet the bar on evidence. Keep v2 (0.7507) as the final entry.
The only honest exception: if the user explicitly wants to spend the one
remaining day slot (entries close 17 Nov 04:30 WIB, hard limit 18 left)
on a long-shot roll with the strongest different-direction build
available, this is the build to roll — with eyes open that it is a long
shot, not a favourite. That call is the user's, not the builder's.

## Caveats for the submitter

- Headless SwiftShader runs the scene at ~1.3 fps (dt clamped at 0.05 s,
  so the game clock runs ~1/16 real time there). On real hardware it is
  full speed. If the judge's harness is also software-rendered, the
  staged shots still work (bots are teleported into place), but live play
  would feel slow. The scene is heavy: PCFSoft shadows + ~9 lights.
- `shots.json` lists `start.jpg` (JPEG) for the start shot; the other
  three are PNG. All four are ≤ 256 KiB.
- Day cap: 1 slot left today (16 Nov reset 07:00 WIB). Do not submit
  twice — the newest submission replaces the current final (v2).
