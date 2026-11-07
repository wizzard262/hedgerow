// Hedgerow: the map and every number to tune

// A board: one character per field. Each field is a tile; hedges grow on the edges between fields
//   w  sea (pieces can leave it, never enter it)    b  beach (open sand)
//   s  street (paved, in the city)    q  square (paved and open, in the city)    t  railway tracks (only to look at: as open ground)
//   .  field        o  orchard (some cover)        h  hamlet: a few houses round a yard (good cover)
//   v  village (good cover, no hedges round it)    r  river (nothing can enter it)    #  bridge (a lane across the river)
// One unit to a field (Steve); only hand-to-hand fighting brings two sides into the same field.
// MG and bazooka teams and the captain can also stand in a rifle platoon's field (Steve). Teams are never attached: each moves on its own
//   =  lane east-west    |  lane north-south    +  crossroads (lanes have no hedges along their length)
// Twelve fields long (Steve: two more); the villages three fields in from the German end (Steve: right at the back was too far)
// The maps (Steve): all twelve fields by eight, with the villages about three fields in from the German end. Each can change
// more than the ground: id and name; note, what the choice says about it; rows, the board; villages, each game one of them is
// the objective, the field to take and hold, its church in the middle. Left out, a map keeps the usual:
//   gap, wire: chance of a gap in a hedge, and of a gap being fenced    deploy: share of the board each side starts in
//   us, de: { add: pieces more, remove: ids of pieces less }            ammo: { us: {...}, de: {...} } rounds and bomber runs
//   features: things standing in fields, see FEATURES                   generated: made new each game in sim.js: 'city', a whole board; 'yard', what stands in the yard
// Things that stand in a field and take some of its nine areas (Steve). A building (blocksView) blocks the view like a tank.
// side: along that side of the field, three areas. areas: the very areas it takes (Steve: not all the full length, and some in
// the middle of the field). With the middle free a platoon or a tank can stand beside it; a building in the middle leaves room
// only for smaller pieces, and big ones go past. area: one area
const FEATURES = {
  cafe: { name: 'Café', blocksView: true },
  barn: { name: 'Barn', blocksView: true },
  fountain: { name: 'Fountain', blocksView: false },
  pond: { name: 'Duck pond', blocksView: false },
  engine: { name: 'Steam engine', blocksView: true },
  carriage: { name: 'Railway carriage', blocksView: true },
  wagon: { name: 'Goods wagon', blocksView: true },
  signalbox: { name: 'Signal box', blocksView: true },
  signal: { name: 'Signal', blocksView: false },   // (Steve: too thin to block the view)
  watertower: { name: 'Water tower', blocksView: true },
  coal: { name: 'Coal heap', blocksView: true },
  // Tank traps (Steve): no tank can enter their field; men go between them, one more to hit
  tanktrap: { name: 'Tank traps', blocksView: false, stopsTanks: true, cover: 1 },
  hulk: { name: 'Burnt-out wreck', blocksView: true },
  // The Eiffel Tower (Steve): the target in Paris. Pieces stand between its legs, so it takes no areas; open ironwork, so it
  // blocks no view; men among its feet have one more to hit
  eiffel: { name: 'Eiffel Tower', blocksView: false, cover: 1 },
};
const MAPS = [
  {
    id: 'hedges', date: '11 July 1944', name: 'Hedge country', note: 'The usual battle: two villages, hedges and lanes.',
    rows: [
      '..|o.o...o.h',
      '..|.h..vv.o.',
      '..+=========',
      '.o|.o..vv.h.',
      '.h|.o..vv..o',
      '==+=========',
      '..|.oo..h..h',
      'o.|.o.h....o',
    ],
    villages: [{ x: 7, y: 4, name: 'Saint-Jean' }, { x: 7, y: 1, name: 'La Haye' }],
    ammo: { us: { artillery: 3 } },   // (Steve: one more artillery round here, in the bocage and at the station)
  },
  {
    id: 'river', date: '7 August 1944', name: 'River crossing', note: 'Two bridges are the only way over. The Americans have no bomber; the Germans an extra MG 42 and no Panther, and their Ju 88.',
    rows: [
      '..|.or.o..h.',
      '.o|..r.vv..o',
      '..+==#======',
      '.h|.or.vv.h.',
      '..|..r.vv..o',
      '==+==#======',
      '.o|.hr..o..h',
      'h.|..r.h...o',
    ],
    villages: [{ x: 7, y: 4, name: 'Pont-Sainte-Marie' }, { x: 7, y: 1, name: 'Le Moulin' }],
    ammo: { us: { bomber: 0, artillery: 2 } },
    de: { remove: ['dt2'], add: [{ id: 'dmg5', kind: 'mg42', name: 'MG 42 Team', reserve: true }] },
  },
  {
    id: 'town', date: '15 August 1944', name: 'Crossroads town', note: 'A town on each side of the crossroads, and both sides start further forward. The Germans have a second PaK 40 and no Panzer IV; the Americans a third tank.',
    rows: [
      '.o...|..o..h',
      '..h..|.....o',
      '.....|vv.o..',
      '.o...|vv...h',
      '=====+======',
      '..h..|vv.o..',
      '.....|vv...h',
      'o...h|...o..',
    ],
    villages: [{ x: 7, y: 3, name: 'Saint-Martin' }, { x: 7, y: 5, name: 'Les Quatre-Routes' }],
    deploy: 0.3,
    // (Steve: too easy for the Americans: no bomber, and one artillery round fewer)
    ammo: { us: { bomber: 0, artillery: 1 }, de: { bomber: 0 } },
    us: { add: [{ id: 'T3', kind: 'sherman', name: 'Sherman 75mm (2)' }] },
    de: { remove: ['dt1'], add: [{ id: 'pak2', kind: 'pak', name: 'PaK 40 (2)', post: [0, -1], garrison: true }] },
  },
  {
    id: 'farmland', date: '25 July 1944', name: 'Open farmland', note: 'Few hedges and long shots, a few barns that block the view, and a duck pond. An extra tank each; the B-17 flies, the Ju 88 does not.',
    rows: [
      '.....|.....h',
      '..o..|.vv...',
      '=====+======',
      '.....|.vv..o',
      '.h...|.vv...',
      '.....|.....h',
      '..o..|...o..',
      '.....|.h....',
    ],
    villages: [{ x: 7, y: 4, name: 'Les Champs' }, { x: 7, y: 1, name: 'La Ferme' }],
    gap: 0.8, wire: 0.2,
    features: [
      { x: 3, y: 3, kind: 'barn', side: 'n' },
      { x: 9, y: 5, kind: 'barn', areas: ['nw', 'w'] },
      { x: 4, y: 0, kind: 'barn', areas: ['c', 'e'] },
      { x: 8, y: 7, kind: 'barn', areas: ['c', 's'] },
      { x: 3, y: 6, kind: 'pond', side: 's' },
    ],
    ammo: { us: { bomber: 1 }, de: { bomber: 0 } },
    us: { add: [{ id: 'T3', kind: 'sherman', name: 'Sherman 75mm (2)' }] },
    de: { add: [{ id: 'dt3', kind: 'pz4', name: 'Panzer IV (2)', reserve: true }] },
  },
  {
    id: 'paris', date: '25 August 1944', name: 'Paris', note: 'A tight city, a new maze of cobbled streets each game: houses, streets and little squares, each with a café and a fountain. The Americans must capture the Eiffel Tower, in the centre of the city. Few tanks: no Sherman 76mm and no Panther; a second bazooka for the Americans, an extra MG 42 for the Germans.',
    generated: 'city',
    gap: 1, wire: 0,
    ammo: { us: { bomber: 0 } },
    us: { remove: ['T2'], add: [{ id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' }] },
    de: { remove: ['dt2'], add: [{ id: 'dmg5', kind: 'mg42', name: 'MG 42 Team', reserve: true }] },
  },
  {
    id: 'station', date: '20 August 1944', name: 'Train station', note: 'Houses and tracks: a railway yard with tracks everywhere, joining and parting. One or two engines, carriages and goods wagons, some loaded with coal, wheat or timber, stand all over it, with signal boxes, water towers and coal heaps, all blocking the view like a tank, and signals, which can be seen past, in new places each game. The tracks themselves have no effect.',
    generated: 'yard',
    rows: [
      'tttttttttttt',
      'ttvttttvvttt',
      'tttttttttttt',
      'tttttttvvttv',
      'tttvtttvvttt',
      'tttttttttttt',
      'ttttvtttttvt',
      'tttttttttttt',
    ],
    villages: [{ x: 7, y: 4, name: 'La Gare' }, { x: 7, y: 1, name: 'Le Dépôt' }],
    gap: 1, wire: 0,
    ammo: { us: { artillery: 3 } },
  },
  {
    id: 'beach', date: '6 June 1944', name: 'Beach landing', note: 'The Americans land from craft in the surf and must capture the main bunker and hold it. Each bunker is a U of concrete with an MG team or a PaK 40 inside, firing only out of the slit in its thick front. From the front you need 3 more to hit: get round to its thin sides or open back. Tank traps, a sea wall, wrecks on the sand. The Germans have fewer pieces and no tanks, but more artillery.',
    generated: 'beach',
    landing: true,
    rows: [
      'wbbbb..o.o.h',
      'wbbbb.h...vo',
      'wbbbb=======',
      'wbbbb.o..h..',
      'wbbbb.o....o',
      'wbbbb=======',
      'wbbbb.oo.h.h',
      'wbbbb.o.h..o',
    ],
    villages: [{ x: 8, y: 4, name: 'Main bunker' }],
    ammo: { us: { bomber: 1 }, de: { artillery: 2, bomber: 0 } },
    us: { add: [{ id: 'D', kind: 'company', name: '4th Platoon', quality: 'standard' }, { id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' }] },
    de: {
      remove: ['pak1', 'dmg2', 'dmg4', 'dps1', 'd3', 'd5', 'dt1', 'dt2'],
      add: [
        { id: 'bk1', kind: 'bunker_gun', name: 'Main bunker', main: true },
        { id: 'bk2', kind: 'bunker_mg', name: 'MG bunker', place: [5, 1] },
        { id: 'bk3', kind: 'bunker_gun', name: 'PaK 40 bunker', place: [5, 3] },
        { id: 'bk4', kind: 'bunker_mg', name: 'MG bunker', place: [5, 6] },
      ],
    },
  },
  {
    id: 'deep', date: '20 June 1944', name: 'Deep bocage', note: 'Hedges nearly everywhere and few lanes. More infantry and fewer tanks: no Sherman 76mm and no Panther; a fourth American platoon and second bazooka, a sixth German platoon and second Panzerschreck.',
    rows: [
      '..|.o..o.h.o',
      'o.|...hvv...',
      '..|.o.......',
      '.h|...ovv.o.',
      '..|.o..vv...',
      '==+=========',
      '.o|..o..h..h',
      '..|.h...o..o',
    ],
    villages: [{ x: 7, y: 4, name: 'Saint-Fromond' }, { x: 7, y: 1, name: 'Le Bocage' }],
    gap: 0.15,
    deploy: 0.25,
    ammo: { us: { artillery: 3 }, de: { bomber: 0 } },
    us: { remove: ['T2'], add: [{ id: 'D', kind: 'company', name: '4th Platoon', quality: 'standard' }, { id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' }] },
    de: { remove: ['dt2'], add: [{ id: 'd6', kind: 'company', name: '6. Zug', quality: 'standard', reserve: true }, { id: 'dps2', kind: 'schreck', name: 'Panzerschreck Team', reserve: true }] },
  },
];
// The maps as a campaign (Steve): in order across France, from the beaches through the bocage and the farms to Paris
const CAMPAIGN = ['beach', 'deep', 'hedges', 'farmland', 'river', 'town', 'station', 'paris'];
const COLS = MAPS[0].rows[0].length, ROWS = MAPS[0].rows.length;
// Sharing a field (Steve): each field is nine areas; pieces share it while their areas don't overlap (see footprint in
// sim.js: most pieces one area, the PaK two, a tank or a platoon of two or three sections four)
const HEDGE_GAP = 0.45;          // chance an edge between two fields has a gap (a gate or a broken bank)
const WIRE = 0.5;                // chance a gap between two fields is closed by a barbed-wire fence: men must cut it, tanks flatten it

// The blind bag: as well as a token for each piece, black timer tokens (a white sand-glass); drawing one ends the round
// there and then, whoever has still to move (Steve)
const ROUND_TIMER = 1;
const ROBOT_ROUNDS = 30;         // robot against robot: a draw after this many rounds, so a game can't run for ever
const TURNS = 0;                 // rounds allowed (0: no limit for now, Steve)
const START_DATE = 'Tue 11 July 1944';

// Reacting (Steve): a piece fired on can take cover. Its men get down where they are: every shot or shell at it needs
// two more for the rest of the round, but it misses its move unless the captain gets it up
const TAKE_COVER = 2;            // added to the score needed against a piece that has taken cover, from every weapon (Steve: +2)

// Shooting: each point of firepower rolls one six-sided die, which hits on TO_HIT or more.
// Cover adds to the score needed, elite troops take one off; a shot needing more than MAX_NEED is a Hail Mary
const TO_HIT = 3;                // a die needs this or more to hit, before cover, range and moving (Steve: 3+)
const MOVE_SHOOT_MOVES = 2;      // fields a Move & shoot can cover (Steve: one more than before)
const CHARGE_MOVES = 3;          // fields a charge can cover
const TANK_ROAD_BONUS = 1;       // fields more a tank goes, on a Move & shoot or a Charge, if it starts, stays and ends on road or lane (Steve)
const CLIMB = 1;                 // extra moves it costs men to climb a hedge bank (tanks drive through; wire stops men)
const SHAKEN_SHOOT = 1;          // a shaken piece needs one more to hit
const SHAKEN_MOVE = 0.5;         // a shaken piece still moves and charges, but only half as far (rounded down, at least one field)
const MIN_NEED = 2;              // no shot needs less than this (Steve): a 1 always misses
const PAK_VILLAGE_FIELDS = 4;    // a village this big (Steve): the PaK can move about all of it
const MAX_NEED = 6;              // past this a shot is a Hail Mary (Steve): throw a 6, then throw another 6 to hit, about 3%
const WOUND_CHANCE = 0.5;        // each hit is a coin toss: heads it wounds (a section, a team or a tank lost); every hit shakes
const QUALITY = { elite: { name: 'Elite', shoot: 1, assault: 1.3 }, standard: { name: 'Standard', shoot: 0, assault: 1 } };
// How finely the table is drawn (Steve: a low-power laptop on a 4K screen). start: the most pixels drawn on any screen,
// about 2560×1600; least: the floor it may fall to when frames are slow; step: the share kept each time it falls;
// slowFrame: seconds a frame may take (the middle of `sample` frames) before it does; pause: a gap longer than this isn't a slow frame
const PIXELS = { start: 4000000, least: 1200000, step: 0.7, slowFrame: 0.04, sample: 40, pause: 2 };
// The pixel ratio for a window: never above 1.5 or the screen's own, and within the budget of pixels
function pixelRatioFor(width, height, screenRatio, budget) {
  const fitted = Math.sqrt(budget / (width * height));
  return Math.min(1.5, screenRatio, fitted);
}

const SIGHT_RANGE = 99;          // how far any piece sees (Steve: the whole board; hedges, villages and orchards block the view). Shooting: RANGES
const LONG_RANGE = 1;             // added to the score needed at long range (the penalties stack)
// How far each kind of weapon sees and shoots, and how many fields away before long range starts (Steve: rifles one
// further, machine guns and tanks two beyond the rifles, the sniper the whole board with no long range)
const RANGES = {
  short: { sight: 4, long: 1 },     // bazookas and Panzerschrecks (Steve: one further)
  rifle: { sight: 4, long: 2 },     // rifle platoons and the captain's HQ
  heavy: { sight: 6, long: 4 },     // machine guns and the PaK
  tank: { sight: 7, long: 4 },      // tanks (Steve: one further than the machine guns)
  sniper: { sight: 99, long: 99 },  // the sniper: anywhere he can see, no long range, and cover doesn't help the target
};
// Close range (Steve): four areas across or less (a field is three), from whichever of their areas are nearest: one less
// needed on the dice, for every shot; not mortars, artillery or bombs
const BUNKER_ARC = 90;            // how wide a bunker's front is, in degrees, half each side of straight ahead (Steve: 120, then 90)
const BUNKER_FRONT = 3;          // more needed to hit a bunker from in front of it, or with shells or bombs (Steve)
const CLOSE_RANGE = 4 / 3;       // in fields
const CLOSE_BONUS = 1;           // taken off the score needed
const ON_THE_MOVE = 1;           // added to the score needed when firing after a move (Steve: like range and cover, +1 each)
const COVER = { hedge: 1, tankCorner: 1, placeCorner: 1 };   // added to the score needed: a target lining a hedge it is shot across (or past the end of), or a line past a tank's corner (Steve: a tank's edge acts like a hedge), or past the corner of a village, hamlet or orchard
// Villages, hamlets and orchards all work the same way (Steve): seen into and out of, never through. They differ only
// in their cover, added to the score needed against a piece in one: men, a tank, and against mortar or artillery
// fire. Two enemies in the very same field get none from it
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
  sherman:  { name: 'Sherman 75mm', soft: 1.5, hard: 1, tank: true, armour: 0, cutter: true },
  firefly:  { name: 'Sherman 76mm', soft: 1, hard: 2, tank: true, armour: 0, cutter: true },
  pz4:      { name: 'Panzer IV', soft: 1.5, hard: 1.5, tank: true, armour: 0, cutter: true },
  panther:  { name: 'Panther', soft: 1.5, hard: 3, tank: true, armour: 1, cutter: true },
  mg:       { name: '.50 cal team', soft: 5, hard: 0, team: true, men: 3 },        // machine guns fire 5 dice (Steve)
  // extraMove: fields more than other pieces on a Move & shoot or a Charge (Steve: he's got to get to the tank)
  bazooka:  { name: 'Bazooka team', soft: 0, hard: 2, team: true, men: 2, extraMove: 1 },
  sniper:  { name: 'Sniper team', soft: 1, hard: 0, team: true, sniper: true, men: 2 },   // the sniper and his spotter (Steve: a two-man team); sees the whole board, ignores cover and range (Steve)
  mg42:     { name: 'MG 42 team', soft: 5, hard: 0, team: true, men: 3 },
  schreck:  { name: 'Panzerschreck team', soft: 0, hard: 2.5, team: true, men: 2, extraMove: 1 },   // both sides the same (Steve)
  pak:      { name: 'PaK 40 gun', soft: 0.5, hard: 3, team: true, fixed: true },
  // His submachine gun (Steve): three dice, and closeOnly: he can't shoot beyond close range at all
  // Bunkers (Steve): they can't move, take two areas, and fire only out of the front. BUNKER says how they are hurt
  bunker_mg:  { name: 'MG bunker', soft: 5, hard: 0, team: true, fixed: true, bunker: true },
  bunker_gun: { name: 'PaK 40 bunker', soft: 0.5, hard: 3, team: true, fixed: true, bunker: true },
  captain:  { name: 'Captain', soft: 3, hard: 0, men: 1, closeOnly: true },
};

// Hand to hand (a charge into the enemy, Steve): the two sides strike in turn, the attacker first, a die for each base
// standing, each hit a base lost, until one side is gone. Being shaken doesn't count. A stop after this many exchanges
// (only reached when neither side can hurt the other)
const HAND_TO_HAND_LIMIT = 40;

// Fire support: dice on the target field (and a few on the fields around it for artillery), and its ammo: once fired it
// never comes back (Steve: mortars, artillery and, later, bombers never replenish)
// hard: its dice against a tank. A mortar's (Steve) only shakes a tank, or kills one already shaken: see damage in sim.js
// (Steve: too many, too accurate: half the rounds, 6 to 3 and 8 to 4, and the guns' 3 to 2 and 2 to 1; see SHELL_HARDER)
const MORTARS = { name: '81 mm mortars', dice: 4, splash: 0, ammo: 3, hard: 1 };
const ARTILLERY = { name: '105 mm battery', dice: 5, splash: 1, ammo: 2, hard: 1 };
const DE_MORTAR = { name: '8 cm mortars', dice: 3, splash: 0, ammo: 4, hard: 1 };   // the Germans' own mortar: drops on one piece, one mission a turn while ammo lasts
const DE_ARTILLERY = { name: '10.5 cm battery', dice: 5, splash: 1, ammo: 1, hard: 1 };
const SHELL_HARDER = 1;           // mortar and artillery dice need one more than a shot does: 4+ before cover (Steve)   // the Germans' guns: like ours, fewer rounds
// The bomber (Steve): the same for both sides. One run a game; a compass spin says which way it flies; it goes straight
// through a field chosen on the edge of the board and drops one bomb on every piece in every field under it, friend or foe.
// need: the score a bomb needs before cover. worth: how many more enemy pieces than a side's own (each of those counts
// one and a half) a line must catch before the computer flies it
const BOMBER = { need: 5, dice: 1, ammo: 1, directions: 16, worth: 2 };
const BOMBER_NAMES = { us: 'B-17', de: 'Ju 88' };
const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

// Who starts on each side. Each side is spread at random over its own end of the board: this share of its width,
// in cover where possible (the x, y below are only where they would stand without that)
const DEPLOY = 0.2;
const US_START = [
  { id: 'A', kind: 'company', name: '1st Platoon', quality: 'elite', x: 0, y: 2 },
  { id: 'B', kind: 'company', name: '2nd Platoon', quality: 'standard', x: 0, y: 4 },
  { id: 'C', kind: 'company', name: '3rd Platoon', quality: 'standard', x: 0, y: 6 },
  { id: 'cap', kind: 'captain', name: 'Captain (company HQ)', x: 0, y: 4 },   // one captain, with the company guidon
  { id: 'T1', kind: 'sherman', name: 'Sherman 75mm', x: 1, y: 4 },
  { id: 'T2', kind: 'firefly', name: 'Sherman 76mm', x: 0, y: 3 },
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

