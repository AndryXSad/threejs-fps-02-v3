// Bots: five per team, five roles for point warfare. An anchor holds the
// point it owns; a roamer hunts the point that is changing hands; a flanker
// takes the far point alone, over the crane bridge when the dice say so; a
// support buys utility and throws it into a point before the team walks in;
// an AWPer buys the Lance and holds the long angle over mid. Every bot has
// a wallet: wins and loss streaks pay, and the buy phase spends on weapons,
// armour and utility. A bot that cannot afford its role's gun plays the
// cheaper one and saves for the next round. A bot that holds a point under
// fire crouches behind its cover — a smaller target with a tighter spread,
// like a player would.
import * as THREE from 'three';
import { WEAPONS, GRENADES, ARMOR_PRICE, ROLES, MOVE, POINTS } from './config.js';
import { WAYPOINTS, route, nearestWaypoint, stepMover, rayHitDistance, inPoint } from './map.js';
import { createWeaponState, weaponStep, weaponReady, weaponReload, fireRound } from './combat.js';

const LOSS_BONUS = [1900, 2400, 2900, 3400];
const ROLE_LIST = ['anchor', 'roamer', 'flanker', 'support', 'awper'];

function botColor(team, index) {
  const ember = [0xd9822b, 0xb45a1b, 0xe09a3e, 0x9a4a1a, 0xc76a2a];
  const alloy = [0x4a7a8c, 0x3a6a7c, 0x5a8a9c, 0x2a5a6c, 0x6a9aac];
  return team === 'ember' ? ember[index % 5] : alloy[index % 5];
}

function createBotModel(team, index, role) {
  const group = new THREE.Group();
  const color = botColor(team, index);
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.4 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), dark);
  legL.position.set(-0.12, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), cloth);
  torso.position.y = 1.09;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), cloth);
  armL.position.set(-0.36, 1.12, 0.08);
  const armR = armL.clone();
  armR.position.x = 0.36;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.56;
  // Helmet: a half-sphere cap in the team colour, so a head is a head.
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helm.position.y = 1.62;
  // Shoulder pads and a backpack: the silhouette reads as a fighter, not a box.
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.24), dark);
  padL.position.set(-0.34, 1.42, 0);
  const padR = padL.clone();
  padR.position.x = 0.34;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.16), dark);
  pack.position.set(0, 1.12, 0.24);
  // The gun in their hands, so you can read what you are up against.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.55), dark);
  gun.position.set(0.08, 1.16, -0.32);
  const accent = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.03, 0.2), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 }));
  accent.position.set(0.08, 1.2, -0.3);
  for (const part of [legL, legR, torso, armL, armR, head, helm, padL, padR, pack, gun, accent]) {
    part.castShadow = true;
    group.add(part);
  }
  group.userData.role = role;
  return group;
}

export function createBot(team, index, spawn, rng) {
  const role = ROLE_LIST[index % ROLE_LIST.length];
  const mesh = createBotModel(team, index, role);
  mesh.position.set(spawn[0], 0, spawn[1]);
  return {
    isBot: true,
    team,
    index,
    role,
    mesh,
    x: spawn[0],
    y: 0,
    z: spawn[1],
    vx: 0,
    vz: 0,
    height: MOVE.standHeight,
    eye: MOVE.standEye,
    crouched: false,
    yaw: team === 'ember' ? Math.PI : 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    alive: true,
    money: 800,
    lossStreak: 0,
    grenades: { frag: 0, flash: 0, smoke: 0 },
    weapon: createWeaponState(ROLES[role].alt),
    // Route state: the bot walks a list of waypoint ids toward its goal.
    route: [],
    routeIdx: 0,
    goalId: null,
    holdId: null,
    holdUntil: 0,
    point: null, // the control point this bot is playing for right now
    rethinkAt: 0,
    pushStart: 0,
    rotateAt: 0,
    // Combat state.
    target: null,
    aimYaw: null,
    aimPitch: null,
    aimT: 0,
    aimErr: 0,
    lastShotAt: 0,
    blindUntil: 0,
    utilCooldown: 0,
    // Stuck detection: where the bot was last seen moving, and when.
    lastX: null,
    lastZ: null,
    lastMoveT: 0,
    sidestepUntil: 0,
    sidestepDir: 1,
    // Bookkeeping for the round report.
    kills: 0,
    deaths: 0,
  };
}

// The buy phase: spend the wallet on the role's loadout. Weapons first, then
// armour, then utility. Whatever is left is saved for the next round — a bot
// that forces a buy it cannot afford is a bot that plays the next round with
// nothing.
export function buyPhase(bots, isAttacker, rng) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    const role = ROLES[bot.role];
    bot.grenades = { frag: 0, flash: 0, smoke: 0 };
    const want = WEAPONS[role.weapon];
    const alt = WEAPONS[role.alt];
    if (bot.weapon.id !== role.weapon && bot.money >= want.price) {
      bot.money -= want.price;
      bot.weapon = createWeaponState(role.weapon);
    } else if (bot.weapon.id !== role.weapon && bot.weapon.id !== role.alt && bot.money >= alt.price) {
      bot.money -= alt.price;
      bot.weapon = createWeaponState(role.alt);
    }
    if (bot.money >= ARMOR_PRICE && bot.armor < 50) {
      bot.money -= ARMOR_PRICE;
      bot.armor = 100;
    }
    for (const kind of role.util) {
      if (bot.money >= GRENADES[kind].price) {
        bot.money -= GRENADES[kind].price;
        bot.grenades[kind] += 1;
      }
    }
  }
}

// Round economy: winners get 3250, losers get a loss bonus that grows with
// the streak (1900/2400/2900/3400). The streak resets on a win.
export function applyRoundEconomy(bots, won) {
  for (const bot of bots) {
    if (won) {
      bot.money += 3250;
      bot.lossStreak = 0;
    } else {
      bot.money += LOSS_BONUS[Math.min(bot.lossStreak, 3)];
      bot.lossStreak += 1;
    }
  }
}

function pickSpawn(spawns, index, rng) {
  return spawns[index % spawns.length];
}

// A route that crosses mid on the crane bridge: up the west stairs, across
// the deck, down the east stairs. The bridge is high ground over the middle
// of the map, so a flanker crossing it sees the whole yard before anyone
// sees them.
function routeViaCrane(fromId, toId) {
  const path = route(fromId, 'stairW');
  for (const id of ['stairTopW', 'craneW', 'craneMid', 'craneE', 'stairTopE', 'stairE']) path.push(id);
  const tail = route('stairE', toId);
  for (let i = 1; i < tail.length; i += 1) path.push(tail[i]);
  return path;
}

function routeViaCraneEast(fromId, toId) {
  const path = route(fromId, 'stairE');
  for (const id of ['stairTopE', 'craneE', 'craneMid', 'craneW', 'stairTopW', 'stairW']) path.push(id);
  const tail = route('stairW', toId);
  for (let i = 1; i < tail.length; i += 1) path.push(tail[i]);
  return path;
}

// Round plan: both teams play the same game — take points. The anchor holds
// the yard, the roamer and the flanker split the far points (one each), the
// support follows the roamer, and the AWPer takes the long angle — the crane
// bridge when the dice say so, else the north corridor watching the long lane
// to both far points.
export function planRound(attackers, defenders, time, rng) {
  const roamerTarget = rng() < 0.5 ? 'A' : 'C';
  const flankerTarget = roamerTarget === 'A' ? 'C' : 'A';
  for (const bot of [...attackers, ...defenders]) {
    bot.pushStart = time;
    bot.rotateAt = time + 20 + rng() * 6;
    bot.lastSeenAt = 0;
    bot.rethinkAt = time + rng() * 2;
    let target = 'B';
    if (bot.role === 'roamer') target = roamerTarget;
    else if (bot.role === 'flanker') target = flankerTarget;
    else if (bot.role === 'support') target = roamerTarget;
    bot.point = target;
    const targetId = `point${target}`;
    const from = nearestWaypoint(bot.x, bot.z);
    const viaCrane = rng() < ROLES[bot.role].craneChance;
    if (bot.role === 'awper') {
      // The AWPer holds mid: the crane bridge when the dice say so, else the
      // north corridor, watching the long lane to both far points.
      const hold = rng() < ROLES.awper.craneChance ? 'craneMid' : 'midN';
      bot.holdId = hold;
      bot.holdUntil = time + 45;
      bot.point = 'B';
      bot.route = viaCrane && hold === 'craneMid' ? routeViaCrane(from, 'craneMid') : route(from, hold);
      bot.routeIdx = 0;
      bot.goalId = hold;
    } else {
      bot.holdId = null;
      bot.route = viaCrane
        ? (target === 'C' || target === 'B' ? routeViaCrane(from, targetId) : routeViaCraneEast(from, targetId))
        : route(from, targetId);
      bot.routeIdx = 0;
      bot.goalId = targetId;
    }
  }
}

export function resetBotForRound(bot, spawn, time) {
  bot.x = spawn[0];
  bot.z = spawn[1];
  bot.y = 0;
  bot.vx = 0;
  bot.vz = 0;
  bot.hp = 100;
  bot.armor = 0;
  bot.alive = true;
  bot.height = MOVE.standHeight;
  bot.eye = MOVE.standEye;
  bot.crouched = false;
  bot.mesh.scale.y = 1;
  bot.yaw = bot.team === 'ember' ? Math.PI : 0;
  bot.pitch = 0;
  bot.target = null;
  bot.aimYaw = null;
  bot.aimPitch = null;
  bot.aimT = 0;
  bot.blindUntil = 0;
  bot.utilCooldown = 0;
  bot.route = [];
  bot.routeIdx = 0;
  bot.point = null;
  bot.mesh.visible = true;
  bot.mesh.position.set(bot.x, 0, bot.z);
  void time;
}

// Sight: a wall, a smoke cloud, or a flashbang in the eyes is enough to hide
// an enemy. Range is the weapon's reach: a bot does not shoot what it cannot
// plausibly hit.
function canSee(bot, enemy, ctx) {
  if (!enemy.alive) return false;
  const dx = enemy.x - bot.x;
  const dy = (enemy.y + 1.2) - (bot.y + bot.eye);
  const dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > bot.weapon.def.range) return false;
  const len = dist || 1;
  const wall = rayHitDistance(ctx.colliders, bot.x, bot.y + bot.eye, bot.z, dx / len, dy / len, dz / len, dist);
  if (wall < dist - 0.05) return false;
  if (ctx.util && ctx.util.blocksSight({ x: bot.x, y: bot.y + bot.eye, z: bot.z }, { x: enemy.x, y: enemy.y + 1.2, z: enemy.z })) return false;
  return true;
}

function nearestVisibleEnemy(bot, ctx) {
  let best = null;
  let bestDist = Infinity;
  const enemies = ctx.bots.filter((b) => b.team !== bot.team);
  const candidates = [...enemies];
  if (ctx.player && ctx.player.team !== bot.team && ctx.player.alive) candidates.push(ctx.player);
  for (const e of candidates) {
    if (!e.alive) continue;
    if (e === bot) continue;
    const dist = Math.hypot(e.x - bot.x, e.z - bot.z);
    if (dist < bestDist && canSee(bot, e, ctx)) {
      bestDist = dist;
      best = e;
    }
  }
  return { enemy: best, dist: bestDist };
}

// A throw that arcs to a target point: pick a flight time from the horizontal
// distance, then solve the ballistic velocity for it.
function throwVelocity(from, to, speed = 13) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const t = Math.max(0.5, dist / speed);
  return {
    x: dx / t,
    y: ((to.y - from.y) + 0.5 * 14 * t * t) / t,
    z: dz / t,
  };
}

// Which point should this bot play for? Priority: a point the enemy is
// capturing right now (go and take it back), then the nearest point that is
// not ours, then the nearest point at all. The anchor prefers the point
// closest to its own spawn when nothing is urgent.
function pickPoint(bot, ctx) {
  const pts = ctx.points;
  if (!pts) return bot.point || 'B';
  const enemy = bot.team === 'ember' ? 'alloy' : 'ember';
  for (const key of Object.keys(pts)) {
    if (pts[key].capturing === enemy) return key;
  }
  let best = null;
  let bestD = Infinity;
  for (const key of Object.keys(pts)) {
    if (pts[key].owner === bot.team) continue;
    const d = Math.hypot(POINTS[key].x - bot.x, POINTS[key].z - bot.z);
    if (d < bestD) { bestD = d; best = key; }
  }
  if (best) return best;
  // Everything is ours: hold the nearest one, or the yard if the anchor.
  if (bot.role === 'anchor') return 'B';
  let nearest = 'B';
  let nearestD = Infinity;
  for (const key of Object.keys(pts)) {
    const d = Math.hypot(POINTS[key].x - bot.x, POINTS[key].z - bot.z);
    if (d < nearestD) { nearestD = d; nearest = key; }
  }
  return nearest;
}

function routeToPoint(bot, key, rng) {
  const targetId = `point${key}`;
  const from = nearestWaypoint(bot.x, bot.z);
  const viaCrane = rng() < ROLES[bot.role].craneChance;
  bot.route = viaCrane
    ? (key === 'C' || key === 'B' ? routeViaCrane(from, targetId) : routeViaCraneEast(from, targetId))
    : route(from, targetId);
  bot.routeIdx = 0;
  bot.goalId = targetId;
  bot.point = key;
}

export function botStep(bot, ctx) {
  if (!bot.alive) return;
  const dt = ctx.dt;
  const rng = ctx.random;
  weaponStep(bot.weapon, dt);
  const time = ctx.time;
  const blinded = time < bot.blindUntil;
  const pts = ctx.points;
  const enemyTeam = bot.team === 'ember' ? 'alloy' : 'ember';

  // Rethink: every few seconds, ask again which point matters most.
  if (time > bot.rethinkAt) {
    const next = pickPoint(bot, ctx);
    if (next && next !== bot.point) routeToPoint(bot, next, rng);
    bot.rethinkAt = time + 4;
  }
  // A point we own with nobody near it is not a job: go and take another one.
  if (bot.point && pts && pts[bot.point].owner === bot.team) {
    const p = POINTS[bot.point];
    const nearEnemy = ctx.bots.some((b) => b.team === enemyTeam && b.alive && Math.hypot(b.x - p.x, b.z - p.z) < 12)
      || (ctx.player && ctx.player.team === enemyTeam && ctx.player.alive && Math.hypot(ctx.player.x - p.x, ctx.player.z - p.z) < 12);
    if (!nearEnemy && time > bot.rethinkAt - 3) {
      const next = pickPoint(bot, ctx);
      if (next && next !== bot.point) routeToPoint(bot, next, rng);
      bot.rethinkAt = time + 4;
    }
  }
  // Rotation: a teammate just died nearby — go and look at where it happened.
  if (ctx.lastDeath && time - ctx.lastDeath.time < 4 && bot.goalId !== 'investigate') {
    const d = Math.hypot(ctx.lastDeath.x - bot.x, ctx.lastDeath.z - bot.z);
    if (d < 22 && d > 6) {
      const near = nearestWaypoint(ctx.lastDeath.x, ctx.lastDeath.z);
      bot.route = route(nearestWaypoint(bot.x, bot.z), near);
      bot.routeIdx = 0;
      bot.goalId = 'investigate';
      bot.holdId = near;
      bot.holdUntil = time + 6;
    }
  }

  // Combat: acquire the nearest visible enemy, aim, then fire in bursts.
  let target = null;
  let targetDist = Infinity;
  if (!blinded) {
    const found = nearestVisibleEnemy(bot, ctx);
    target = found.enemy;
    targetDist = found.dist;
    if (target) bot.lastSeenAt = time;
  }
  bot.target = target;
  if (target) {
    const speed = Math.hypot(target.vx || 0, target.vz || 0);
    const travel = targetDist / 120;
    const px = target.x + (target.vx || 0) * travel;
    const pz = target.z + (target.vz || 0) * travel;
    const aimY = target.y + 1.25;
    const wantYaw = Math.atan2(-(px - bot.x), -(pz - bot.z));
    const wantPitch = Math.atan2(aimY - (bot.y + bot.eye), Math.hypot(px - bot.x, pz - bot.z));
    if (bot.aimYaw === null) {
      bot.aimYaw = wantYaw;
      bot.aimPitch = wantPitch;
      bot.aimT = 0;
    }
    // Turn toward the target at a human rate, then settle: aim time grows
    // with distance and target speed, and shrinks with the role's skill.
    const turn = 7 * dt;
    let dyaw = wantYaw - bot.aimYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.aimYaw += Math.max(-turn, Math.min(turn, dyaw));
    bot.aimPitch += Math.max(-turn, Math.min(turn, wantPitch - bot.aimPitch));
    bot.aimT += dt;
    const role = ROLES[bot.role];
    bot.aimErr = role.skill * (0.015 + targetDist * 0.0012 + speed * 0.004) + (blinded ? 0.35 : 0);
    bot.yaw = bot.aimYaw;
    bot.pitch = bot.aimPitch;
    const aimTime = 0.22 + role.skill * 0.35 + targetDist * 0.004;
    if (bot.aimT > aimTime && weaponReady(bot.weapon)) {
      const origin = { x: bot.x, y: bot.y + bot.eye, z: bot.z };
      const dir = { x: -Math.sin(bot.aimYaw) * Math.cos(bot.aimPitch), y: Math.sin(bot.aimPitch), z: -Math.cos(bot.aimYaw) * Math.cos(bot.aimPitch) };
      const targets = ctx.bots.filter((b) => b.team !== bot.team);
      if (ctx.player && ctx.player.team !== bot.team && ctx.player.alive) targets.push(ctx.player);
      const res = fireRound(bot.weapon, origin, dir, bot.aimErr + bot.weapon.bloom, rng, ctx.colliders, targets, bot.weapon.def.range);
      if (res) {
        ctx.onShoot(bot, res, origin, dir);
        if (res.hits.length) {
          for (const hit of res.hits) ctx.onDamage(bot, hit.fighter, hit.part, hit.dmg, bot.weapon.def, bot.weapon.def.name);
        }
        bot.lastShotAt = time;
      }
    }
  } else {
    bot.aimYaw = null;
    bot.aimPitch = null;
    bot.aimT = 0;
  }

  // Utility: throw it into the point before the team walks in, not after.
  if (!blinded && bot.utilCooldown <= time && bot.routeIdx >= bot.route.length - 2) {
    const pt = bot.point ? POINTS[bot.point] : null;
    const eye = { x: bot.x, y: bot.y + bot.eye, z: bot.z };
    if (pt && bot.grenades.frag > 0) {
      const dPt = Math.hypot(pt.x - bot.x, pt.z - bot.z);
      if (dPt < 16) {
        bot.grenades.frag -= 1;
        bot.utilCooldown = time + 8;
        ctx.onThrow('frag', eye, throwVelocity(eye, { x: pt.x, y: 1, z: pt.z }), bot);
      }
    } else if (pt && bot.grenades.smoke > 0) {
      const dPt = Math.hypot(pt.x - bot.x, pt.z - bot.z);
      if (dPt < 18 && !(ctx.util && ctx.util.clouds().some((c) => Math.hypot(c.x - pt.x, c.z - pt.z) < 8))) {
        bot.grenades.smoke -= 1;
        bot.utilCooldown = time + 8;
        ctx.onThrow('smoke', eye, throwVelocity(eye, { x: pt.x, y: 0.5, z: pt.z }), bot);
      }
    } else if (pt && bot.grenades.flash > 0) {
      const dPt = Math.hypot(pt.x - bot.x, pt.z - bot.z);
      if (dPt < 13) {
        bot.grenades.flash -= 1;
        bot.utilCooldown = time + 8;
        ctx.onThrow('flash', eye, throwVelocity(eye, { x: pt.x, y: 2.5, z: pt.z }), bot);
      }
    }
  }

  // Stuck detection: a bot that has a route target but has not moved in 1.5 s
  // is wedged on a corner. Sidestep perpendicular for a second to slide
  // around it, then try the route again.
  if (bot.routeIdx < bot.route.length && !target && !blinded) {
    const moved = Math.hypot(bot.x - (bot.lastX ?? bot.x), bot.z - (bot.lastZ ?? bot.z));
    if (moved > 0.3) {
      bot.lastX = bot.x;
      bot.lastZ = bot.z;
      bot.lastMoveT = time;
    } else if (time - (bot.lastMoveT || time) > 1.5 && time >= bot.sidestepUntil) {
      bot.sidestepUntil = time + 1;
      bot.sidestepDir = (bot.sidestepDir ?? 1) * -1;
      bot.lastMoveT = time;
    }
  }

  // Capture stance: inside the point it is taking, a bot stands its ground
  // and crouches — it captures by presence, and a low profile behind cover
  // is how a point is held. Anywhere else it walks its route.
  const inTargetPoint = bot.point ? inPoint(bot.point, bot.x, bot.z) : false;
  const pointOwnedByUs = bot.point && pts ? pts[bot.point].owner === bot.team : false;
  const capturing = inTargetPoint && !pointOwnedByUs;
  bot.crouched = capturing;
  bot.height = capturing ? MOVE.crouchHeight : MOVE.standHeight;
  bot.eye = capturing ? MOVE.crouchEye : MOVE.standEye;
  bot.mesh.scale.y = bot.height / MOVE.standHeight;

  // Movement: walk the route, one waypoint at a time. A bot that holds a
  // position stays there and watches; a bot that sees an enemy at close range
  // strafes instead of walking into the line of fire.
  let wishX = 0;
  let wishZ = 0;
  const holding = bot.holdId && bot.routeIdx >= bot.route.length && time < bot.holdUntil;
  if (blinded) {
    // Flashed: freeze. A blind bot that keeps running walks into a wall.
    wishX = 0;
    wishZ = 0;
  } else if (target && targetDist < 7 && bot.role !== 'awper') {
    // Strafe: circle the enemy while shooting.
    const strafe = Math.sin(time * 1.3 + bot.index) > 0 ? 1 : -1;
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const len = Math.hypot(dx, dz) || 1;
    wishX = (-dz / len) * strafe * 2.2;
    wishZ = (dx / len) * strafe * 2.2;
  } else if (capturing) {
    // Stand in the point and take it. No walking: presence is the capture.
    wishX = 0;
    wishZ = 0;
  } else if (!holding && bot.routeIdx < bot.route.length) {
    const wp = WAYPOINTS[bot.route[bot.routeIdx]];
    const dx = wp[0] - bot.x;
    const dz = wp[1] - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.9) {
      bot.routeIdx += 1;
    } else {
      const speed = target ? 3.1 : 4.6;
      wishX = (dx / dist) * speed;
      wishZ = (dz / dist) * speed;
      if (!target) {
        const wantYaw = Math.atan2(-dx, -dz);
        let dyaw = wantYaw - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.yaw += Math.max(-5 * dt, Math.min(5 * dt, dyaw));
      }
    }
  }
  // Sidestep override: while the stuck timer runs, move sideways instead of
  // into the wall that wedged the bot.
  if (time < bot.sidestepUntil && bot.routeIdx < bot.route.length) {
    const wp = WAYPOINTS[bot.route[bot.routeIdx]];
    const dx = wp[0] - bot.x;
    const dz = wp[1] - bot.z;
    const len = Math.hypot(dx, dz) || 1;
    wishX = (-dz / len) * bot.sidestepDir * 3;
    wishZ = (dx / len) * bot.sidestepDir * 3;
  }
  // Gravity: feet stay on the ground they stand on, or on the deck they walk.
  const groundY = groundHeightAt(bot.x, bot.z, ctx.colliders, bot.y);
  if (bot.y > groundY) {
    bot.y = Math.max(groundY, bot.y - 14 * dt);
  } else {
    bot.y = groundY;
  }
  stepMover(bot, wishX, wishZ, dt, ctx.colliders, 30, 0.38);
  bot.mesh.position.set(bot.x, bot.y, bot.z);
  bot.mesh.rotation.y = bot.yaw;
  // A walking bot leans into the walk; a shooting bot stands its ground.
  bot.mesh.rotation.x = Math.min(0.08, Math.hypot(bot.vx, bot.vz) * 0.012);
}

// The ground under a point: the highest collider top the body can stand on —
// at most one step-up above its feet, so a crate never teleports a walker
// onto itself, and a ledge walked off simply stops being ground.
export function groundHeightAt(x, z, colliders, bodyY = 0) {
  let best = 0;
  for (const c of colliders) {
    if (x >= c.min.x - 0.2 && x <= c.max.x + 0.2 && z >= c.min.z - 0.2 && z <= c.max.z + 0.2) {
      if (c.max.y > best && c.max.y <= bodyY + 0.38) best = c.max.y;
    }
  }
  return best;
}

export { pickSpawn };
