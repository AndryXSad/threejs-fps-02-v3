// HUD: everything the player sees that is not the world. Crosshair with a
// dynamic gap (it opens as the gun blooms), health/armour/money/ammo, the
// grenade slots, the round history strip, the minimap — and two things the
// game did not have before: a hit-direction indicator that points at whoever
// just shot you, and a white flash overlay for when a flashbang catches you.
// New in NIGHTSHIFT: the point strip under the top bar — three chips, one
// per control point, in the owner's colour with a capture-progress bar — so
// the state of the objective is always one glance away.
import { POINTS } from './config.js';
import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';
import { rayHitDistance } from './map.js';

const WALL_RECTS = [
  [-17, 9, 7, 1], [17, 9, 7, 1],
  [-9.5, -5, 1, 8], [9.5, -5, 1, 8], [-9.5, 9, 1, 6], [9.5, 9, 1, 6],
  [-24, -17.5, 8, 1], [24, -17.5, 8, 1],
  [-22.5, -3, 2, 2], [-22.5, 7, 2, 2], [22.5, -3, 2, 2], [22.5, 7, 2, 2],
  [-5, 14, 2.4, 1.4], [5, 14, 2.4, 1.4],
  [-14, -14, 2, 2], [14, -14, 2, 2], [-28, 4, 2, 2], [28, 4, 2, 2],
  [-8, -15, 1.2, 1.2], [8, -15, 1.2, 1.2], [-8, 15, 1.2, 1.2], [8, 15, 1.2, 1.2],
  [-14, 6, 4.5, 2.2], [14, 6, 4.5, 2.2], [-15, -14, 4.5, 2.2], [15, -14, 4.5, 2.2],
  [-2.8, -2.8, 1.6, 1.6], [2.8, -2.8, 1.6, 1.6], [-2.8, 2.8, 1.6, 1.6], [2.8, 2.8, 1.6, 1.6],
  [-27, -16, 1.2, 1.2], [-21, -16, 1.2, 1.2],
  [28, -17, 4, 2], [28, -8, 2, 2],
];

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="crosshair"><span class="ch-dot"></span><span class="ch-line ch-t"></span><span class="ch-line ch-b"></span><span class="ch-line ch-l"></span><span class="ch-line ch-r"></span></div>
    <div id="hitdir"></div>
    <div id="flash-overlay"></div>
    <div id="damage-vignette"></div>
    <div id="topbar"><span id="score-ember">EMBER 0</span><span id="timer">--:--</span><span id="score-alloy">0 ALLOY</span></div>
    <div id="point-strip"></div>
    <div id="round-history"></div>
    <div id="phase">NIGHTSHIFT</div>
    <div id="message"></div>
    <div id="minimap-wrap"><canvas id="minimap" width="180" height="124"></canvas></div>
    <div id="stats">
      <div id="health">100</div>
      <div id="armor">0</div>
      <div id="money">$800</div>
      <div id="ammo">30 / 90</div>
      <div id="weapon-name">Longshot Rifle</div>
      <div id="grenades"></div>
    </div>
    <div id="killfeed"></div>
    <div id="buy-menu" class="hidden"></div>
    <div id="end-panel" class="hidden"></div>
  `;
  const el = (id) => document.getElementById(id);
  const ctx = el('minimap').getContext('2d');
  const W = 180;
  const H = 124;
  const scaleX = W / 68;
  const scaleZ = H / 48;
  const toMap = (x, z) => [(x + 34) * scaleX, (z + 24) * scaleZ];
  let hitDirAngle = null;
  let hitDirUntil = 0;

  function drawMinimap(state) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(7,11,18,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3a4658';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    // The crane bridge: a raised strip, drawn lighter than the floor.
    ctx.fillStyle = 'rgba(160,150,130,0.35)';
    const [gx, gz] = toMap(0, -6);
    ctx.fillRect(gx - (53 / 2) * scaleX, gz - (2.4 / 2) * scaleZ, 53 * scaleX, 2.4 * scaleZ);
    ctx.fillStyle = 'rgba(150,165,185,0.55)';
    for (const [x, z, w, d] of WALL_RECTS) {
      const [mx, mz] = toMap(x - w / 2, z - d / 2);
      ctx.fillRect(mx, mz, w * scaleX, d * scaleZ);
    }
    // Smoke clouds: grey blobs that hide whatever is behind them.
    if (state.smokes) {
      ctx.fillStyle = 'rgba(200,195,185,0.5)';
      for (const c of state.smokes) {
        const [mx, mz] = toMap(c.x, c.z);
        ctx.beginPath();
        ctx.arc(mx, mz, c.r * scaleX, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Control points: a disc in the owner's colour, a ring that fills with
    // capture progress, and the letter on top.
    if (state.points) {
      for (const [key, pt] of Object.entries(POINTS)) {
        const st = state.points[key];
        const [mx, mz] = toMap(pt.x, pt.z);
        ctx.fillStyle = st.owner === 'ember' ? '#ff7a1a' : st.owner === 'alloy' ? '#2ec4b6' : '#5a6a80';
        ctx.beginPath();
        ctx.arc(mx, mz, pt.radius * scaleX, 0, Math.PI * 2);
        ctx.fill();
        if (st.progress > 0 && st.progress < 1) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mx, mz, pt.radius * scaleX + 2, -Math.PI / 2, -Math.PI / 2 + st.progress * Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#0a0d12';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(key, mx, mz + 4);
      }
    }
    const drawDot = (x, z, color, size = 3) => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, mz, size, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const bot of state.bots) {
      if (!bot.alive) continue;
      if (bot.team === state.player.team) {
        drawDot(bot.x, bot.z, '#7fb4c7', 3);
      } else if (bot.visible) {
        drawDot(bot.x, bot.z, '#ff5533', 3);
      }
    }
    // The player: a wedge that points where they look.
    const [px, pz] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(-Math.sin(state.player.yaw), -Math.cos(state.player.yaw)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    showMessage(text, ms = 2500) {
      const m = el('message');
      m.textContent = text;
      m.classList.add('show');
      clearTimeout(m._t);
      m._t = setTimeout(() => m.classList.remove('show'), ms);
    },
    setPhase(text) { el('phase').textContent = text; },
    setTimer(text) { el('timer').textContent = text; },
    // The top bar shows the point race (first to 100), not the round wins:
    // the round wins live in the history strip below it.
    setScores(e, a) {
      el('score-ember').textContent = `EMBER ${e}`;
      el('score-alloy').textContent = `${a} ALLOY`;
    },
    // The point strip: one chip per control point, in the owner's colour,
    // with a bar that fills with capture progress.
    setPoints(points) {
      const wrap = el('point-strip');
      wrap.innerHTML = Object.keys(POINTS).map((key) => {
        const st = points[key];
        const cls = st.owner === 'ember' ? 'pt-e' : st.owner === 'alloy' ? 'pt-a' : 'pt-n';
        const pct = Math.round(st.progress * 100);
        return `<span class="pt ${cls}">${key}<i style="width:${pct}%"></i></span>`;
      }).join('');
    },
    setRoundHistory(history) {
      const wrap = el('round-history');
      wrap.innerHTML = history.map((h) => `<span class="rh ${h === 'E' ? 'rh-e' : h === 'A' ? 'rh-a' : ''}">${h === 'E' ? 'E' : h === 'A' ? 'A' : '–'}</span>`).join('');
    },
    setHealth(hp, armor) {
      el('health').textContent = Math.ceil(hp);
      el('health').style.color = hp <= 30 ? '#ff5533' : '#ffffff';
      el('armor').textContent = Math.ceil(armor);
    },
    setMoney(m) { el('money').textContent = `$${m}`; },
    setAmmo(mag, reserve, name) {
      el('ammo').textContent = `${mag} / ${reserve}`;
      el('weapon-name').textContent = name;
    },
    setGrenades(g) {
      el('grenades').innerHTML = Object.entries(GRENADES).map(([kind, def]) => (
        `<span class="gren ${g[kind] > 0 ? 'has' : ''}">${def.name.split(' ')[0]} ×${g[kind]}</span>`
      )).join(' ');
    },
    setCrosshairGap(px) {
      document.documentElement.style.setProperty('--ch-gap', `${px}px`);
    },
    hitDirection(angle, time) {
      hitDirAngle = angle;
      hitDirUntil = time + 0.9;
      const d = el('hitdir');
      d.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
      d.classList.add('show');
    },
    flashOverlay(strength) {
      el('flash-overlay').style.opacity = String(Math.min(1, strength));
    },
    damageFlash() {
      const v = el('damage-vignette');
      v.classList.remove('show');
      void v.offsetWidth;
      v.classList.add('show');
    },
    addKill(text, color = '#ffffff') {
      const feed = el('killfeed');
      const line = document.createElement('div');
      line.className = 'kill-line';
      line.style.color = color;
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBuyMenu(money, currentWeapon, grenades, hasArmor) {
      const menu = el('buy-menu');
      const weaponRows = Object.values(WEAPONS).map((w) => (
        `<button class="buy-item ${currentWeapon === w.id ? 'current' : ''}" data-buy="weapon:${w.id}" ${money < w.price && currentWeapon !== w.id ? 'disabled' : ''}>
          <span class="buy-name">${w.name}</span><span class="buy-stat">${w.damage} dmg · ${w.range} m · ${w.mag} rnd</span><span class="buy-price">$${w.price}</span>
        </button>`
      )).join('');
      const utilRows = Object.entries(GRENADES).map(([kind, def]) => (
        `<button class="buy-item" data-buy="util:${kind}" ${money < def.price ? 'disabled' : ''}>
          <span class="buy-name">${def.name}</span><span class="buy-stat">${kind === 'frag' ? 'blast damage' : kind === 'flash' ? 'blinds 3.5 s' : 'blocks sight 14 s'}</span><span class="buy-price">$${def.price}</span>
        </button>`
      )).join('');
      menu.innerHTML = `
        <h2>BUY — $${money}</h2>
        <div class="buy-section">${weaponRows}</div>
        <div class="buy-section">${utilRows}
          <button class="buy-item" data-buy="armor" ${money < ARMOR_PRICE || hasArmor ? 'disabled' : ''}>
            <span class="buy-name">Kevlar Vest</span><span class="buy-stat">absorbs half of damage</span><span class="buy-price">$${ARMOR_PRICE}</span>
          </button>
        </div>
        <p class="buy-hint">Click to buy · B to close · grenades: 4 frag · 5 flash · 6 smoke</p>`;
      menu.classList.remove('hidden');
    },
    hideBuyMenu() { el('buy-menu').classList.add('hidden'); },
    buyMenuVisible() { return !el('buy-menu').classList.contains('hidden'); },
    showEnd(title, lines) {
      const panel = el('end-panel');
      panel.innerHTML = `<h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}<p class="buy-hint">Refresh to play again</p>`;
      panel.classList.remove('hidden');
    },
    hideEnd() { el('end-panel').classList.add('hidden'); },
    updateMinimap(state) { drawMinimap(state); },
    step(time) {
      if (hitDirAngle !== null && time > hitDirUntil) {
        el('hitdir').classList.remove('show');
        hitDirAngle = null;
      }
    },
  };
}

// An enemy is drawn on the minimap only when the player could plausibly know
// they are there: line of sight is open, no smoke in the way, and they are
// within 30 m. A kill in the last 4 s also reveals the victim's killer.
export function enemyVisibleOnMinimap(player, enemy, colliders, util) {
  const dx = enemy.x - player.x;
  const dy = (enemy.y + 1.2) - (player.y + player.eye);
  const dz = enemy.z - player.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 30) return false;
  const len = dist || 1;
  const wall = rayHitDistance(colliders, player.x, player.y + player.eye, player.z, dx / len, dy / len, dz / len, dist);
  if (wall < dist - 0.05) return false;
  if (util && util.blocksSight({ x: player.x, y: player.y + player.eye, z: player.z }, { x: enemy.x, y: enemy.y + 1.2, z: enemy.z })) return false;
  return true;
}
