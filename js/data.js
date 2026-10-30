// Hedgerow: the map and every number to tune

// The board: one character per field. Each field is a tile; hedges grow on the edges between fields
//   .  field        o  orchard (some cover)        h  hamlet: a few houses round a yard (good cover)
//   v  village (good cover, no hedges round it)    r  river (nothing can enter it)    #  bridge (a lane across the river)
// One unit to a field (Steve); only hand-to-hand fighting brings two sides into the same field.
// MG and bazooka teams and the captain can also stand in a rifle platoon's field (Steve). Teams are never attached: each moves on its own
//   =  lane east-west    |  lane north-south    +  crossroads (lanes have no hedges along their length)
const MAP = [
  '..|..o.r.o',
  '..|.vv.r.h',
  '..+====#==',
  '.o|.v..r..',
  '.h|.vv.r.o',
  '==+====#==',
  '..|.o..r.h',
  'o.|...hr..',
];
const COLS = MAP[0].length, ROWS = MAP.length;
// The villages; each game one of them is the objective: the field to take and hold, its church in the middle
const VILLAGES = [
  { x: 4, y: 4, name: 'Saint-Jean' },
  { x: 5, y: 1, name: 'La Haye' },
];
const HEDGE_GAP = 0.45;          // chance an edge between two fields has a gap (a gate or a broken bank)
const WIRE = 0.5;                // chance a gap between two fields is closed by a barbed-wire fence: men must cut it, tanks flatten it

const TURNS = 0;                 // hours allowed (0: no limit for now, Steve); one turn is an hour from 06:00
const START_HOUR = 6;
const START_DATE = 'Tue 11 July 1944';

// Every piece moves (acts) once an hour (Steve: no tokens to activate)
// Reacting in the Germans' hour: a piece fired on can try to pull back, which uses up its move for the next hour
const WITHDRAW = { standard: 0.6, elite: 0.75, keep: 0.5 };   // chance it works, and the share of hits it then takes

// Shooting: each point of firepower rolls one six-sided die, which hits on TO_HIT or more.
// Cover adds to the score needed, elite troops take one off; a 6 always hits
const TO_HIT = 5;
const QUALITY = { elite: { name: 'Elite', shoot: 1, assault: 1.3, rally: 0.9 }, standard: { name: 'Standard', shoot: 0, assault: 1, rally: 0.7 } };
const SIGHT_RANGE = 3;           // fields a piece can shoot across open ground (hedges, villages and orchards block the view)
const LONG_RANGE = 1;            // added to the score needed beyond the next field (the three penalties stack; a 6 always hits)
const ON_THE_MOVE = 1;           // added to the score needed when firing after a move (Steve: like range and cover, +1 each)
const COVER = { hedge: 1, village: 1, hamlet: 1, orchard: 0 };   // added to the score needed against a target behind a hedge, in the village, a hamlet or an orchard
const RALLY_RANGE = 3;           // the captain rallies a shaken friendly piece up to this many fields away (Steve)
const SELF_RALLY = { standard: 0.5, elite: 0.65 };   // a shaken piece can use its move to try to rally itself: its chance

// What each kind of piece fights with. soft: against infantry and guns; hard: against tanks (anti-tank)
const PIECES = {
  company:  { name: 'Rifle platoon', soft: 1, hard: 0 },          // per section (3 sections, a base each). Its kind is 'company' in the code
  // Tanks: per tank (2 a section). armour: added to the score anti-tank dice need (the Panther's front is hard to beat).
  // cutter: drives straight through a hedge, leaving a gap (Steve: every tank does; no separate Break through for tanks)
  sherman:  { name: 'Sherman section', soft: 1.5, hard: 1, tank: true, armour: 0, cutter: true },
  firefly:  { name: 'Firefly section', soft: 1, hard: 2, tank: true, armour: 0, cutter: true },
  pz4:      { name: 'Panzer IV section', soft: 1.5, hard: 1.5, tank: true, armour: 0, cutter: true },
  panther:  { name: 'Panther section', soft: 1.5, hard: 3, tank: true, armour: 1, cutter: true },
  mg:       { name: 'MG team', soft: 5, hard: 0, team: true },          // machine guns fire 5 dice (Steve)
  bazooka:  { name: 'Bazooka team', soft: 0, hard: 2, team: true },
  mg42:     { name: 'MG 42 team', soft: 5, hard: 0, team: true },
  schreck:  { name: 'Panzerschreck team', soft: 0, hard: 2.5, team: true },
  pak:      { name: 'PaK 40 gun', soft: 0.5, hard: 3, team: true, fixed: true },
  captain:  { name: 'Captain', soft: 0, hard: 0 },
};

// Close assault (a charge): strength of each side before cover and luck
const ASSAULT = { platoon: 1, mgTeam: 1.5, otherTeam: 0.5, tankSupport: 2, tank: 1.5, hedgeDefence: 1.5, villageDefence: 1.4, shocked: 0.5 };

// Fire support: dice on the target field (and a few on the fields around it for artillery), ammo and how it comes back
const MORTARS = { name: '81 mm mortars', dice: 4, splash: 0, ammo: 6, resupplyEvery: 2 };
const ARTILLERY = { name: '105 mm battery', dice: 6, splash: 1, ammo: 3, resupplyEvery: 3, hard: 1 };
const DE_MORTAR = { dice: 3, ammo: 8 };   // the Germans' own mortar, one mission a turn while ammo lasts

// Who starts on each side. Each side is spread at random over its own end of the board: this share of its width,
// in cover where possible (the x, y below are only where they would stand without that)
const DEPLOY = 0.2;
const US_START = [
  { id: 'A', kind: 'company', name: '1st Platoon', quality: 'elite', x: 0, y: 2 },
  { id: 'B', kind: 'company', name: '2nd Platoon', quality: 'standard', x: 0, y: 4 },
  { id: 'C', kind: 'company', name: '3rd Platoon', quality: 'standard', x: 0, y: 6 },
  { id: 'cap', kind: 'captain', name: 'Captain (company HQ)', x: 0, y: 4 },   // one captain, with the company guidon
  { id: 'T1', kind: 'sherman', name: '1st Tank Section', x: 1, y: 4 },
  { id: 'T2', kind: 'firefly', name: '2nd Tank Section', x: 0, y: 3 },
  { id: 'mg1', kind: 'mg', name: 'MG Team 1', x: 1, y: 4 },
  { id: 'bz1', kind: 'bazooka', name: 'Bazooka Team 1', x: 0, y: 5 },
];
// The Germans: a garrison already dug in round the objective, the rest marching up from the east to their posts.
// Posts are given from the objective (dx, dy); garrison pieces start at theirs
const DE_START = [
  { id: 'd1', kind: 'company', name: '1. Fallschirmjäger-Zug', quality: 'elite', post: [0, 0], garrison: true },
  { id: 'dmg1', kind: 'mg42', name: 'MG 42 Team', post: [0, 0], garrison: true },
  { id: 'pak1', kind: 'pak', name: 'PaK 40', post: [1, 0], garrison: true },
  { id: 'dmg3', kind: 'mg42', name: 'MG 42 Team', post: [-1, 0], garrison: true },
  { id: 'd2', kind: 'company', name: '2. Zug', quality: 'standard', post: [0, 1] },
  { id: 'dmg2', kind: 'mg42', name: 'MG 42 Team', post: [0, 1] },
  { id: 'd5', kind: 'company', name: '5. Zug', quality: 'standard', post: [0, -1] },
  { id: 'dmg4', kind: 'mg42', name: 'MG 42 Team', post: [-1, -1] },
  { id: 'dps1', kind: 'schreck', name: 'Panzerschreck Team', post: [-1, 1] },
  { id: 'd3', kind: 'company', name: '3. Zug', quality: 'standard', reserve: true },
];

// Reinforcements: who arrives on which turn, at their own edge (US west, German east)
const REINFORCEMENTS = [
  { turn: 2, side: 'us', unit: { id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' } },
  { turn: 3, side: 'us', unit: { id: 'D', kind: 'company', name: '4th Platoon', quality: 'standard' } },
  { turn: 3, side: 'de', unit: { id: 'dt1', kind: 'pz4', name: 'Panzer IV pair', reserve: true } },
  { turn: 4, side: 'us', unit: { id: 'mg2', kind: 'mg', name: 'MG Team 2' } },
  { turn: 4, side: 'de', unit: { id: 'd4', kind: 'company', name: '4. Zug', quality: 'standard', reserve: true } },
  { turn: 5, side: 'us', replacements: 1 },   // a replacement section for the weakest rifle platoon
  { turn: 5, side: 'de', unit: { id: 'dt2', kind: 'panther', name: 'Panther pair', reserve: true } },
];
