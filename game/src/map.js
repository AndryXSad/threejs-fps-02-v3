// NIGHTSHIFT: a container port at night, 64 x 44 m, built from containers,
// a crane bridge and three control points. A under the crane (west), B the
// yard (centre), C the pier (east). Three lanes, two cross corridors, and a
// crane bridge over mid that turns the middle of the map into a second floor
// worth fighting for. Every box is a collider for movement and a surface a
// bullet stops on. The waypoint graph is what the bots walk: nodes at every
// junction, edges between neighbours, crane nodes included.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { POINTS, OWNER_COLOR } from './config.js';
import { yardTexture, wallTexture, hazardTexture, containerTexture, craneTexture } from './textures.js';

// [centerX, centerZ, width, depth, height, material]
const BOXES = [
  // Floor and perimeter (floor is not a wall: it is the ground the feet stand on).
  [0, 0, 66, 46, 0.4, 'yard'],
  [-32.5, 0, 1, 46, 4.6, 'surface'],
  [32.5, 0, 1, 46, 4.6, 'surface'],
  [0, -22.5, 66, 1, 4.6, 'surface'],
  [0, 22.5, 66, 1, 4.6, 'surface'],
  // South connector stubs: gaps at the centre and at both edges.
  [-17, 9, 7, 1, 2.6, 'hairline'],
  [17, 9, 7, 1, 2.6, 'hairline'],
  // Mid walls flanking the yard point: corners worth holding.
  [-9.5, -5, 1, 8, 3.2, 'surface'],
  [9.5, -5, 1, 8, 3.2, 'surface'],
  [-9.5, 9, 1, 6, 2.6, 'hairline'],
  [9.5, 9, 1, 6, 2.6, 'hairline'],
  // Low walls at A and C: crouch cover inside the point.
  [-24, -17.5, 8, 1, 1.2, 'hairline'],
  [24, -17.5, 8, 1, 1.2, 'hairline'],
  // Lane crates: crouch cover at the lane edges, never on the lane centreline
  // (a bot walking the centreline must not meet a crate head-on).
  [-22.5, -3, 2, 2, 1.1, 'crate'],
  [-22.5, 7, 2, 2, 1.1, 'crate'],
  [22.5, -3, 2, 2, 1.1, 'crate'],
  [22.5, 7, 2, 2, 1.1, 'crate'],
  [-5, 14, 2.4, 1.4, 0.9, 'crate'],
  [5, 14, 2.4, 1.4, 0.9, 'crate'],
  [-14, -14, 2, 2, 1.1, 'crate'],
  [14, -14, 2, 2, 1.1, 'crate'],
  [-28, 4, 2, 2, 1.1, 'crate'],
  [28, 4, 2, 2, 1.1, 'crate'],
  // Pillars that break the long sightlines.
  [-8, -15, 1.2, 1.2, 4.2, 'steel'],
  [8, -15, 1.2, 1.2, 4.2, 'steel'],
  [-8, 15, 1.2, 1.2, 4.2, 'steel'],
  [8, 15, 1.2, 1.2, 4.2, 'steel'],
  // Container rows: the yard's own walls, ribbed steel in three colours.
  [-14, 6, 4.5, 2.2, 2.4, 'rust'],
  [14, 6, 4.5, 2.2, 2.4, 'tealbox'],
  [-15, -14, 4.5, 2.2, 2.4, 'olive'],
  [15, -14, 4.5, 2.2, 2.4, 'rust'],
  // Point B ring: four low crates on the diagonals, crouch cover inside the
  // point itself. They sit off the waypoint lines, so a bot walking into B
  // never meets one head-on.
  [-2.8, -2.8, 1.6, 1.6, 1.1, 'crate'],
  [2.8, -2.8, 1.6, 1.6, 1.1, 'crate'],
  [-2.8, 2.8, 1.6, 1.6, 1.1, 'crate'],
  [2.8, 2.8, 1.6, 1.6, 1.1, 'crate'],
  // Crane legs over point A.
  [-27, -16, 1.2, 1.2, 5.0, 'crane'],
  [-21, -16, 1.2, 1.2, 5.0, 'crane'],
  // Pier stack at C: a two-high container, the tallest cover on the map.
  [28, -17, 4, 2, 4.8, 'tealbox'],
  [28, -8, 2, 2, 2.4, 'olive'],
];

// The crane bridge deck: raised slabs over mid, [centerX, centerZ, width, depth, topY].
// The deck hangs at y = 3.0 on the crane's own supports; the stairs below climb
// to it. Deck slabs are thin (0.3 m), so a shot from below stops on the deck
// and a fighter on top can shoot over the mid walls.
const DECKS = [
  // One continuous walkway: any gap in the deck would drop a walker crossing
  // mid, so the slab runs the whole 53 m from stair to stair.
  [0, -6, 53, 2.4, 3.0],
];

// Stair steps: nine boxes of 0.34 rise each, climbing from the ground to the
// crane bridge deck. The stairs run north along the deck's south edge, so no step
// ever passes under the deck slab: the top step lands flush on the deck's lip.
// [centerX, centerZ, width, depth, topY]
const STAIRS = [];
for (let i = 0; i < 9; i += 1) {
  const top = 0.34 * (i + 1);
  // West stairs at x = -20, climbing north from z = 1.5 to z = -4.9.
  STAIRS.push([-20, 1.5 - i * 0.8, 2.4, 0.9, top, 'crane']);
  // East stairs at x = 20, same climb.
  STAIRS.push([20, 1.5 - i * 0.8, 2.4, 0.9, top, 'crane']);
}

export const SPAWNS = {
  ember: [[-5, 19], [-2, 20], [0, 18.5], [2, 20], [5, 19]],
  alloy: [[-5, -19], [-2, -20], [0, -18.5], [2, -20], [5, -19]],
};

// Waypoint graph: id -> [x, z], edges by id. Bots walk edges; a bot hunting a
// point walks to its node, an anchor holds near one, the AWPer holds the
// crane. Crane nodes sit on the deck (y = 3): a bot that paths through them
// climbs the stairs, crosses over mid, and drops down the other side.
export const WAYPOINTS = {
  spawnE: [0, 19], south: [0, 12], westS: [-19, 12], eastS: [19, 12],
  westGap: [-24, 9], eastGap: [24, 9],
  westM: [-19, 2], eastM: [19, 2], midW: [-6.5, 0], midE: [6.5, 0],
  westC: [-14, -7], eastC: [14, -7], midN: [0, -9],
  westN: [-19, -11], eastN: [19, -11],
  pointA: [-24, -13], pointB: [0, 0], pointC: [24, -13], defN: [0, -18],
  stairW: [-20, 1.5], stairTopW: [-20, -5.5], craneW: [-14, -6], craneMid: [0, -6], craneE: [14, -6], stairTopE: [20, -5.5], stairE: [20, 1.5],
};
export const EDGES = {
  spawnE: ['south', 'westS', 'eastS'],
  south: ['spawnE', 'westS', 'eastS', 'midW', 'midE'],
  // The south connector wall blocks the lanes at z = 9: the west and east
  // lanes cross it only through the gaps at the map edges, so the graph
  // routes through the gap waypoints instead of straight through the wall.
  westS: ['spawnE', 'south', 'westGap'],
  eastS: ['spawnE', 'south', 'eastGap'],
  westGap: ['westS', 'westM'],
  eastGap: ['eastS', 'eastM'],
  westM: ['westGap', 'westC', 'westN', 'stairW'],
  eastM: ['eastGap', 'eastC', 'eastN', 'stairE'],
  midW: ['south', 'midN', 'westC', 'pointB'],
  midE: ['south', 'midN', 'eastC', 'pointB'],
  westC: ['westM', 'midW', 'westN'],
  eastC: ['eastM', 'midE', 'eastN'],
  midN: ['midW', 'midE', 'westN', 'eastN', 'defN', 'pointB'],
  westN: ['westM', 'westC', 'midN', 'pointA'],
  eastN: ['eastM', 'eastC', 'midN', 'pointC'],
  pointA: ['westN'],
  pointB: ['midW', 'midE', 'midN'],
  pointC: ['eastN'],
  defN: ['midN', 'westN', 'eastN'],
  // The crane bridge is its own loop, entered only by the stairs: a bot that
  // paths through it climbs up, crosses over mid, and comes down the other
  // side. Nothing routes a bot off the deck edge mid-walk. The stair-top
  // waypoints matter: a bot that steers straight from the stair base to the
  // deck would cut the corner and walk off the side of the staircase, so the
  // route goes up the stairs first (stairW -> stairTopW, straight north) and
  // only then turns east along the deck.
  stairW: ['westM', 'stairTopW'],
  stairTopW: ['stairW', 'craneW'],
  craneW: ['stairTopW', 'craneMid'],
  craneMid: ['craneW', 'craneE'],
  craneE: ['craneMid', 'stairTopE'],
  stairTopE: ['craneE', 'stairE'],
  stairE: ['eastM', 'stairTopE'],
};

// Breadth-first route over the graph; returns an array of waypoint ids.
export function route(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of EDGES[cur] ?? []) {
      if (prev[next] !== undefined) continue;
      prev[next] = cur;
      if (next === toId) {
        const path = [toId];
        let node = cur;
        while (node) { path.unshift(node); node = prev[node]; }
        return path;
      }
      queue.push(next);
    }
  }
  return [toId];
}

export function nearestWaypoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [id, [wx, wz]] of Object.entries(WAYPOINTS)) {
    const d = (wx - x) ** 2 + (wz - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// Slab ray vs a list of AABBs: returns the distance to the first hit, or Infinity.
export function rayHitDistance(colliders, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const b of colliders) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, maxDist);
    if (t < best) best = t;
  }
  return best;
}

// Like rayHitDistance, but also returns the box hit, so the Longshot can ask
// how thick the wall it just hit is before it spends its penetration on it.
export function rayHitBox(colliders, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  let bestBox = null;
  for (const b of colliders) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, maxDist);
    if (t < best) { best = t; bestBox = b; }
  }
  return { dist: best, box: bestBox };
}

function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const mins = [b.min.x, b.min.y, b.min.z];
  const maxs = [b.max.x, b.max.y, b.max.z];
  const os = [ox, oy, oz];
  const ds = [dx, dy, dz];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return Infinity;
    } else {
      let t1 = (mins[i] - os[i]) / ds[i];
      let t2 = (maxs[i] - os[i]) / ds[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function inPoint(key, x, z) {
  const p = POINTS[key];
  const dx = x - p.x;
  const dz = z - p.z;
  return dx * dx + dz * dz <= p.radius * p.radius;
}

// Shared horizontal mover: the player and the bots resolve against the same
// colliders, one axis at a time, so a wall never swallows either of them.
// `wishX/wishZ` are target velocities in m/s; the body carries vx/vz.
// Step-up: when a move is blocked by a box whose top is at most MOVE.stepUp
// above the body's feet and there is headroom above it, the body steps onto
// the box instead of stopping. That is what makes stairs, crates and the
// crane bridge climbable without a jump.
const MOVER_RADIUS = 0.34;
const _probe = new THREE.Box3();
export function stepMover(body, wishX, wishZ, dt, colliders, accel = 30, stepUp = 0.38) {
  const blend = Math.min(1, accel * dt);
  body.vx += (wishX - body.vx) * blend;
  body.vz += (wishZ - body.vz) * blend;
  if (!wishX && !wishZ) {
    const damp = Math.max(0, 1 - 9 * dt);
    body.vx *= damp;
    body.vz *= damp;
  }
  const h = body.height || 1.72;
  const nextX = body.x + body.vx * dt;
  const blockX = moverBlock(nextX, body.y, body.z, h, colliders);
  if (!blockX) body.x = nextX;
  else if (tryStepUp(body, blockX, stepUp, h, colliders)) body.x = nextX;
  else body.vx = 0;
  const nextZ = body.z + body.vz * dt;
  const blockZ = moverBlock(body.x, body.y, nextZ, h, colliders);
  if (!blockZ) body.z = nextZ;
  else if (tryStepUp(body, blockZ, stepUp, h, colliders)) body.z = nextZ;
  else body.vz = 0;
}

function moverBlock(x, y, z, height, colliders) {
  _probe.min.set(x - MOVER_RADIUS, y + 0.04, z - MOVER_RADIUS);
  _probe.max.set(x + MOVER_RADIUS, y + height - 0.04, z + MOVER_RADIUS);
  for (const c of colliders) if (_probe.intersectsBox(c)) return c;
  return null;
}

function tryStepUp(body, block, stepUp, height, colliders) {
  const rise = block.max.y - body.y;
  if (rise <= 0 || rise > stepUp) return false;
  // Headroom: the space above the ledge must fit the body.
  _probe.min.set(body.x - MOVER_RADIUS, block.max.y + 0.04, body.z - MOVER_RADIUS);
  _probe.max.set(body.x + MOVER_RADIUS, block.max.y + height - 0.04, body.z + MOVER_RADIUS);
  for (const c of colliders) {
    if (c !== block && _probe.intersectsBox(c)) return false;
  }
  body.y = block.max.y;
  return true;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const yardTex = yardTexture();
  const wallTex = wallTexture();
  const hazardTex = hazardTexture();
  const craneTex = craneTexture();
  const containerTex = {
    rust: containerTexture(PALETTE.rust),
    tealbox: containerTexture(PALETTE.tealbox),
    olive: containerTexture(PALETTE.olive),
  };

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'sodium' ? 0.5 : 0.92,
      metalness: name === 'steel' || name === 'crane' ? 0.55 : 0.05,
      emissive: name === 'sodium' ? new THREE.Color(PALETTE.sodium) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'sodium' ? 1.6 : 0,
    });
  }
  // Textured variants: the same colours, but the surface reads as asphalt,
  // panels and ribbed container steel instead of flat colour.
  materials.yard = new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.85, metalness: 0.2 });
  materials.surface = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.1 });
  materials.hairline = new THREE.MeshStandardMaterial({ map: wallTex, color: new THREE.Color(PALETTE.hairline), roughness: 0.9, metalness: 0.1 });
  materials.crane = new THREE.MeshStandardMaterial({ map: craneTex, roughness: 0.7, metalness: 0.6 });
  for (const key of ['rust', 'tealbox', 'olive']) {
    materials[key] = new THREE.MeshStandardMaterial({ map: containerTex[key], roughness: 0.75, metalness: 0.35 });
  }

  const colliders = [];
  const shootables = [];
  function box(cx, cz, w, d, h, material, yBase = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(cx, yBase + h / 2 - (material === 'yard' ? 0.2 : 0), cz);
    if (material === 'yard') mesh.position.y = -0.2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const b = new THREE.Box3().setFromObject(mesh);
    if (material !== 'yard') {
      colliders.push(b);
      shootables.push(mesh);
    }
    return mesh;
  }
  for (const [cx, cz, w, d, h, material] of BOXES) box(cx, cz, w, d, h, material);
  // Deck slabs: thin boxes whose TOP is at topY, so feet stand at topY.
  for (const [cx, cz, w, d, topY] of DECKS) box(cx, cz, w, d, 0.3, 'crane', topY - 0.3);
  // Stairs: solid boxes from the ground to their top step.
  for (const [cx, cz, w, d, top, material] of STAIRS) box(cx, cz, w, d, top, material);
  // Hazard stripes along the crane bridge edges, visual only: they mark the
  // drop, they do not block feet.
  for (const [cx, cz, w, d, topY] of DECKS) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, 0.28),
      new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.8 }),
    );
    strip.position.set(cx, topY + 0.02, cz - d / 2 + 0.14);
    group.add(strip);
    const strip2 = strip.clone();
    strip2.position.set(cx, topY + 0.02, cz + d / 2 - 0.14);
    group.add(strip2);
  }
  // Overhead pipes along the north wall: visual only, above head height.
  const pipeMat = materials.pipe;
  for (const [px, py, len] of [[-12, 4.4, 24], [12, 4.4, 24]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 12), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(px, py, -21.6);
    group.add(pipe);
  }
  // Skyline beyond the north fence: dark towers with a few lit windows, so
  // the night has a horizon and the screenshots have depth. Visual only,
  // outside the walls, no colliders.
  const skyline = [
    [-28, -27, 5, 8], [-20, -29, 4, 6], [-12, -26, 6, 10], [-4, -28, 4, 7],
    [4, -27, 5, 9], [12, -29, 4, 5], [20, -26, 6, 8], [28, -28, 4, 6],
  ];
  const towerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x0d1522), roughness: 1 });
  const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a) });
  for (const [tx, tz, tw, th] of skyline) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, 2), towerMat);
    tower.position.set(tx, th / 2, tz);
    group.add(tower);
    const wins = 2 + ((tx * 7 + th) % 3);
    for (let i = 0; i < wins; i += 1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), windowMat);
      win.position.set(tx - tw / 2 + 1 + i * 1.4, 1.5 + ((i * 2.1 + th) % (th - 2)), tz + 1.05);
      group.add(win);
    }
  }
  // The moon: a pale disc high over the north fence.
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.moon), fog: false }),
  );
  moon.position.set(-18, 26, -44);
  moon.lookAt(0, 2, 0);
  group.add(moon);

  // Point beacons: a glowing ring on the floor, a column of light, and a
  // floating letter — all in the owner's colour, so who holds a point reads
  // across the whole map. main.js repaints them from points.state.
  function letterTexture(key) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, 64, 68);
    return new THREE.CanvasTexture(c);
  }
  const beacons = {};
  for (const [key, pt] of Object.entries(POINTS)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(pt.radius - 0.35, pt.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(OWNER_COLOR.neutral), transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pt.x, 0.03, pt.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(OWNER_COLOR.neutral), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(pt.x, 7, pt.z);
    group.add(beam);
    // The letter: a glyph on a transparent plane, floating over the point in
    // the owner's colour — the point's name, readable across the map.
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(key), transparent: true, color: new THREE.Color(OWNER_COLOR.neutral), side: THREE.DoubleSide, depthWrite: false }),
    );
    letter.position.set(pt.x, 3.6, pt.z);
    group.add(letter);
    const glow = new THREE.PointLight(new THREE.Color(OWNER_COLOR.neutral), 7, 11, 1.7);
    glow.position.set(pt.x, 3.4, pt.z);
    scene.add(glow);
    beacons[key] = { ring, beam, letter, glow };
  }

  // Light, for the night: a dim blue hemisphere, cold moonlight with shadows
  // from the north-east, a faint cool fill from the south, and warm sodium
  // pools over each point and the two spawns.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x2a3a55), new THREE.Color(0x0a0d12), 0.55);
  scene.add(sky);
  const moonLight = new THREE.DirectionalLight(new THREE.Color(PALETTE.moon), 1.15);
  moonLight.position.set(14, 26, -20);
  moonLight.target.position.set(0, 0, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = -34;
  moonLight.shadow.camera.right = 34;
  moonLight.shadow.camera.top = 26;
  moonLight.shadow.camera.bottom = -26;
  moonLight.shadow.camera.far = 80;
  moonLight.shadow.bias = -0.0008;
  scene.add(moonLight, moonLight.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x4a6a8a), 0.35);
  fill.position.set(-8, 12, 20);
  scene.add(fill);
  // Sodium lamps over the two spawns, so neither team starts in the dark.
  for (const [sx, sz] of [[0, 19], [0, -19]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 11, 13, 1.6);
    lamp.position.set(sx, 4.2, sz);
    scene.add(lamp);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.6, metalness: 0.5 }),
    );
    shade.position.set(sx, 4.6, sz);
    group.add(shade);
  }
  // A cool lamp over the crane bridge, so the second floor is never a dark trap.
  const craneLamp = new THREE.PointLight(new THREE.Color(0xbfd9e2), 10, 14, 1.6);
  craneLamp.position.set(0, 5.2, -6);
  scene.add(craneLamp);

  return { colliders, shootables, group, beacons };
}
