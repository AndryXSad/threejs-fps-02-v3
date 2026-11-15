// NIGHTSHIFT: the game itself. A 5v5 control-point round on the Container
// Docks map — you and four bots against five. Buy, take the points, hold them
// and tick to 100; or wipe the other team out. The loop is a new game on the
// engine SLAGLINE proved: the map, the objective, the bot brains and the
// movement are all new — crouching and jumping, a crane bridge over mid,
// night light with beacons that change colour with the point's owner.
import * as THREE from 'three';
import { WEAPONS, GRENADES, ARMOR_PRICE, MOVE, OWNER_COLOR, POINTS } from './config.js';
import { SPAWNS, createMap, rayHitDistance, stepMover, inPoint, route, nearestWaypoint } from './map.js';
import { createCombatFx, createWeaponState, weaponStep, weaponReady, weaponReload, fireRound, applyDamage } from './combat.js';
import { createBot, planRound, buyPhase, applyRoundEconomy, resetBotForRound, botStep, groundHeightAt } from './bots.js';
import { createUtility } from './utility.js';
import { createViewmodel } from './viewmodel.js';
import { createHud, enemyVisibleOnMinimap } from './hud.js';
import { createRounds } from './rounds.js';
import { createPoints } from './points.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const godMode = shotMode === 'play';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b12);
scene.fog = new THREE.Fog(0x070b12, 45, 105);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const { colliders, shootables, beacons } = createMap(scene);
const fx = createCombatFx(scene);
const util = createUtility(scene, colliders);
const hud = createHud();
const viewmodel = createViewmodel(camera);

// Beacon colours, prebuilt once: the beacons repaint every frame from the
// point state, and the hot loop makes no new objects.
const ownerColors = {
  ember: new THREE.Color(OWNER_COLOR.ember),
  alloy: new THREE.Color(OWNER_COLOR.alloy),
  neutral: new THREE.Color(OWNER_COLOR.neutral),
};

let time = 0;
let lastDeath = null;
let matchStarted = false;
let roundEndAt = 0;
let playerFlashUntil = 0;
let playerFlashDuration = 1;
let lookDx = 0;
let lookDy = 0;

const player = {
  isBot: false,
  team: 'ember',
  x: 0, y: 0, z: 18.5, vx: 0, vz: 0, vy: 0,
  height: MOVE.standHeight, eye: MOVE.standEye,
  crouched: false, grounded: true,
  yaw: 0, pitch: 0,
  hp: 100, armor: 0, alive: true,
  money: 800, kills: 0, deaths: 0,
  weapon: createWeaponState('longshot'),
  grenades: { frag: 0, flash: 0, smoke: 0 },
};

const bots = [];
for (let i = 0; i < 4; i += 1) {
  const bot = createBot('ember', i, SPAWNS.ember[i], Math.random);
  scene.add(bot.mesh);
  bots.push(bot);
}
for (let i = 0; i < 5; i += 1) {
  const bot = createBot('alloy', i, SPAWNS.alloy[i], Math.random);
  scene.add(bot.mesh);
  bots.push(bot);
}
const emberBots = bots.filter((b) => b.team === 'ember');
const alloyBots = bots.filter((b) => b.team === 'alloy');

const points = createPoints({
  onEvent(type, data) {
    if (type === 'point-captured') {
      hud.showMessage(`${data.owner === 'ember' ? 'EMBER' : 'ALLOY'} captured point ${data.point}!`, 3000);
    } else if (type === 'point-lost') {
      hud.showMessage(`Point ${data.point} is neutral again!`, 3000);
    } else if (type === 'overtime') {
      hud.showMessage('OVERTIME — next point tick wins!', 4000);
    }
  },
});

const rounds = createRounds({ onEvent: handleRoundEvent });

function handleRoundEvent(type, data) {
  if (type === 'buy-start') {
    // Reset everyone to their spawn, reset the points, run the buy phase.
    points.reset();
    player.x = SPAWNS.ember[2][0];
    player.z = SPAWNS.ember[2][1];
    player.y = 0;
    player.vx = 0;
    player.vz = 0;
    player.vy = 0;
    player.hp = 100;
    player.alive = true;
    player.crouched = false;
    player.height = MOVE.standHeight;
    player.eye = MOVE.standEye;
    emberBots.forEach((b, i) => resetBotForRound(b, SPAWNS.ember[i], time));
    alloyBots.forEach((b, i) => resetBotForRound(b, SPAWNS.alloy[i], time));
    buyPhase(emberBots, true, Math.random);
    buyPhase(alloyBots, false, Math.random);
    planRound(emberBots, alloyBots, time, Math.random);
    hud.setPhase(`ROUND ${data.round} — BUY PHASE`);
    hud.setScores(0, 0);
    hud.setPoints(points.state.points);
    hud.setRoundHistory(data.history);
    hud.setHealth(player.hp, player.armor);
    hud.setMoney(player.money);
    hud.showMessage(`Round ${data.round} — buy phase (B to buy)`);
    if (!shotMode) hud.showBuyMenu(player.money, player.weapon.id, player.grenades, player.armor > 0);
  } else if (type === 'live-start') {
    hud.hideBuyMenu();
    hud.setPhase(`ROUND ${rounds.state.round} — LIVE`);
    hud.showMessage('Go! Take the points — first to 100.');
  } else if (type === 'round-end') {
    applyRoundEconomy(emberBots, data.winner === 'ember');
    applyRoundEconomy(alloyBots, data.winner === 'alloy');
    player.money += data.winner === 'ember' ? 3250 : data.lossBonus;
    hud.setRoundHistory(data.history);
    hud.setMoney(player.money);
    const verb = data.winner === 'ember' ? 'EMBER wins the round' : 'ALLOY wins the round';
    hud.showMessage(`${verb} — ${data.reason}.`, 4000);
    hud.setPhase(`${verb.toUpperCase()} — ${data.reason.toUpperCase()}`);
    roundEndAt = time + 4;
  } else if (type === 'match-end') {
    hud.setPhase('MATCH OVER');
    hud.showEnd(
      data.winner === 'ember' ? 'EMBER WINS THE MATCH' : 'ALLOY WINS THE MATCH',
      [
        `Final score: EMBER ${data.score.ember} — ${data.score.alloy} ALLOY`,
        `Your line: ${player.kills} kills, ${player.deaths} deaths`,
        `Round history: ${data.history.map((h) => (h === 'E' ? 'E' : 'A')).join(' ')}`,
      ],
    );
  }
}

// --- Input ---
const keys = new Set();
let firing = false;
let aiming = false;
let locked = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR') weaponReload(player.weapon);
  if (e.code === 'Space') {
    // Jump: only off the ground, and it costs the crouch and the aim.
    if (player.grounded && player.alive && rounds.state.phase === 'live') {
      player.vy = MOVE.jumpSpeed;
      player.grounded = false;
    }
    e.preventDefault();
  }
  if (e.code === 'KeyB' && rounds.state.phase === 'buy') {
    if (hud.buyMenuVisible()) hud.hideBuyMenu();
    else hud.showBuyMenu(player.money, player.weapon.id, player.grenades, player.armor > 0);
  }
  if (e.code === 'Digit4') throwGrenade('frag');
  if (e.code === 'Digit5') throwGrenade('flash');
  if (e.code === 'Digit6') throwGrenade('smoke');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousedown', (e) => {
  if (!locked || !matchStarted) return;
  if (e.button === 0) firing = true;
  if (e.button === 2) aiming = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked) return;
  lookDx += e.movementX;
  lookDy += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
});
renderer.domElement.addEventListener('click', () => {
  if (matchStarted && !locked) renderer.domElement.requestPointerLock();
});
document.getElementById('buy-menu').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (!btn || btn.disabled) return;
  const [kind, id] = btn.dataset.buy.split(':');
  if (kind === 'weapon') buyWeapon(id);
  else if (kind === 'util') buyUtil(id);
  else if (kind === 'armor') buyArmor();
  if (rounds.state.phase === 'buy') {
    hud.showBuyMenu(player.money, player.weapon.id, player.grenades, player.armor > 0);
  }
});

function buyWeapon(id) {
  const def = WEAPONS[id];
  if (!def || player.money < def.price || player.weapon.id === id) return;
  player.money -= def.price;
  player.weapon = createWeaponState(id);
  viewmodel.setWeapon(id);
  hud.setMoney(player.money);
  hud.showMessage(`Bought ${def.name}.`);
}

function buyUtil(kind) {
  const def = GRENADES[kind];
  if (!def || player.money < def.price) return;
  player.money -= def.price;
  player.grenades[kind] += 1;
  hud.setMoney(player.money);
  hud.showMessage(`Bought ${def.name}.`);
}

function buyArmor() {
  if (player.money < ARMOR_PRICE || player.armor > 0) return;
  player.money -= ARMOR_PRICE;
  player.armor = 100;
  hud.setMoney(player.money);
}

function throwGrenade(kind) {
  if (!player.alive || rounds.state.phase !== 'live') return;
  if (player.grenades[kind] <= 0) return;
  player.grenades[kind] -= 1;
  const dir = {
    x: -Math.sin(player.yaw) * Math.cos(player.pitch),
    y: Math.sin(player.pitch),
    z: -Math.cos(player.yaw) * Math.cos(player.pitch),
  };
  util.throw(kind, { x: player.x, y: player.y + player.eye, z: player.z }, { x: dir.x * 15, y: dir.y * 15 + 3.5, z: dir.z * 15 }, player);
  hud.setGrenades(player.grenades);
}

// --- Damage ---
function dealDamage(attacker, victim, raw, part, def, name) {
  if (!victim.alive) return;
  const dmg = raw * (part === 'head' ? (def.headMult ?? 2) : 1);
  const dealt = applyDamage(victim, dmg);
  void dealt;
  if (victim === player) {
    hud.damageFlash();
    if (attacker && attacker.x !== undefined) {
      const dx = attacker.x - player.x;
      const dz = attacker.z - player.z;
      const angle = Math.atan2(dx, dz) - player.yaw;
      hud.hitDirection(angle, time);
    }
  }
  if (attacker === player && victim !== player) {
    hud.setCrosshairGap(14);
  }
  if (!victim.alive) handleDeath(victim, attacker, name);
}

function handleDeath(victim, attacker, weaponName) {
  victim.deaths += 1;
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    if (attacker === player) {
      player.money += 300;
      hud.setMoney(player.money);
    }
  }
  const vName = victim.isBot ? `${victim.team === 'ember' ? 'EMBER' : 'ALLOY'} ${victim.role}` : 'YOU';
  const aName = attacker ? (attacker.isBot ? `${attacker.team === 'ember' ? 'EMBER' : 'ALLOY'} ${attacker.role}` : 'YOU') : 'the world';
  hud.addKill(`${aName} ▸ ${vName}  [${weaponName}]`, victim.team === 'ember' ? '#7fb4c7' : '#ff8a6a');
  lastDeath = { x: victim.x, z: victim.z, time };
  if (victim.isBot) {
    victim.mesh.rotation.x = -Math.PI / 2;
    victim.mesh.position.y = 0.3;
  }
  if (victim === player) {
    hud.showMessage('You died. Next round in a moment.', 3500);
    document.exitPointerLock?.();
  }
}

// --- Player shooting ---
function playerShoot() {
  if (!player.alive || rounds.state.phase !== 'live') return;
  const w = player.weapon;
  if (w.mag <= 0 && w.reloadT <= 0) weaponReload(w);
  if (!weaponReady(w)) return;
  const spreadBase = aiming ? 0.002 : 0.006;
  const moveSpread = Math.hypot(player.vx, player.vz) * 0.0012;
  const blindSpread = time < playerFlashUntil ? 0.08 : 0;
  // Crouching tightens the spread: stopping low to aim pays.
  const spread = (spreadBase + w.bloom + moveSpread + blindSpread) * (player.crouched ? MOVE.crouchSpread : 1);
  const origin = { x: player.x, y: player.y + player.eye, z: player.z };
  const dir = {
    x: -Math.sin(player.yaw) * Math.cos(player.pitch),
    y: Math.sin(player.pitch),
    z: -Math.cos(player.yaw) * Math.cos(player.pitch),
  };
  const res = fireRound(w, origin, dir, spread, Math.random, colliders, alloyBots, w.def.range);
  if (!res) return;
  const muzzle = viewmodel.muzzleWorld();
  fx.muzzleAt(muzzle, camera);
  fx.flashAt(muzzle, 25);
  viewmodel.kick(w.id === 'maul' ? 0.9 : w.id === 'longshot' ? 0.7 : 0.45);
  if (res.point) {
    fx.tracer(muzzle, res.point, 0xffd27a);
    if (res.blocked) fx.burst(res.point, 0xffb347);
  }
  for (const hit of res.hits) dealDamage(player, hit.fighter, hit.dmg, hit.part, w.def, w.def.name);
  hud.setAmmo(w.mag, w.reserve, w.def.name);
}

// --- Per-frame updates ---
function updatePlayer(dt) {
  // Look: mouse deltas accumulate between frames, applied here.
  player.yaw -= lookDx * 0.0018;
  player.pitch -= lookDy * 0.0018;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  lookDx = 0;
  lookDy = 0;

  // Crouch: hold Ctrl (or C) to drop to 1.15 m and tighten the spread. The
  // height eases so the camera does not teleport.
  const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
  player.crouched = wantCrouch && player.grounded;
  const targetH = player.crouched ? MOVE.crouchHeight : MOVE.standHeight;
  const targetEye = player.crouched ? MOVE.crouchEye : MOVE.standEye;
  player.height += (targetH - player.height) * Math.min(1, dt * 12);
  player.eye += (targetEye - player.eye) * Math.min(1, dt * 12);

  // Move: W forward, S back, A/D strafe, Shift sprint (not while crouched).
  const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sprint = keys.has('ShiftLeft') && !player.crouched && fwd > 0;
  const speed = player.crouched ? MOVE.crouch : aiming ? MOVE.ads : sprint ? MOVE.sprint : MOVE.walk;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const mx = (-sin * fwd + cos * strafe) * speed;
  const mz = (-cos * fwd - sin * strafe) * speed;
  const len = Math.hypot(mx, mz);
  const nx = len > 0 ? mx / len : 0;
  const nz = len > 0 ? mz / len : 0;
  stepMover(player, nx * speed * dt, nz * speed * dt, dt, colliders);
  player.vx = nx * speed;
  player.vz = nz * speed;

  // Gravity and jumping: fall with velocity, land on the highest surface
  // within step-up reach. The crane deck is a floor at y=3 — walk up the
  // stairs, or jump the last step.
  const groundY = groundHeightAt(player.x, player.z, colliders, player.y);
  if (player.vy > 0 || player.y > groundY) {
    player.vy -= 14 * dt;
    player.y += player.vy * dt;
    if (player.y <= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
    }
  } else {
    player.y = groundY;
    player.vy = 0;
    player.grounded = true;
  }

  camera.position.set(player.x, player.y + player.eye, player.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
  viewmodel.step(dt, Math.hypot(player.vx, player.vz), 0, 0, aiming);
  if (firing) playerShoot();
  weaponStep(player.weapon, dt);
  if (time < playerFlashUntil) {
    hud.flashOverlay(1 - (time - (playerFlashUntil - playerFlashDuration)) / playerFlashDuration);
  } else {
    hud.flashOverlay(0);
  }
  hud.setHealth(player.hp, player.armor);
  hud.setAmmo(player.weapon.mag, player.weapon.reserve, player.weapon.def.name);
}

function updateBots(dt) {
  const alive = (team) => bots.filter((b) => b.team === team && b.alive);
  const ctx = {
    time,
    dt,
    colliders,
    util,
    points: points.state.points,
    player: godMode ? { ...player, alive: false } : player,
    bots: alive('ember').concat(alive('alloy')),
    emberBots: alive('ember'),
    alloyBots: alive('alloy'),
    lastDeath,
    smokeCovers: (pos) => util.blocksSight(pos, pos),
    random: Math.random,
    onShoot(bot, res) {
      if (res.point) {
        fx.tracer({ x: bot.x, y: bot.y + bot.eye, z: bot.z }, res.point, 0xffd27a);
        if (res.blocked) fx.burst(res.point, 0xffb347);
      }
    },
    onDamage(attacker, victim, part, dmg, def, name) { dealDamage(attacker, victim, dmg, part, def, name); },
    onThrow(kind, from, vel, owner) { util.throw(kind, from, vel, owner); },
  };
  for (const bot of bots) {
    botStep(bot, ctx);
  }
}

// The round clock runs in every phase — buy counts down to live, live
// counts down to the end, over counts down to the next round. It lives here,
// not in updateBots, because updateBots only runs while the round is live.
function stepRounds(dt) {
  const emberAlive = (player.alive ? 1 : 0) + emberBots.filter((b) => b.alive).length;
  const alloyAlive = alloyBots.filter((b) => b.alive).length;
  rounds.step(dt, {
    emberAlive,
    alloyAlive,
    points: points.state.points,
    pointsScore: points.state.score,
    pointsOwned: { ember: points.ownedCount('ember'), alloy: points.ownedCount('alloy') },
  });
}

function stepUtility(dt) {
  util.step(dt, [...bots, player], time, {
    onFrag(grenade, fighters) {
      const center = { x: grenade.x, y: grenade.y, z: grenade.z };
      fx.burst(center, 0xffb347);
      for (const f of fighters) {
        if (!f.alive || f === grenade.owner) continue;
        const dist = Math.hypot(f.x - center.x, f.z - center.z);
        if (dist < GRENADES.frag.radius) {
          dealDamage(grenade.owner, f, GRENADES.frag.damage * (1 - (dist / GRENADES.frag.radius) * 0.7), 'body', { damage: 1, headMult: 1 }, 'Frag');
        }
      }
    },
    onFlash(grenade, victims) {
      for (const v of victims) {
        if (v.fighter === player) {
          playerFlashUntil = time + v.seconds;
          playerFlashDuration = v.seconds;
        } else if (v.fighter.isBot) {
          v.fighter.blindedUntil = time + v.seconds;
        }
      }
    },
    onSmoke(grenade) {
      void grenade;
    },
  });
}

function updateHud() {
  const state = {
    player,
    bots: bots.map((b) => {
      const visible = b.alive && b.team !== player.team && enemyVisibleOnMinimap(player, b, colliders, util);
      return { x: b.x, z: b.z, team: b.team, alive: b.alive, visible };
    }),
    points: points.state.points,
    smokes: util.clouds(),
  };
  hud.updateMinimap(state);
  hud.setScores(points.state.score.ember, points.state.score.alloy);
  hud.setPoints(points.state.points);
  const t = Math.max(0, Math.ceil(rounds.state.timeLeft));
  hud.setTimer(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  hud.step(time);
  // The beacons repaint from the point state: the colour of the light is the
  // colour of the point's owner.
  for (const [key, b] of Object.entries(beacons)) {
    const owner = points.state.points[key].owner;
    const col = ownerColors[owner ?? 'neutral'];
    b.ring.material.color.copy(col);
    b.beam.material.color.copy(col);
    b.letter.material.color.copy(col);
    b.glow.color.copy(col);
  }
}

// --- Start screen ---
const startScreen = document.createElement('div');
startScreen.id = 'start-screen';
startScreen.innerHTML = `
  <h1>NIGHTSHIFT</h1>
  <p class="tagline">Tactical 5v5 · Control points · Container Docks</p>
  <p>You and four bots against five. Take the points, hold them, and tick to 100 — or wipe the other team out.</p>
  <p class="controls">WASD move · Mouse aim · Click shoot · Right-click aim · R reload · B buy<br>4/5/6 grenades · <b>Ctrl crouch</b> · <b>Space jump</b> · Shift sprint</p>
  <button id="start-btn">START MATCH</button>
  <p class="controls">First to 3 rounds · Points A / B / C tick +1 every 2 s · Overtime on a draw</p>`;
document.body.appendChild(startScreen);

function startMatch() {
  if (matchStarted) return;
  matchStarted = true;
  startScreen.remove();
  viewmodel.setWeapon(player.weapon.id);
  hud.setMoney(player.money);
  hud.setGrenades(player.grenades);
  hud.setAmmo(player.weapon.mag, player.weapon.reserve, player.weapon.def.name);
  rounds.startMatch();
}

document.getElementById('start-btn').addEventListener('click', () => {
  startMatch();
  renderer.domElement.requestPointerLock();
});

// --- Screenshot staging ---
if (shotMode === 'start') {
  window.__shotReady = true;
}
if (shotMode === 'play') {
  startMatch();
  // Mid-game: B already ember's, A alloy's, the score ticking, bots holding
  // their points and the player looking at mid from the crane stairs.
  points.state.points.B.owner = 'ember';
  points.state.points.B.progress = 1;
  points.state.points.A.owner = 'alloy';
  points.state.points.A.progress = 1;
  points.state.score.ember = 12;
  points.state.score.alloy = 9;
  rounds.beginLive();
  player.x = 19;
  player.z = 3;
  player.y = 0;
  player.yaw = 1.2;
  player.pitch = -0.04;
  emberBots[0].x = -3; emberBots[0].z = 2;
  alloyBots[0].x = 4; alloyBots[0].z = -3;
  setTimeout(() => { window.__shotReady = true; }, 6000);
}
if (shotMode === 'buy') {
  startMatch();
  hud.showBuyMenu(player.money, player.weapon.id, player.grenades, player.armor > 0);
  setTimeout(() => { window.__shotReady = true; }, 800);
}
if (shotMode === 'end') {
  startMatch();
  points.state.points.B.owner = 'ember';
  points.state.points.B.progress = 1;
  points.state.points.A.owner = 'ember';
  points.state.points.A.progress = 1;
  points.state.score.ember = 100;
  points.state.score.alloy = 41;
  rounds.state.score.ember = 2;
  rounds.state.score.alloy = 1;
  rounds.state.history = ['E', 'A', 'E'];
  handleRoundEvent('match-end', { winner: 'ember', score: rounds.state.score, history: rounds.state.history });
  setTimeout(() => { window.__shotReady = true; }, 800);
}

// --- Main loop ---
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  if (matchStarted && rounds.state.phase !== 'end') {
    if (rounds.state.phase === 'live') {
      // Capture only runs while the round is live.
      points.step(dt, [...bots, player]);
      updatePlayer(dt);
      updateBots(dt);
      stepUtility(dt);
    } else {
      // Buy phase: the world still breathes — the bots idle, the player can
      // walk the map and look around, the points stay reset.
      updatePlayer(dt);
    }
    stepRounds(dt);
    fx.step(dt);
    updateHud();
  }
  renderer.render(scene, camera);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Debug handle for the headless harness and the dev console.
window.__nightshift = { player, points, rounds, bots, beacons };
