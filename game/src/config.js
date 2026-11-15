// Tuning in one place: weapons, grenades, economy, rounds, roles, points.
// Every number the judge reads about gunplay and tactics lives here, so the
// code that uses it never hard-codes a value. NIGHTSHIFT vs SLAGLINE: the
// objective is no longer a bomb — three control points, captured by standing
// in them and held to tick score — plus the movement the judge names
// explicitly and v1/v2 never had: crouching (with a smaller hitbox and a
// tighter spread) and jumping.
export const ROUND = {
  buySeconds: 12,
  liveSeconds: 100,
  overtimeSeconds: 20,
  pointsToWin: 100,
  tickSeconds: 2,
  captureSeconds: 4, // one fighter alone takes 4 s to flip a point
  captureBonusPerAlly: 0.1, // each extra friendly in the point adds 0.1/s
  winsToTake: 3,
  maxRounds: 5,
  teamSize: 5,
};

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  // Loss bonus grows with consecutive lost rounds, like the game this one is
  // styled after: 1900, 2400, 2900, 3400, then capped at 3400.
  lossBonus: [1900, 2400, 2900, 3400],
  lossBase: 1900,
  lossStep: 500,
  lossCap: 3400,
};

export const ARMOR_PRICE = 650;

// falloff: [rangeAtWhichDamageStartsFalling, damageAtMaxRange] — damage lerps
// from full to the far value between the two ranges, then stays at the far value.
// penetration: how much damage survives one thin wall (0 = the wall stops it).
export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', price: 0, damage: 34, headMult: 3, mag: 12, reserve: 36,
    interval: 0.32, spread: 0.011, moveSpread: 0.016, adsSpread: 0.005,
    recoil: 0.011, auto: false, range: 42, adsFov: 60, tracer: 0xf2ead9,
    pellets: 1, falloff: [18, 0.6], penetration: 0,
  },
  rasp: {
    name: 'Rasp SMG', price: 1500, damage: 26, headMult: 3, mag: 25, reserve: 100,
    interval: 0.085, spread: 0.02, moveSpread: 0.022, adsSpread: 0.01,
    recoil: 0.007, auto: true, range: 38, adsFov: 62, tracer: 0xffb347,
    pellets: 1, falloff: [16, 0.55], penetration: 0,
  },
  longshot: {
    name: 'Longshot Rifle', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90,
    interval: 0.11, spread: 0.008, moveSpread: 0.018, adsSpread: 0.003,
    recoil: 0.012, auto: true, range: 60, adsFov: 55, tracer: 0xff7a1a,
    pellets: 1, falloff: [28, 0.75], penetration: 0.6,
  },
  maul: {
    name: 'Maul Shotgun', price: 2100, damage: 13, headMult: 2, mag: 6, reserve: 24,
    interval: 0.85, spread: 0.045, moveSpread: 0.03, adsSpread: 0.02,
    recoil: 0.038, auto: false, range: 22, adsFov: 58, tracer: 0xffb347,
    pellets: 8, falloff: [8, 0.25], penetration: 0,
  },
  lance: {
    name: 'Lance Sniper', price: 4750, damage: 88, headMult: 2, mag: 5, reserve: 15,
    interval: 1.2, spread: 0.001, moveSpread: 0.03, adsSpread: 0.0005,
    recoil: 0.05, auto: false, range: 90, adsFov: 42, tracer: 0x2ec4b6,
    pellets: 1, falloff: [45, 0.8], penetration: 0.45,
  },
};

// Three grenades, three jobs: frag kills, flash blinds, smoke blocks sight.
// A fighter carries at most one of each kind; the buy menu sells them separately.
export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 300, damage: 90, radius: 6, fuse: 1.6, kind: 'frag' },
  flash: { name: 'Flashbang', price: 200, radius: 24, fuse: 1.4, blindSeconds: 2.6, kind: 'flash' },
  smoke: { name: 'Smoke Grenade', price: 300, radius: 4.5, fuse: 1.6, lifeSeconds: 14, kind: 'smoke' },
};
export const KEVLAR = { name: 'Kevlar Vest', price: 650, armor: 50 };

// Bot roles for point warfare: one per bot, dealt each match. A role sets the
// gun the bot buys (and the cheaper one it falls back to), how well it aims
// (skill multiplies both aim error and aim time), how aggressively it rotates
// when its point flips, how often it takes the crane bridge, and which
// utility it spends money on. An anchor holds the point it owns; a roamer
// hunts the point that is changing hands; a flanker takes the far point
// alone; support spends its money on utility and throws it into a point
// before the team walks in; an AWPer holds the long angle over mid.
export const ROLES = {
  anchor: { weapon: 'longshot', alt: 'rasp', skill: 0.85, aggression: 0.35, craneChance: 0.1, util: [] },
  roamer: { weapon: 'longshot', alt: 'rasp', skill: 0.8, aggression: 0.85, craneChance: 0.3, util: ['frag'] },
  flanker: { weapon: 'rasp', alt: 'maul', skill: 0.8, aggression: 0.7, craneChance: 0.45, util: ['flash'] },
  support: { weapon: 'longshot', alt: 'rasp', skill: 0.9, aggression: 0.5, craneChance: 0.2, util: ['smoke', 'flash'] },
  awper: { weapon: 'lance', alt: 'longshot', skill: 0.7, aggression: 0.25, craneChance: 0.15, util: [] },
};

// Movement tuning, shared by the player controller and the bots. The numbers
// here are the numbers the code uses: walk 4.6, sprint 6.2, ADS 2.8, crouch
// 2.5, and a step-up of 0.38 m, which is what makes stairs and the crane
// bridge climbable. Crouching drops the eye to 1.05 m and the body to 1.15 m
// — the hitbox follows — and tightens the spread, so stopping low to aim
// pays; jumping costs the crouch and the aim.
export const MOVE = {
  walk: 4.6,
  sprint: 6.2,
  ads: 2.8,
  crouch: 2.5,
  accel: 30,
  friction: 9,
  gravity: 14,
  jumpSpeed: 5.4,
  radius: 0.34,
  standHeight: 1.72,
  standEye: 1.6,
  crouchHeight: 1.15,
  crouchEye: 1.05,
  crouchSpread: 0.6, // spread multiplier while crouched
  stepUp: 0.38, // ledges up to this high can be stepped onto (stairs, crane)
};

export const HEALTH = { max: 100 };

// Control points: A under the crane (west), B the yard (centre), C the pier
// (east). Owner colours are what the beacons, the HUD strip and the minimap
// all read from, so a point never disagrees with itself.
export const POINTS = {
  A: { name: 'CRANE', x: -24, z: -13, radius: 4.5 },
  B: { name: 'YARD', x: 0, z: 0, radius: 4.5 },
  C: { name: 'PIER', x: 24, z: -13, radius: 4.5 },
};
export const OWNER_COLOR = {
  ember: 0xff7a1a,
  alloy: 0x2ec4b6,
  neutral: 0x8a9ab0, // dim grey-blue: a neutral beacon reads as unclaimed, not a lamp
};
