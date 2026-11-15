// Rounds: the match clock. A round is a buy phase and a live phase. A live
// round ends three ways: a team reaches 100 point-score, a team is eliminated,
// or the clock runs out — then the higher score wins, and a tie goes to
// overtime, where the next point tick takes it. First team to 3 rounds takes
// the match. The economy lives here in one place: winners bank 3250, losers
// take a loss bonus that grows with the streak (1900/2400/2900/3400), and the
// round history the HUD draws comes from here too. Nothing here knows about
// bombs: there is no bomb in this game, and no defuse.
import { ROUND } from './config.js';

const WIN_ROUNDS = ROUND.winsToTake;
const ROUND_TIME = ROUND.liveSeconds;
const BUY_TIME = ROUND.buySeconds;
const OVERTIME = ROUND.overtimeSeconds;
const POINTS_TO_WIN = ROUND.pointsToWin;
const LOSS_BONUS = [1900, 2400, 2900, 3400];

export function createRounds({ onEvent }) {
  const state = {
    phase: 'idle',
    round: 0,
    score: { ember: 0, alloy: 0 },
    history: [],
    timeLeft: 0,
    overtime: false,
    overT: 0,
    lossStreak: { ember: 0, alloy: 0 },
    matchOver: false,
  };

  function emit(type, data) { onEvent(type, data); }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.overT = 4;
    state.score[winner] += 1;
    state.history.push(winner === 'ember' ? 'E' : 'A');
    state.lossStreak[winner] = 0;
    const loser = winner === 'ember' ? 'alloy' : 'ember';
    const bonus = LOSS_BONUS[Math.min(state.lossStreak[loser], 3)];
    state.lossStreak[loser] += 1;
    emit('round-end', { winner, reason, score: { ...state.score }, history: [...state.history], lossBonus: bonus, loser });
    if (state.score[winner] >= WIN_ROUNDS) {
      state.matchOver = true;
      emit('match-end', { winner, score: { ...state.score }, history: [...state.history] });
    }
  }

  return {
    state,
    startMatch() {
      state.round = 0;
      state.score = { ember: 0, alloy: 0 };
      state.history = [];
      state.lossStreak = { ember: 0, alloy: 0 };
      state.matchOver = false;
      this.startRound();
    },
    startRound() {
      state.round += 1;
      state.phase = 'buy';
      state.timeLeft = BUY_TIME;
      state.overtime = false;
      emit('buy-start', { round: state.round, score: { ...state.score }, history: [...state.history] });
    },
    beginLive() {
      if (state.phase !== 'buy') return;
      state.phase = 'live';
      state.timeLeft = ROUND_TIME;
      state.overtime = false;
      emit('live-start', { round: state.round });
    },
    // The clock. `ctx` carries the live headcounts and the point score; the
    // caller owns movement, captures and shooting, this owns only time.
    step(dt, ctx) {
      if (state.phase === 'buy') {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) this.beginLive();
        return;
      }
      if (state.phase === 'over') {
        state.overT -= dt;
        if (state.overT <= 0 && !state.matchOver) this.startRound();
        return;
      }
      if (state.phase !== 'live') return;
      state.timeLeft -= dt;
      const ps = ctx.pointsScore || { ember: 0, alloy: 0 };
      // Points win: first team to 100 point-score takes the round.
      if (ps.ember >= POINTS_TO_WIN) { endRound('ember', '100 points — zone control'); return; }
      if (ps.alloy >= POINTS_TO_WIN) { endRound('alloy', '100 points — zone control'); return; }
      if (state.timeLeft <= 0 && !state.overtime) {
        // Clock out: higher score wins; a tie goes to overtime.
        if (ps.ember !== ps.alloy) {
          endRound(ps.ember > ps.alloy ? 'ember' : 'alloy', 'Time expired — more points');
          return;
        }
        state.overtime = true;
        state.timeLeft = OVERTIME;
        emit('overtime', { seconds: OVERTIME });
      } else if (state.timeLeft <= 0 && state.overtime) {
        // Overtime out with no tick: more zones wins, then more fighters alive.
        const owned = ctx.pointsOwned || { ember: 0, alloy: 0 };
        if (owned.ember !== owned.alloy) {
          endRound(owned.ember > owned.alloy ? 'ember' : 'alloy', 'Overtime — more zones held');
          return;
        }
        endRound(ctx.emberAlive >= ctx.alloyAlive ? 'ember' : 'alloy', 'Overtime — more fighters standing');
        return;
      }
      const attackersAlive = ctx.emberAlive;
      const defendersAlive = ctx.alloyAlive;
      if (attackersAlive === 0) { endRound('alloy', 'Ember eliminated'); return; }
      if (defendersAlive === 0) { endRound('ember', 'Alloy eliminated'); return; }
    },
  };
}
