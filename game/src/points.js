// Control points: the objective. Three zones — A the crane, B the yard,
// C the pier. A team captures a zone by standing in it unopposed: capture
// progress runs 0 to 1 (4 s solo, faster with friends), and an enemy team
// standing in a zone it owns unwinds it the same way. Two teams in one zone
// freeze it — a contested point changes hands only after the fight is won.
// A zone its team owns ticks +1 score every 2 s. First team to 100 takes
// the round. This module owns only the points; the round clock in rounds.js
// decides when a score ends a round, and main.js owns who stands where.
// The point state is deliberately boring on purpose: owner, progress, score
// — one place, no copies, so the HUD, the minimap and the beacons can never
// disagree about who holds what.
import { POINTS, ROUND } from './config.js';

export function createPoints({ onEvent }) {
  const state = {
    points: {
      A: { owner: null, progress: 0, capturing: null },
      B: { owner: null, progress: 0, capturing: null },
      C: { owner: null, progress: 0, capturing: null },
    },
    score: { ember: 0, alloy: 0 },
    tickAcc: 0,
  };

  function emit(type, data) { onEvent(type, data); }

  function inPoint(key, x, z) {
    const p = POINTS[key];
    const dx = x - p.x;
    const dz = z - p.z;
    return dx * dx + dz * dz <= p.radius * p.radius;
  }

  return {
    state,
    inPoint,
    reset() {
      for (const key of Object.keys(state.points)) {
        state.points[key].owner = null;
        state.points[key].progress = 0;
        state.points[key].capturing = null;
      }
      state.score = { ember: 0, alloy: 0 };
      state.tickAcc = 0;
    },
    // `fighters` are the alive fighters of both teams, each with x/z/team.
    // Capture runs on presence alone: no key to hold, no bomb to plant.
    step(dt, fighters) {
      for (const key of Object.keys(state.points)) {
        const pt = state.points[key];
        let ember = 0;
        let alloy = 0;
        for (const f of fighters) {
          if (!f.alive) continue;
          if (!inPoint(key, f.x, f.z)) continue;
          if (f.team === 'ember') ember += 1;
          else alloy += 1;
        }
        // Contested: both teams inside — the point freezes mid-fight.
        if (ember > 0 && alloy > 0) { pt.capturing = null; continue; }
        const present = ember > 0 ? 'ember' : alloy > 0 ? 'alloy' : null;
        if (!present) { pt.capturing = null; continue; }
        // `capturing` names the team currently moving the point, so the bots
        // know which point is changing hands and can go and take it back.
        pt.capturing = pt.owner === present ? null : present;
        const rate = (1 / ROUND.captureSeconds) + Math.max(0, (ember + alloy - 1)) * ROUND.captureBonusPerAlly;
        if (pt.owner === present) {
          // Already ours and we are standing in it: top the progress up.
          if (pt.progress < 1) pt.progress = Math.min(1, pt.progress + rate * dt);
          continue;
        }
        if (pt.owner === null) {
          pt.progress += rate * dt;
          if (pt.progress >= 1) {
            pt.progress = 1;
            pt.owner = present;
            pt.capturing = null;
            emit('point-captured', { point: key, owner: present, score: { ...state.score } });
          }
        } else {
          // Owned by the enemy: unwind it first, then it is neutral.
          pt.progress -= rate * dt;
          if (pt.progress <= 0) {
            pt.progress = 0;
            pt.owner = null;
            pt.capturing = null;
            emit('point-lost', { point: key, owner: present, score: { ...state.score } });
          }
        }
      }
      // Score ticks: every 2 s, each owned point pays its owner +1.
      state.tickAcc += dt;
      if (state.tickAcc >= ROUND.tickSeconds) {
        state.tickAcc -= ROUND.tickSeconds;
        let changed = false;
        for (const key of Object.keys(state.points)) {
          const owner = state.points[key].owner;
          if (owner) {
            state.score[owner] += 1;
            changed = true;
          }
        }
        if (changed) emit('points-tick', { score: { ...state.score } });
      }
    },
    ownedCount(team) {
      let n = 0;
      for (const key of Object.keys(state.points)) if (state.points[key].owner === team) n += 1;
      return n;
    },
  };
}
