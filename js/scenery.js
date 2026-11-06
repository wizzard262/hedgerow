// Hedgerow: things on the table just to look at (Steve): cows and sheep, parachutes caught in trees, lamp posts, poster columns
// and market stalls. None of it touches the rules. Worked out from the game's seed, so a game looks the same all the way through,
// without using the game's dice. No drawing here: js/board3d.js draws what list() says
const Scenery = (() => {
  // How often each thing turns up
  const ANIMALS = { farm: 0.4, country: 0.12 };   // the share of plain fields with animals in, on the farm and elsewhere
  const SHEEP = 0.4;                              // the share of those that are sheep, not cows
  const PARACHUTE = 0.3;                          // the share of orchards with a parachute caught in a tree
  const LAMP = 0.35, POSTERS = 0.15;              // the share of the city's streets with one, at a corner of the field
  const CORNERS = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];
  const CORNER_AREAS = [['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]];

  // A little generator of its own, one for each field
  function diceFor(seed, x, y) {
    let a = ((seed + 1) * 2654435761 + x * 7919 + y * 104729) >>> 0;
    return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  }

  // A herd in a field: where each animal stands and which way it faces
  function herd(kind, x, y, R, out) {
    const size = kind === 'cow' ? 2 + Math.floor(R() * 3) : 3 + Math.floor(R() * 4);
    for (let i = 0; i < size; i++) {
      out.push({ kind, x: x + 0.12 + R() * 0.76, y: y + 0.12 + R() * 0.76, turn: R() * Math.PI * 2, field: { x, y }, seed: Math.floor(R() * 1000) });
    }
  }

  // One market stall or two in a square's free corners
  function stalls(st, x, y, R, out) {
    const taken = Sim.featuresAt(st, x, y).flatMap(f => f.areas);
    const free = CORNER_AREAS.filter(([k]) => !taken.includes(k));
    for (const [, dx, dy] of free.slice(0, 1 + Math.floor(R() * 2))) {
      out.push({ kind: 'stall', x: x + 0.5 + dx / 3, y: y + 0.5 + dy / 3, turn: Math.floor(R() * 4) * Math.PI / 2, field: { x, y }, seed: Math.floor(R() * 1000) });
    }
  }

  // Everything to draw for this game. field: when it is set, the thing goes while a piece is in that field (it would stand in
  // the way); without it, it never gets in the way
  function list(st) {
    const out = [];
    const onFarm = st.map.id === 'farmland';
    const inCity = st.map.id === 'paris';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const tile = Sim.tileType(x, y), R = diceFor(st.seed, x, y);
      if (tile === 'field' && !Sim.featuresAt(st, x, y).length && R() < (onFarm ? ANIMALS.farm : ANIMALS.country)) herd(R() < SHEEP ? 'sheep' : 'cow', x, y, R, out);
      if (tile === 'orchard' && R() < PARACHUTE) out.push({ kind: 'parachute', x, y, tree: Math.floor(R() * 6), seed: Math.floor(R() * 1000) });
      if (tile === 'square') stalls(st, x, y, R, out);
      if (inCity && tile === 'street') {
        const corner = CORNERS[Math.floor(R() * CORNERS.length)];
        if (R() < LAMP) out.push({ kind: 'lamp', x: x + 0.5 + corner[0], y: y + 0.5 + corner[1] });
        const other = CORNERS[(CORNERS.indexOf(corner) + 1 + Math.floor(R() * 3)) % CORNERS.length];
        if (R() < POSTERS) out.push({ kind: 'posters', x: x + 0.5 + other[0], y: y + 0.5 + other[1], seed: Math.floor(R() * 1000) });
      }
    }
    return out;
  }

  return { list };
})();
