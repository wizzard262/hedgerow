// Hedgerow: the map and every number to tune

// The board: one character per field. Each field is a tile; hedges grow on the edges between fields
//   .  field        o  orchard (some cover)        h  hamlet: a few houses round a yard (good cover)
//   v  village (good cover, no hedges round it)    r  river (nothing can enter it)    #  bridge (a lane across the river)
// In a hamlet or the village there is room in the yard for one company or one tank platoon, not both
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
const HEDGE_GAP = 0.22;          // chance an edge between two fields has a gap (a gate or a broken bank)
const WIRE = 0.5;                // chance a gap between two fields is closed by a barbed-wire fence: men must cut it, tanks flatten it

const TURNS = 6;                 // six moves: one an hour from 06:00, the village must be held by 12:00
const START_HOUR = 6;
const START_DATE = 'Tue 11 July 1944';

// Command points: each company (with its captain and attached teams), the tank company and the battalion
// earn points every hour and can save them. A piece acts once an hour and each action costs a point.
// A company earns this share of its pieces in points an hour (2 pieces → 1⅓), so only about two thirds can act
const COMMAND_SHARE = 2 / 3;
const COMMAND_BANK = 3;          // most points a company can save
// The battalion's own points: fire missions, attaching teams, and teams working on their own
const BN_POINTS = 2;
const BN_BANK = 4;
// Reacting in the Germans' hour: a piece fired on can spend one of its company's points to try to pull back
const WITHDRAW = { standard: 0.6, elite: 0.75, keep: 0.5 };   // chance it works, and the share of hits it then takes

// Shooting: each point of firepower rolls one six-sided die, which hits on TO_HIT or more.
// Cover adds to the score needed, elite troops take one off; a 6 always hits
const TO_HIT = 5;
const QUALITY = { elite: { name: 'Elite', shoot: 1, assault: 1.3, rally: 0.9 }, standard: { name: 'Standard', shoot: 0, assault: 1, rally: 0.7 } };
const MOVE_SHOOT = 0.5;          // moving and shooting with one point: half the dice
const COVER = { hedge: 1, village: 1, hamlet: 1, orchard: 0 };   // added to the score needed against a target behind a hedge, in the village, a hamlet or an orchard
const RALLY_RANGE = 1;           // a captain rallies shocked pieces in his tile or the next one

// What each kind of piece fights with. soft: against infantry and guns; hard: against tanks (anti-tank)
const PIECES = {
  company:  { name: 'Rifle company', soft: 1, hard: 0 },          // per platoon (3 platoons)
  // Tanks: per tank (2 a platoon). armour: added to the score anti-tank dice need (the Panther's front is hard to beat).
  // cutter: hedge cutters welded on the front, so it drives straight through a hedge and leaves a gap
  sherman:  { name: 'Sherman platoon', soft: 1.5, hard: 1, tank: true, armour: 0, cutter: true },
  firefly:  { name: 'Firefly platoon', soft: 1, hard: 2, tank: true, armour: 0 },
  pz4:      { name: 'Panzer IV platoon', soft: 1.5, hard: 1.5, tank: true, armour: 0, cutter: true },
  panther:  { name: 'Panther platoon', soft: 1.5, hard: 3, tank: true, armour: 1 },
  mg:       { name: 'MG team', soft: 2, hard: 0, team: true },
  bazooka:  { name: 'Bazooka team', soft: 0, hard: 2, team: true },
  mg42:     { name: 'MG 42 team', soft: 2.5, hard: 0, team: true },
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
  { id: 'A', kind: 'company', name: 'Able Company', quality: 'elite', x: 0, y: 2 },
  { id: 'B', kind: 'company', name: 'Baker Company', quality: 'standard', x: 0, y: 4 },
  { id: 'C', kind: 'company', name: 'Charlie Company', quality: 'standard', x: 0, y: 6 },
  { id: 'capA', kind: 'captain', name: 'Capt. Able', company: 'A', x: 0, y: 2 },
  { id: 'capB', kind: 'captain', name: 'Capt. Baker', company: 'B', x: 0, y: 4 },
  { id: 'capC', kind: 'captain', name: 'Capt. Charlie', company: 'C', x: 0, y: 6 },
  { id: 'T1', kind: 'sherman', name: '1st Tank Platoon', x: 1, y: 4 },
  { id: 'T2', kind: 'firefly', name: '2nd Tank Platoon', x: 0, y: 3 },
  { id: 'mg1', kind: 'mg', name: 'MG Team 1', x: 1, y: 4 },
  { id: 'bz1', kind: 'bazooka', name: 'Bazooka Team 1', x: 0, y: 5 },
];
// The Germans: a garrison already dug in round the objective, the rest marching up from the east to their posts.
// Posts are given from the objective (dx, dy); garrison pieces start at theirs
const DE_START = [
  { id: 'd1', kind: 'company', name: '1st Fallschirmjäger Kompanie', quality: 'elite', post: [0, 0], garrison: true, attach: 'dmg1' },
  { id: 'dmg1', kind: 'mg42', name: 'MG 42 Team', post: [0, 0], garrison: true },
  { id: 'pak1', kind: 'pak', name: 'PaK 40', post: [0, 0], garrison: true },
  { id: 'dmg3', kind: 'mg42', name: 'MG 42 Team', post: [-1, 0], garrison: true },
  { id: 'd2', kind: 'company', name: '2nd Kompanie', quality: 'standard', post: [0, 1], attach: 'dmg2' },
  { id: 'dmg2', kind: 'mg42', name: 'MG 42 Team', post: [0, 1] },
  { id: 'd5', kind: 'company', name: '5th Kompanie', quality: 'standard', post: [0, -1] },
  { id: 'dmg4', kind: 'mg42', name: 'MG 42 Team', post: [-1, -1] },
  { id: 'dps1', kind: 'schreck', name: 'Panzerschreck Team', post: [-1, 1] },
  { id: 'd3', kind: 'company', name: '3rd Kompanie', quality: 'standard', reserve: true },
];

// Reinforcements: who arrives on which turn, at their own edge (US west, German east)
const REINFORCEMENTS = [
  { turn: 2, side: 'us', unit: { id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' } },
  { turn: 3, side: 'us', unit: { id: 'D', kind: 'company', name: 'Dog Company', quality: 'standard' }, captain: { id: 'capD', kind: 'captain', name: 'Capt. Dog', company: 'D' } },
  { turn: 3, side: 'de', unit: { id: 'dt1', kind: 'pz4', name: 'Panzer IV Zug', reserve: true } },
  { turn: 4, side: 'us', unit: { id: 'mg2', kind: 'mg', name: 'MG Team 2' } },
  { turn: 4, side: 'de', unit: { id: 'd4', kind: 'company', name: '4th Kompanie', quality: 'standard', reserve: true } },
  { turn: 5, side: 'us', replacements: 1 },   // a replacement platoon for the weakest company
  { turn: 5, side: 'de', unit: { id: 'dt2', kind: 'panther', name: 'Panther Zug', reserve: true } },
];
