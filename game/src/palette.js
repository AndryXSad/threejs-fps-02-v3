// The look plan, in one place. NIGHTSHIFT is a container port at night: cold
// blue dark against warm sodium orange, with the three control-point beacons
// as the only strong colour in the yard — ember orange, alloy teal, neutral
// pale blue — so the objective reads at a glance even in the dark. The same
// names are the CSS custom properties in index.html and the procedural
// textures in textures.js; no other colour appears. Night is not a filter on
// the old yard: the whole scene is lit for it — moonlight with shadows,
// sodium pools over the points, fog that eats the far wall, and a skyline
// glow beyond the north fence.
export const PALETTE = {
  canvas: '#070b12',
  surface: '#10151f',
  hairline: '#232c3a',
  ink: '#e8ecf2',
  muted: '#8a97a8',
  accent: '#ff7a1a', // EMBER attackers
  alloy: '#2ec4b6', // ALLOY defenders
  danger: '#ff3b30',
  steel: '#4a5568',
  sodium: '#ffb347', // sodium lamps
  crate: '#5a4a33',
  rust: '#7a3b1e',
  tealbox: '#1f5f5a',
  olive: '#4a5238', // third container colour
  crane: '#3a3f4a', // crane bridge deck and legs
  hazard: '#d8a013', // hazard stripes
  container: '#2e5f6b', // brushed container steel
  pipe: '#3a3f4a', // overhead pipes
  lamp: '#ff9a3c', // warm sodium site lamps
  smoke: '#8a8378', // smoke grenade cloud
  moon: '#cfe0ff', // moon disc and moonlight
  beacon: '#cfd6e4', // neutral point beacon
};
