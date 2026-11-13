// Hedgerow: the shape and swing of a parachute coming down (no DOM, no 3D: plain numbers, so it can be tested).
// Steve picked C of four in tools/chute-variants.html for the paratroopers and the supply crate alike: a big canopy of
// olive drab panels with a vent hole at the top, uneven so no two are alike, swinging like a pendulum on the way down
// and turning slowly; once down it falls over, flattens and goes
const Chute = (() => {
  // R: canopy radius (a field is 1 across), gores: panels, flat: dome height to radius, bulge: how far each panel puffs
  // out between its lines, scallop: how far the hem rises between lines, lumpy: unevenness, breathe: puffing in and out,
  // vent: the hole at the top (an angle), swing: degrees either way, period: seconds a swing, spin: turning (radians a
  // second), drift: sideways in the wind over the fall, panels: how much darker every other panel is
  const LOOK = {
    R: 0.28, gores: 24, flat: 0.6, bulge: 0.05, scallop: 0.04, lumpy: 0.08, breathe: 0.03, vent: 0.16,
    swing: 12, period: 2.0, spin: 0.35, drift: 0.06, colour: '#77764a', panels: 0.18
  };
  // Rings of points from the vent down to the hem, points round each ring (four a panel)
  const RINGS = 12, SEGS = LOOK.gores * 4;
  // Seconds: coming down, then falling over and going; the men of one plane land one after another
  const TIME = { fall: 3.0, settle: 1.2, apart: 0.5 };
  // Heights (the table is 0): where the canopy's middle starts, just above the plane, and how the load hangs under it
  const HANG = { top: 1.05, lines: -0.8 * LOOK.R, riser: { man: 0.06, crate: 0.03 }, man: 2.0, crate: 1.8 };
  // The load's own height to where it hangs: a man's shoulders, the crate's lid (in their models' units)
  const LOAD_TOP = { man: 0.088, crate: 0.05 };

  // A parachute's own shape, made once: a push for every panel, a little oval, two and three big bulges round it,
  // the hem lower on one side. rand: a random number from 0 to 1
  function shape(rand) {
    const lumps = [];
    for (let g = 0; g < LOOK.gores; g++) lumps.push(rand() * 2 - 1);
    return {
      lumps,
      sx: 0.9 + rand() * 0.2, sz: 0.9 + rand() * 0.2,
      a2: 0.5 + rand(), p2: rand() * 6.3, a3: 0.5 + rand(), p3: rand() * 6.3,
      tiltDir: rand() * 6.3,
      // (each swings in its own time)
      phase: rand() * 6.3
    };
  }

  // Where a point of the canopy is, in its own place (the canopy's middle at 0): ring i (0 at the vent, RINGS at the
  // hem), point j round it (0 to SEGS), t seconds into the fall
  function point(s, i, j, t) {
    const down = i / RINGS;
    const theta = LOOK.vent + down * (1.25 - LOOK.vent);
    const phi = (j / SEGS) * Math.PI * 2;
    // How far across its panel the point is: 0 on a line, 1 in the middle
    const along = phi * LOOK.gores / (Math.PI * 2);
    const across = Math.sin(Math.PI * (along % 1));
    // The smooth unevenness from one panel to the next
    const g0 = Math.floor(along) % LOOK.gores;
    const g1 = (g0 + 1) % LOOK.gores;
    const blend = (1 - Math.cos((along - Math.floor(along)) * Math.PI)) / 2;
    const lump = s.lumps[g0] * (1 - blend) + s.lumps[g1] * blend;
    // The plain dome, each panel puffed out between its lines
    let r = LOOK.R * Math.sin(theta) * (1 + LOOK.bulge * across * down);
    let y = LOOK.R * LOOK.flat * Math.cos(theta);
    // Uneven: panel by panel, then the big bulges, then the hem lower on one side
    r *= 1 + LOOK.lumpy * lump * Math.sin(theta);
    r *= 1 + LOOK.lumpy * 0.8 * (s.a2 * Math.cos(2 * phi + s.p2) + s.a3 * Math.cos(3 * phi + s.p3)) * Math.sin(theta);
    y += LOOK.lumpy * LOOK.R * 0.9 * Math.cos(phi - s.tiltDir) * down;
    // Breathing in and out
    const breath = Math.sin(t * 3.1 + s.phase);
    r *= 1 + LOOK.breathe * breath * down;
    y *= 1 - LOOK.breathe * 0.6 * breath;
    // The hem rises between the lines: scallops
    y += LOOK.scallop * LOOK.R * across * Math.pow(down, 4);
    return [r * Math.cos(phi) * s.sx, y, r * Math.sin(phi) * s.sz];
  }

  // How far down it has come: 0 at the top, 1 on the table
  const progress = t => Math.min(1, Math.max(0, t / TIME.fall));

  // How high the canopy's middle is: from the top down to where the load stands on the table
  function height(t, load) {
    const landed = HANG.riser[load] + LOAD_TOP[load] * HANG[load] - HANG.lines;
    return HANG.top + (landed - HANG.top) * progress(t);
  }

  // The swing, in radians: along (the main swing) and across (a little sideways). Biggest just after it opens, less
  // near the table, stopped soon after landing
  function swing(s, t) {
    const ease = 1 - 0.55 * progress(t);
    const stop = t < TIME.fall ? 1 : Math.max(0, 1 - (t - TIME.fall) / 0.3);
    const most = (LOOK.swing * Math.PI / 180) * ease * stop;
    const along = Math.sin(t * Math.PI * 2 / LOOK.period + s.phase) * most;
    const across = Math.sin(t * Math.PI * 2 / (LOOK.period * 1.37) + s.phase + 1.3) * most * 0.35;
    return { along, across };
  }

  // Once down: 0 still coming down, 1 flat on the table
  const over = t => (t < TIME.fall ? 0 : Math.min(1, ((t - TIME.fall) / TIME.settle) * 1.6));
  // How solid it is: fading away at the end of settling
  function opacity(t) {
    const settled = t < TIME.fall ? 0 : Math.min(1, (t - TIME.fall) / TIME.settle);
    return settled < 0.6 ? 1 : Math.max(0, 1 - (settled - 0.6) / 0.4);
  }
  // When the last of a drop of n parachutes is on the table, each one landing TIME.apart after the one before
  // (the piece or the crate shows on the board only then, Steve)
  const landed = n => (n - 1) * TIME.apart + TIME.fall;
  // How long a whole drop of n parachutes lasts: the last one down, then its canopy falling over and going
  const lasts = n => landed(n) + TIME.settle;

  return { LOOK, RINGS, SEGS, TIME, HANG, LOAD_TOP, shape, point, progress, height, swing, over, opacity, landed, lasts };
})();

if (typeof module !== 'undefined') module.exports = Chute;
