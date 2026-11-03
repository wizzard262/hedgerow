// Hedgerow: the map and every number to tune

// The board: one character per field. Each field is a tile; hedges grow on the edges between fields
//   .  field        o  orchard (some cover)        h  hamlet: a few houses round a yard (good cover)
//   v  village (good cover, no hedges round it)    r  river (nothing can enter it)    #  bridge (a lane across the river)
// One unit to a field (Steve); only hand-to-hand fighting brings two sides into the same field.
// MG and bazooka teams and the captain can also stand in a rifle platoon's field (Steve). Teams are never attached: each moves on its own
//   =  lane east-west    |  lane north-south    +  crossroads (lanes have no hedges along their length)
// Twelve fields long (Steve: two more); the villages three fields in from the German end (Steve: right at the back was too far)
const MAP = [
  '..|o.o...o.h',
  '..|.h..vv.o.',
  '..+=========',
  '.o|.o..vv.h.',
  '.h|.o..vv..o',
  '==+=========',
  '..|.oo..h..h',
  'o.|.o.h....o',
];
const COLS = MAP[0].length, ROWS = MAP.length;
// The villages; each game one of them is the objective: the field to take and hold, its church in the middle
const VILLAGES = [
  { x: 7, y: 4, name: 'Saint-Jean' },
  { x: 7, y: 1, name: 'La Haye' },
];
// Sharing a field (Steve): each field is nine areas; pieces share it while their areas don't overlap (see footprint in
// sim.js: most pieces one area, the PaK two, a tank or a platoon of two or three sections four)
const HEDGE_GAP = 0.45;          // chance an edge between two fields has a gap (a gate or a broken bank)
const WIRE = 0.5;                // chance a gap between two fields is closed by a barbed-wire fence: men must cut it, tanks flatten it

// The blind bag: as well as a token for each piece, black timer tokens (a white sand-glass); drawing one ends the round
// there and then, whoever has still to move (Steve)
const ROUND_TIMER = 1;
const TURNS = 0;                 // hours allowed (0: no limit for now, Steve); one turn is an hour from 06:00
const START_HOUR = 6;
const START_DATE = 'Tue 11 July 1944';

// Every piece moves (acts) once an hour (Steve: no tokens to activate)
// Reacting (Steve): a piece fired on can take cover. Its men get down where they are: every shot or shell at it needs
// two more for the rest of the round, but it misses its move unless the captain gets it up
const TAKE_COVER = 2;            // added to the score needed against a piece that has taken cover, from every weapon (Steve: +2)

// Shooting: each point of firepower rolls one six-sided die, which hits on TO_HIT or more.
// Cover adds to the score needed, elite troops take one off; a shot needing more than MAX_NEED can't be taken
const TO_HIT = 3;                // a die needs this or more to hit, before cover, range and moving (Steve: 3+)
const MOVE_SHOOT_MOVES = 2;      // fields a Move & shoot can cover (Steve: one more than before)
const CHARGE_MOVES = 3;          // fields a charge can cover
const CLIMB = 1;                 // extra moves it costs men to climb a hedge bank (tanks drive through; wire stops men)
const SHAKEN_SHOOT = 1;          // a shaken piece needs one more to hit
const SHAKEN_MOVE = 0.5;         // a shaken piece still moves and charges, but only half as far (rounded down, at least one field)
const MAX_NEED = 6;              // a shot that would need more than this can't be taken (Steve: no shooting at 7+)
const WOUND_CHANCE = 0.5;        // each hit is a coin toss: heads it wounds (a section, a team or a tank lost); every hit shakes
const QUALITY = { elite: { name: 'Elite', shoot: 1, assault: 1.3 }, standard: { name: 'Standard', shoot: 0, assault: 1 } };
const SIGHT_RANGE = 99;          // how far any piece sees (Steve: the whole board; hedges, villages and orchards block the view). Shooting: RANGES
const LONG_RANGE = 1;             // added to the score needed at long range (the penalties stack)
// How far each kind of weapon sees and shoots, and how many fields away before long range starts (Steve: rifles one
// further, machine guns and tanks two beyond the rifles, the sniper the whole board with no long range)
const RANGES = {
  short: { sight: 3, long: 1 },     // bazookas and Panzerschrecks
  rifle: { sight: 4, long: 2 },     // rifle platoons and the captain's HQ
  heavy: { sight: 6, long: 4 },     // machine guns, tanks and the PaK
  sniper: { sight: 99, long: 99 },  // the sniper: anywhere he can see, no long range, and cover doesn't help the target
};
const ON_THE_MOVE = 1;           // added to the score needed when firing after a move (Steve: like range and cover, +1 each)
const COVER = { hedge: 1, tankCorner: 1, placeCorner: 1 };   // added to the score needed: a target lining a hedge it is shot across (or past the end of), or a line past a tank's corner (Steve: a tank's edge acts like a hedge), or past the corner of a village, hamlet or orchard
// Villages, hamlets and orchards all work the same way (Steve): seen into and out of, never through. They differ only
// in their cover, added to the score needed against a piece in one: men, a tank, and against mortar or artillery
// fire. Two enemies inside the same one (its fields joined together) get none from it
const PLACE_COVER = {
  village: { men: 2, tank: 1, shells: 1 },
  hamlet: { men: 2, tank: 1, shells: 1 },
  orchard: { men: 1, tank: 1, shells: 1 },
};
// A tank driving over barbed wire (Steve): this chance it gets snagged and stops there (the wire is flattened either way)
const WIRE_SNAG = 1 / 3;
const MEN_A_BASE = 3;             // men on each section's round base (Steve)
const SMALL_TARGET = 1;          // added to the score needed against a small target: a piece of two men or fewer (Steve: sniper, bazooka, captain; not the MG, three men)
const CAPTAIN_RALLIES = { still: 2, fired: 1 };   // rallies a round (Steve): two if he stays put or charges (before, after or either side of the charge), one if he shoots or moves and shoots (before or after)
const RALLY_RANGE = 3;           // the captain rallies a shaken friendly piece up to this many fields away (Steve)
// A rally always works, and it is the only thing that clears shaken (Steve): not resting, not a round ending, not a fight

// What each kind of piece fights with. soft: against infantry and guns; hard: against tanks (anti-tank)
const PIECES = {
  company:  { name: 'Rifle platoon', soft: 1, hard: 0 },          // per section (3 sections, a base each). Its kind is 'company' in the code
  // Tanks: one tank a unit (Steve). armour: added to the score anti-tank dice and shells need (the Panther's front is hard
  // to beat), shown in the panel and on the label.
  // cutter: drives straight through a hedge, leaving a gap (Steve: every tank does; no separate Break through for tanks)
  sherman:  { name: 'Sherman', soft: 1.5, hard: 1, tank: true, armour: 0, cutter: true },
  firefly:  { name: 'Firefly', soft: 1, hard: 2, tank: true, armour: 0, cutter: true },
  pz4:      { name: 'Panzer IV', soft: 1.5, hard: 1.5, tank: true, armour: 0, cutter: true },
  panther:  { name: 'Panther', soft: 1.5, hard: 3, tank: true, armour: 1, cutter: true },
  mg:       { name: '.50 cal team', soft: 5, hard: 0, team: true, men: 3 },        // machine guns fire 5 dice (Steve)
  bazooka:  { name: 'Bazooka team', soft: 0, hard: 2, team: true, men: 2 },
  sniper:   { name: 'Sniper team', soft: 1, hard: 0, team: true, sniper: true, men: 2 },   // the sniper and his spotter (Steve: a two-man team); sees the whole board, ignores cover and range (Steve)
  mg42:     { name: 'MG 42 team', soft: 5, hard: 0, team: true, men: 3 },
  schreck:  { name: 'Panzerschreck team', soft: 0, hard: 2.5, team: true, men: 2 },
  pak:      { name: 'PaK 40 gun', soft: 0.5, hard: 3, team: true, fixed: true },
  captain:  { name: 'Captain', soft: 1, hard: 0, men: 1 },   // his HQ's carbines and submachine guns (Steve: he can shoot)
};

// Hand to hand (a charge into the enemy, Steve): the two sides strike in turn, the attacker first, a die for each base
// standing, each hit a base lost, until one side is gone. Being shaken doesn't count. A stop after this many exchanges
// (only reached when neither side can hurt the other)
const HAND_TO_HAND_LIMIT = 40;

// Fire support: dice on the target field (and a few on the fields around it for artillery), and its ammo: once fired it
// never comes back (Steve: mortars, artillery and, later, bombers never replenish)
const MORTARS = { name: '81 mm mortars', dice: 4, splash: 0, ammo: 6 };
const ARTILLERY = { name: '105 mm battery', dice: 6, splash: 1, ammo: 3, hard: 1 };
const DE_MORTAR = { dice: 3, ammo: 8 };   // the Germans' own mortar, one mission a turn while ammo lasts
const DE_ARTILLERY = { name: '10.5 cm battery', dice: 6, splash: 1, ammo: 2, hard: 1 };   // the Germans' guns: like ours, fewer rounds

// Who starts on each side. Each side is spread at random over its own end of the board: this share of its width,
// in cover where possible (the x, y below are only where they would stand without that)
const DEPLOY = 0.2;
const US_START = [
  { id: 'A', kind: 'company', name: '1st Platoon', quality: 'elite', x: 0, y: 2 },
  { id: 'B', kind: 'company', name: '2nd Platoon', quality: 'standard', x: 0, y: 4 },
  { id: 'C', kind: 'company', name: '3rd Platoon', quality: 'standard', x: 0, y: 6 },
  { id: 'cap', kind: 'captain', name: 'Captain (company HQ)', x: 0, y: 4 },   // one captain, with the company guidon
  { id: 'T1', kind: 'sherman', name: 'Sherman', x: 1, y: 4 },
  { id: 'T2', kind: 'firefly', name: 'Firefly', x: 0, y: 3 },
  { id: 'mg1', kind: 'mg', name: '.50 cal', x: 1, y: 4 },
  { id: 'bz1', kind: 'bazooka', name: 'Bazooka Team 1', x: 0, y: 5 },
  { id: 'sn1', kind: 'sniper', name: 'Sniper Team', x: 0, y: 1 },
];
// The Germans: a garrison already dug in round the objective, the rest marching up from the east to their posts.
// Posts are given from the objective (dx, dy); garrison pieces start at theirs
const DE_START = [
  { id: 'd1', kind: 'company', name: '1. Fallschirmjäger-Zug', quality: 'elite', post: [0, 0], garrison: true },
  { id: 'dmg1', kind: 'mg42', name: 'MG 42 Team', post: [0, 0], garrison: true },
  // Their company commander (Steve), with a red flag, in the objective with the garrison: he rallies shaken Germans
  { id: 'dcap', kind: 'captain', name: 'Hauptmann (company HQ)', post: [0, 0], garrison: true },
  { id: 'pak1', kind: 'pak', name: 'PaK 40', post: [1, 0], garrison: true },
  { id: 'dmg3', kind: 'mg42', name: 'MG 42 Team', post: [-1, 0], garrison: true },
  { id: 'd2', kind: 'company', name: '2. Zug', quality: 'standard', post: [0, 1] },
  { id: 'dmg2', kind: 'mg42', name: 'MG 42 Team', post: [0, 1] },
  { id: 'd5', kind: 'company', name: '5. Zug', quality: 'standard', post: [0, -1] },
  { id: 'dmg4', kind: 'mg42', name: 'MG 42 Team', post: [-1, -1] },
  { id: 'dps1', kind: 'schreck', name: 'Panzerschreck Team', post: [-1, 1] },
  { id: 'd3', kind: 'company', name: '3. Zug', quality: 'standard', reserve: true },
  // German armour (Steve: put them back): on the table from the start now there are no reinforcements, moving up
  // towards the nearest Americans
  { id: 'dt1', kind: 'pz4', name: 'Panzer IV', reserve: true },
  { id: 'dt2', kind: 'panther', name: 'Panther', reserve: true },
];

// Reinforcements: who arrives on which turn, at their own edge (US west, German east). None for now (Steve: both sides
// keep what they start with); an entry looks like { turn: 3, side: 'us', unit: { id, kind, name } }, or { turn, side,
// replacements: 1 } for a replacement section
const REINFORCEMENTS = [];
