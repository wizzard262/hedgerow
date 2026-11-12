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
  // A railway line across a field (Steve: on Open farmland): it takes its row of areas, so nobody stands on it
  rail: { name: 'Railway line', blocksView: false },
  carriage: { name: 'Railway carriage', blocksView: true },
  wagon: { name: 'Goods wagon', blocksView: true },
  signalbox: { name: 'Signal box', blocksView: true },
  signal: { name: 'Signal', blocksView: false },   // (Steve: too thin to block the view)
  watertower: { name: 'Water tower', blocksView: true },
  coal: { name: 'Coal heap', blocksView: true },
  // Tank traps (Steve): no tank can enter their field; men go between them, one more to hit
  // (Steve: tank traps give no cover; a piece right beside a burnt-out landing craft has cover, as by a hedge)
  tanktrap: { name: 'Tank traps', blocksView: false, stopsTanks: true },
  hulk: { name: 'Burnt-out wreck', blocksView: true, coverBeside: true },
  // The Eiffel Tower (Steve): the target in Paris. Pieces stand between its legs, so it takes no areas; open ironwork, so it
  // blocks no view; men among its feet have one more to hit
  eiffel: { name: 'Eiffel Tower', blocksView: false, cover: 1 },
  // A strongpoint (Steve: Dunkirk): sandbag walls round the field; men in it have two more to hit (one against shells).
  // It takes no areas and blocks no view
  strongpoint: { name: 'Strongpoint', blocksView: false, cover: 2 },
  // Stalingrad (Steve, 2026-11-12): a pile of rubble takes an area, and men among it have one more to hit; a minefield
  // takes no areas, but every piece that goes into it may set off a mine (see MINES)
  rubble: { name: 'Rubble', blocksView: false, cover: 1 },
  minefield: { name: 'Minefield', blocksView: false, mines: true },
};
const MAPS = [
  {
    id: 'hedges', date: '11 July 1944', name: 'Hedge country', note: 'The usual battle: two villages, hedges and lanes. Paratroopers drop in early on.',
    airdrop: 'paras',
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
    id: 'river', date: '7 August 1944', name: 'River crossing', note: 'Two bridges are the only way over. The Americans have no bomber, and an M8 Greyhound armoured car in place of the Sherman 75mm; the Germans an extra MG 42, a Puma armoured car in place of their tanks, and their Ju 88.',
    airdrop: 'crate',
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
    us: { remove: ['T1'], add: [{ id: 'AC1', kind: 'm8', name: 'M8 Greyhound' }] },
    de: { remove: ['dt2', 'dt1'], add: [{ id: 'dmg5', kind: 'mg42', name: 'MG 42 Team', reserve: true }, { id: 'dac1', kind: 'puma', name: 'Puma', reserve: true }] },
  },
  {
    id: 'town', date: '15 August 1944', name: 'Crossroads town', note: 'A town on each side of the crossroads, and both sides start further forward. The Germans have a second PaK 40 and a Puma armoured car in place of their tanks; the Americans an M8 Greyhound armoured car as well as their two tanks.',
    airdrop: 'crate',
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
    us: { add: [{ id: 'AC1', kind: 'm8', name: 'M8 Greyhound' }] },
    de: { remove: ['dt1', 'dt2'], add: [{ id: 'pak2', kind: 'pak', name: 'PaK 40 (2)', post: [0, -1], garrison: true }, { id: 'dac1', kind: 'puma', name: 'Puma', reserve: true }] },
  },
  {
    id: 'farmland', date: '25 July 1944', name: 'Open farmland', note: 'Few hedges and long shots, a few barns that block the view, a duck pond, and a railway: trains run along it left to right, three fields a round, blocking the view. An armoured car each, an M8 Greyhound and a Puma, and a fourth American platoon; the B-17 flies, the Ju 88 does not.',
    rows: [
      '.....|.....h',
      '..o..|.vv...',
      '=====+======',
      '.....|.vv..o',
      '.h...|.vv...',
      '.....|.....h',
      // (the railway's row: open fields and the lane only, Steve: never through an orchard or a village)
      '.....|......',
      '..o..|.h.o..',
    ],
    villages: [{ x: 7, y: 4, name: 'Les Champs' }, { x: 7, y: 1, name: 'La Ferme' }],
    gap: 0.8, wire: 0.2,
    features: [
      { x: 3, y: 3, kind: 'barn', side: 'n' },
      { x: 9, y: 5, kind: 'barn', areas: ['nw', 'w'] },
      { x: 4, y: 0, kind: 'barn', areas: ['c', 'e'] },
      { x: 8, y: 7, kind: 'barn', areas: ['c', 's'] },
      // (a field up from where it was, off the railway's row, so the field still has room for a tank)
      { x: 3, y: 5, kind: 'pond', side: 's' },
    ],
    ammo: { us: { bomber: 1 }, de: { bomber: 0 } },
    // A railway across the second row of fields up from the bottom, along their north row of areas (Steve): trains run
    // along it from left to right (see TRAIN). cars: how many behind the engine, from to; spacing: how far the last one
    // has gone when the next comes on, from to
    trains: [{ row: 6, side: 'n', dir: 1, cars: [3, 4], spacing: [9, 9] }],
    airdrop: 'crate',
    // (Steve: a 4th platoon, to even it up: two robots 22% → 47% for the Americans)
    us: { add: [{ id: 'AC1', kind: 'm8', name: 'M8 Greyhound' }, { id: 'D', kind: 'company', name: '4th Platoon', quality: 'standard' }] },
    de: { add: [{ id: 'dac1', kind: 'puma', name: 'Puma', reserve: true }] },
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
    // Three lines clear right across the yard (Steve): near the top and at the bottom the trains run left to right, in the
    // middle right to left; trains of any length from two to five behind the engine, coming at no fixed times
    trains: [
      { row: 0, side: 's', dir: 1, cars: [2, 5], spacing: [4, 11] },
      { row: 5, side: 'n', dir: -1, cars: [2, 5], spacing: [4, 11] },
      { row: 7, side: 's', dir: 1, cars: [2, 5], spacing: [4, 11] },
    ],
    ammo: { us: { artillery: 3 } },
  },
  {
    id: 'beach', date: '6 June 1944', name: 'Beach landing', note: 'The Americans land from craft in the surf and must destroy every German: there is no goal to take and hold. Each bunker is a U of concrete with an MG team or a PaK 40 inside, firing only out of the slit in its thick front. From the front you need 3 more to hit, from a thin side 1 more, from the open back nothing extra. Tank traps, a sea wall, wrecks on the sand. The Germans have fewer pieces and no tanks, but more artillery.',
    generated: 'beach',
    landing: true,
    // (Steve: no goal to take on the beach; the Americans win by destroying every German. The main bunker's field is
    // still where the main bunker stands and the German reserves gather)
    noGoal: true,
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
    // (Steve, 2026-11-12: no American mortars on either beach, and one more round for the warship)
    ammo: { us: { bomber: 1, artillery: 3, mortars: 0 }, de: { artillery: 2, bomber: 0 } },
    // The American guns are a battleship out at sea (Steve: like Dunkirk)
    navy: 'battleship',
    guns: { us: { artillery: 'USS Texas' } },
    us: { add: [{ id: 'D', kind: 'company', name: '4th Platoon', quality: 'standard' }, { id: 'bz2', kind: 'bazooka', name: 'Bazooka Team 2' }] },
    de: {
      remove: ['pak1', 'dmg2', 'dmg4', 'dps1', 'd3', 'd5', 'dt1', 'dt2'],
      add: [
        { id: 'bk1', kind: 'bunker_gun', name: 'Main bunker', main: true },
        { id: 'bk2', kind: 'bunker_mg', name: 'MG bunker', place: [5, 1] },
        { id: 'bk3', kind: 'bunker_gun', name: 'PaK 40 bunker', place: [5, 3] },
        { id: 'bk4', kind: 'bunker_mg', name: 'MG bunker', place: [5, 6] },
        // (Steve: one more MG bunker, in the gap in the middle of the sea wall, facing the way up to the main bunker)
        { id: 'bk5', kind: 'bunker_mg', name: 'MG bunker', place: [5, 4] },
      ],
    },
  },
  {
    id: 'deep', date: '20 June 1944', name: 'Deep bocage', note: 'Hedges nearly everywhere and few lanes. More infantry and fewer tanks: no Sherman 76mm and no Panther; a fourth American platoon and second bazooka, a sixth German platoon and second Panzerschreck. Paratroopers drop in early on.',
    airdrop: 'paras',
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
  {
    // Dunkirk (Steve, 2026-11-11): a bonus battle, not in the campaign. The British hold the Germans off while little ships
    // take their men off the beach. The 'us' side is the British here (names), the Germans attack from the east. The
    // village is only where the Germans make for: the beach; nobody has to take or hold it
    id: 'dunkirk', bonus: true, date: '31 May 1940', name: 'Dunkirk',
    note: 'The British hold the Germans back while little ships take them off the beach. Lorries come down the coast road from the top and drive to the little ships lying off the beach, and the men run out of the back into the boats: one a round from round 2, each with 1 or 2 sections; get 12 sections away within 12 rounds. If a German reaches the coast road, the way to the boats is cut and you lose. Your men do not go: they hold the strongpoints along the front and keep the Germans off the road and the beach. 2 or 3 boats come in each round and sail at its end. A Matilda II, Universal Carriers, a Vickers and a Boys rifle against Panzer Is, IIs, a III and an armoured car. Destroyers offshore fire for the British.',
    noGoal: true,
    names: { us: 'British', de: 'Germans' },
    // (the sea is off the board, out to the table's edge, Steve: the boats lie off the beach)
    rows: [
      'bbb|...o..h.',
      'bbb|.h....o.',
      'bbb+========',
      'bbb|..o..h..',
      'bbb|.o...o..',
      'bbb+========',
      'bbb|...h..o.',
      'bbb|.o....h.',
    ],
    // Strongpoints (Steve: the British are defending): sandbagged positions along the front, cover for the men in them
    features: [
      { x: 5, y: 0, kind: 'strongpoint', areas: [], seed: 1 },
      { x: 4, y: 1, kind: 'strongpoint', areas: [], seed: 2 },
      { x: 4, y: 3, kind: 'strongpoint', areas: [], seed: 3 },
      { x: 6, y: 4, kind: 'strongpoint', areas: [], seed: 4 },
      { x: 5, y: 6, kind: 'strongpoint', areas: [], seed: 5 },
      { x: 6, y: 7, kind: 'strongpoint', areas: [], seed: 6 },
    ],
    villages: [{ x: 1, y: 4, name: 'the beach' }],
    // Flanders: flat and open, few hedges, little wire
    gap: 0.7, wire: 0.15,
    // The British start along the front, from this column; both sides take this share of the width
    from: { us: 4 }, deploy: 0.25,
    // need: sections of men to get away (Steve 2026-11-12: sections, not lorry-loads; 12, as 8 lorry-loads of 1 or 2
    // came to about 12, and two robots win about 6 games in 10); rounds: to do it in; boats: how many come each round, from to; trucks: the lorries,
    // in at the top of the coast road (this column), from round first to last, how many a round, sections of men in each,
    // and how many fields each drives a round
    // noBoats: rows of the water's edge where no boat comes: the bottom half, behind the destroyer and the bomber (Steve
    // 2026-11-12: the little ships use the top half of the beach)
    evacuate: { need: 12, rounds: 12, boats: [2, 3], noBoats: [4, 5, 6, 7], trucks: { road: 3, first: 2, last: 12, each: [1, 1], sections: [1, 2], moves: 4 } },
    // The destroyers stand in for the British artillery (Steve); the RAF's bomber in 1940 a Bristol Blenheim (Steve asked
    // for a Lancaster: it only came in 1942), one run; no German bomber
    guns: { us: { artillery: 'Royal Navy destroyers', bomber: 'Blenheim' } },
    // The British artillery is a destroyer out at sea (Steve); no British mortars, and one more round for the destroyer
    // (Steve, 2026-11-12)
    navy: 'destroyer',
    ammo: { us: { artillery: 4, mortars: 0, bomber: 1 }, de: { bomber: 0 } },
    us: {
      only: [
        { id: 'A', kind: 'company', name: '1st Platoon, Coldstream Guards', quality: 'elite' },
        { id: 'B', kind: 'company', name: '2nd Platoon (Brens)', quality: 'standard' },
        { id: 'C', kind: 'company', name: '3rd Platoon (Brens)', quality: 'standard' },
        { id: 'cap', kind: 'captain', name: 'Captain (company HQ)' },
        { id: 'T1', kind: 'matilda', name: 'Matilda II' },
        { id: 'UC1', kind: 'carrier', name: 'Universal Carrier 1' },
        { id: 'UC2', kind: 'carrier', name: 'Universal Carrier 2' },
        { id: 'mg1', kind: 'mg', name: 'Vickers MG' },
        { id: 'at1', kind: 'boys', name: 'Boys Anti-tank Rifle' },
      ],
    },
    de: {
      only: [
        { id: 'd1', kind: 'company', name: '1. Zug', quality: 'elite', reserve: true },
        { id: 'd2', kind: 'company', name: '2. Zug', quality: 'standard', reserve: true },
        { id: 'd3', kind: 'company', name: '3. Zug', quality: 'standard', reserve: true },
        { id: 'd4', kind: 'company', name: '4. Zug', quality: 'standard', reserve: true },
        { id: 'dcap', kind: 'captain', name: 'Hauptmann (company HQ)', reserve: true },
        { id: 'dmg1', kind: 'mg42', name: 'MG 34 Team', reserve: true },
        { id: 'dmg2', kind: 'mg42', name: 'MG 34 Team', reserve: true },
        { id: 'dt1', kind: 'pz1', name: 'Panzer I', reserve: true },
        { id: 'dt2', kind: 'pz2', name: 'Panzer II', reserve: true },
        { id: 'dt3', kind: 'pz3', name: 'Panzer III', reserve: true },
        { id: 'dac1', kind: 'sdkfz231', name: 'Sd.Kfz. 231', reserve: true },
      ],
    },
  },
  {
    // Stalingrad (Steve, 2026-11-12): a bonus battle, not in the campaign. A bombed-out city: the walls of ruined buildings
    // stand on the edges between fields and act as hedges do (seen over only from beside them; men climb through the
    // windows; lining one is cover), with tall corners where they meet, and lines of rubble here and there doing the same.
    // Piles of rubble and minefields made new each game (generated: 'ruins'). The 'us' side is the Soviets (army 'su');
    // the table is seen from the other side (flip), so they come in from the right and the Germans hold the left (Steve)
    id: 'stalingrad', bonus: true, date: 'November 1942', name: 'Stalingrad',
    note: 'A bombed-out city. The Soviets attack the Germans holding the ruins of the Univermag store: an open courtyard of four fields, walled all round. The walls of ruined buildings stand between the fields and work as hedges do: you see over one only from right beside it, men climb through the windows, and lining one is cover. Lines of rubble do the same; piles of rubble give cover, and minefields may blow up whoever goes in. Each side has a section of submachine gunners: two bases of three men, 3 dice a base (6 in all), at close range only. The Germans have an 8.8 cm Flak in a fixed position on a crossroads, looking down an open street; the Soviets a T-34.',
    generated: 'ruins',
    ruins: true,
    army: 'su',
    flip: true,
    // (Steve: the player is the Soviets when this battle is picked)
    player: 'us',
    names: { us: 'Soviets', de: 'Germans' },
    rows: [
      '..|...|...|.',
      '..|...|...|.',
      '==+===+===+=',
      '..|...|...|.',
      '..|...|...|.',
      '==+===+===+=',
      '..|...|...|.',
      '..|...|...|.',
    ],
    villages: [{ x: 8, y: 4, name: 'the Univermag' }],
    // The Univermag (Steve: a fully open courtyard, not like a village): four plain fields with no walls between them and
    // ruined walls all round the outside, which work as hedges do
    courtyard: { x: 7, y: 3, w: 2, h: 2 },
    // The walls: more of them than hedges in the bocage; a little wire across the gaps
    gap: 0.35, wire: 0.1,
    // The Soviet guns by name; no Soviet bomber for now
    guns: { us: { artillery: '122 mm howitzers', mortars: '82 mm mortars' } },
    ammo: { us: { bomber: 0 } },
    us: {
      only: [
        { id: 'A', kind: 'company', name: '1st Guards Platoon', quality: 'elite' },
        { id: 'B', kind: 'company', name: '2nd Platoon', quality: 'standard' },
        { id: 'C', kind: 'company', name: '3rd Platoon', quality: 'standard' },
        // (Steve: a section of submachine gunners each side, two bases of three men with PPSh or MP 40, six shots)
        { id: 'smg1', kind: 'company', arms: 'smg', name: 'PPSh Section', quality: 'standard' },
        { id: 'cap', kind: 'captain', name: 'Kapitan (company HQ)' },
        { id: 'T1', kind: 't34', name: 'T-34/76' },
        { id: 'mg1', kind: 'mg', name: 'Maxim MG' },
        { id: 'at1', kind: 'boys', name: 'PTRD Anti-tank Rifle' },
        { id: 'sn1', kind: 'sniper', name: 'Sniper Team' },
      ],
    },
    de: {
      only: [
        { id: 'd1', kind: 'company', name: '1. Zug', quality: 'standard', post: [0, 0], garrison: true },
        { id: 'dmg1', kind: 'mg42', name: 'MG 34 Team', post: [0, 0], garrison: true },
        { id: 'dcap', kind: 'captain', name: 'Hauptmann (company HQ)', post: [0, 0], garrison: true },
        // The 88 (Steve: a fixed position, pointing down an open street, on a crossroads): on the crossroads behind the
        // store, looking west down the street, where no wall stands in the way; it never moves
        { id: 'd88', kind: 'flak88', name: '8.8 cm Flak 36', post: [2, 1], garrison: true, aim: Math.PI },
        { id: 'd2', kind: 'company', name: '2. Zug', quality: 'standard', post: [0, 1] },
        { id: 'dsmg', kind: 'company', arms: 'smg', name: 'MP 40 Section', quality: 'standard', post: [0, -1] },
        { id: 'dmg2', kind: 'mg42', name: 'MG 34 Team', post: [-1, -1] },
        { id: 'd3', kind: 'company', name: '3. Zug', quality: 'standard', reserve: true },
        { id: 'dt1', kind: 'pz4', name: 'Panzer IV', reserve: true },
        { id: 'dt2', kind: 'pz3', name: 'Panzer III', reserve: true },
      ],
    },
  },
];
// The maps as a campaign (Steve): in order across France, from the beaches through the bocage and the farms to Paris
const CAMPAIGN = ['beach', 'deep', 'hedges', 'farmland', 'river', 'town', 'station', 'paris'];
// Bonus battles (Steve, 2026-11-11): outside the campaign, shown at the top right of the New game choice, Dunkirk on the
// left and Stalingrad on the right. stamp: the word across its picture while it can't be played yet (no map in MAPS). One with a map takes its note from there
const BONUS = [
  { id: 'dunkirk', name: 'Dunkirk', date: '31 May 1940' },
  { id: 'stalingrad', name: 'Stalingrad', date: 'November 1942' },
];
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
const CAR_ROAD_BONUS = 2;        // the same for an armoured car (Steve): it is quick on the road
// Trains (Steve: on Open farmland and in the Train station): an engine and its cars, a field each, moving one field along
// their line after every piece's turn (each token drawn after the first). How long and how often: each map's trains.
// wagon: the share of cars that are goods wagons, not carriages. They block the view like the station's stock
const TRAIN = { wagon: 0.5 };
// Airdrops (Steve): once a game, at the start of a round from first to last. Paratroopers (on the bocage maps): a C-47 drops
// a section of the 101st, elite, onto a field in the middle of the board, off target (a field next to it) half the time.
// A supply crate (on the open maps): the first side to reach its field gets one more artillery round
const AIRDROP = { first: 2, last: 4, offTarget: 0.5, crateRounds: 1 };
const CLIMB = 1;                 // extra moves it costs men to climb a hedge bank (tanks drive through; wire stops men)
const SHAKEN_SHOOT = 1;          // a shaken piece needs one more to hit
const SHAKEN_MOVE = 0.5;         // a shaken piece still moves and charges, but only half as far (rounded down, at least one field)
const MIN_NEED = 2;              // no shot needs less than this (Steve): a 1 always misses
const PAK_VILLAGE_FIELDS = 2;    // a village of at least this many fields (Steve: the four-field one, then the two-field ones too): the PaK can move about all of it
const MAX_NEED = 6;              // past this a shot is a Hail Mary (Steve): throw a 6, then throw another 6 to hit, about 3%
const WOUND_CHANCE = 0.5;        // each hit is a coin toss: heads it wounds (a section, a team or a tank lost); every hit shakes
const MAX_SECTIONS_LOST = 1;     // the most sections a rifle platoon loses to one shot, mission or bomb (Steve); hand to hand can take more
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
const BUNKER_SIDE = 1;           // more needed to hit a bunker from either side (Steve); from behind, nothing
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
const CAR_WIRE_SNAG = 0.5;      // the same for an armoured car (Steve): it gets through wire, but on wheels it is snagged half the time
const MEN_A_BASE = 3;             // men on each section's round base (Steve)
const SMALL_TARGET = 1;          // added to the score needed against a small target: a piece of two men or fewer (Steve: sniper, bazooka, captain; not the MG, three men)
const CAPTAIN_RALLIES = { still: 2, fired: 1 };   // rallies a round (Steve): two if he stays put or charges (before, after or either side of the charge), one if he shoots or moves and shoots (before or after)
const RALLY_RANGE = 3;           // the captain rallies a shaken friendly piece up to this many fields away (Steve)
// A rally always works, and it is the only thing that clears shaken (Steve): not resting, not a round ending, not a fight

// What each kind of piece fights with. soft: against infantry and guns; hard: against tanks (anti-tank)
// he: a tank's gun against men, its high explosive (its machine guns roll soft as well); vsMen: what a piece rolls
// against men when it isn't its soft and half its anti-tank dice together. Never less than one die (Steve: a whole die
// in the numbers, not half a die rounded up), so each is 0 or at least 1
const PIECES = {
  company:  { name: 'Rifle platoon', soft: 1, hard: 0 },          // per section (3 sections, a base each). Its kind is 'company' in the code
  // Tanks: one tank a unit (Steve). armour: added to the score anti-tank dice and shells need (the Panther's front is hard
  // to beat), shown in the panel and on the label.
  // cutter: drives straight through a hedge, leaving a gap (Steve: every tank does; no separate Break through for tanks)
  sherman:  { name: 'Sherman 75mm', soft: 1.5, hard: 1, he: 1, tank: true, armour: 0, cutter: true },
  firefly:  { name: 'Sherman 76mm', soft: 1, hard: 2, he: 1, tank: true, armour: 0, cutter: true },
  pz4:      { name: 'Panzer IV', soft: 1.5, hard: 1.5, he: 1, tank: true, armour: 0, cutter: true },
  // Armoured cars (Steve), on the open maps in place of a tank: on wheels, so no hedge cutters: no driving through
  // hedges, quick on the road (CAR_ROAD_BONUS), snagged in barbed wire half the time (CAR_WIRE_SNAG), thin armour that
  // machine guns can get through (car)
  m8:       { name: 'M8 Greyhound', soft: 1.5, hard: 1, he: 1, tank: true, armour: 0, car: true },
  puma:     { name: 'Puma', soft: 1, hard: 1, he: 1, tank: true, armour: 0, car: true },
  panther:  { name: 'Panther', soft: 1.5, hard: 3, he: 1.5, tank: true, armour: 1, cutter: true },
  mg:       { name: '.50 cal team', soft: 5, hard: 0, team: true, men: 3 },        // machine guns fire 5 dice (Steve)
  // extraMove: fields more than other pieces on a Move & shoot or a Charge (Steve: he's got to get to the tank)
  bazooka:  { name: 'Bazooka team', soft: 0, hard: 2, team: true, men: 2, extraMove: 1 },
  sniper:  { name: 'Sniper team', soft: 1, hard: 0, team: true, sniper: true, men: 2 },   // the sniper and his spotter (Steve: a two-man team); sees the whole board, ignores cover and range (Steve)
  mg42:     { name: 'MG 42 team', soft: 5, hard: 0, team: true, men: 3 },
  schreck:  { name: 'Panzerschreck team', soft: 0, hard: 2.5, team: true, men: 2, extraMove: 1 },   // both sides the same (Steve)
  // atGun: an anti-tank gun (swings round to fire, its hits on men kill); emplaced: in a fixed position, it never moves
  // at all, not even within its field (Steve: Stalingrad's 88)
  pak:      { name: 'PaK 40 gun', soft: 1, hard: 3, vsMen: 2, team: true, fixed: true, atGun: true },
  // shield: what its gun shield adds to a shot from in front of it, within SHIELD_ARC of the way it faces (Steve: the 88)
  flak88:   { name: '8.8 cm Flak 36', soft: 1, hard: 4, team: true, fixed: true, atGun: true, emplaced: true, shield: 2 },
  // Stalingrad, 1942 (Steve)
  t34:      { name: 'T-34/76', soft: 1.5, hard: 1.5, he: 1, tank: true, armour: 1, cutter: true },
  // His submachine gun (Steve): three dice, and closeOnly: he can't shoot beyond close range at all
  // Bunkers (Steve): they can't move, take two areas, and fire only out of the front. BUNKER says how they are hurt
  bunker_mg:  { name: 'MG bunker', soft: 5, hard: 0, team: true, fixed: true, bunker: true },
  bunker_gun: { name: 'PaK 40 bunker', soft: 1, hard: 3, vsMen: 2, team: true, fixed: true, bunker: true },
  captain:  { name: 'Captain', soft: 3, hard: 0, men: 1, closeOnly: true },
  // Dunkirk, 1940 (Steve). extraMove -1: the Matilda is slow
  matilda:  { name: 'Matilda II', soft: 1, hard: 1, he: 1, tank: true, armour: 2, cutter: true, extraMove: -1 },
  carrier:  { name: 'Universal Carrier', soft: 2, hard: 0, he: 0, tank: true, armour: 0, car: true },   // a Bren on a small open tracked carrier
  // A lorry-load of men for the boats (Steve): no weapons, no orders; it drives itself. big: a corner block, as a tank
  lorry:    { name: 'Lorry', soft: 0, hard: 0, big: true, lorry: true },
  boys:     { name: 'Boys anti-tank rifle team', soft: 0, hard: 1, vsMen: 1, team: true, men: 2 },
  pz1:      { name: 'Panzer I', soft: 1.5, hard: 0, he: 0, tank: true, armour: 0, cutter: true },   // two machine guns, no gun
  pz2:      { name: 'Panzer II', soft: 1, hard: 1, he: 1, tank: true, armour: 0, cutter: true },  // a 2 cm cannon
  pz3:      { name: 'Panzer III', soft: 1.5, hard: 1, he: 1, tank: true, armour: 0, cutter: true },
  sdkfz231: { name: 'Sd.Kfz. 231', soft: 1, hard: 1, he: 1, tank: true, armour: 0, car: true },   // eight-wheeled armoured car
};

// Hand to hand (a charge into the enemy, Steve): the two sides strike in turn, the attacker first, a die for each base
// standing, each hit a base lost, until one side is gone. Being shaken doesn't count. A stop after this many exchanges
// (only reached when neither side can hurt the other)
const HAND_TO_HAND_LIMIT = 40;

// Fire support: dice on the target field (and a few on the fields around it for artillery), and its ammo: once fired it
// never comes back (Steve: mortars, artillery and, later, bombers never replenish)
// hard: its dice against a tank. A mortar's (Steve) only shakes a tank, or kills one already shaken: see damage in sim.js
// (Steve: too many, too accurate: half the rounds, 6 to 3 and 8 to 4, and the guns' 3 to 2 and 2 to 1; see SHELL_HARDER)
// Their names (Steve: the right ones for the time): the US M1 81 mm mortar and 105 mm howitzer, the German 8 cm
// Granatwerfer 34 and 10.5 cm leichte Feldhaubitze 18. One home for them: the table, the panel and the dice tags all use these
const MORTARS = { name: 'M1 81 mm mortars', dice: 4, splash: 0, ammo: 3, hard: 1 };
const ARTILLERY = { name: '105 mm howitzers', dice: 5, splash: 1, ammo: 2, hard: 1 };
const DE_MORTAR = { name: '8 cm GrW 34 mortars', dice: 3, splash: 0, ammo: 4, hard: 1 };   // the Germans' own mortar: drops on one piece, one mission a turn while ammo lasts
const DE_ARTILLERY = { name: '10.5 cm leFH 18 howitzers', dice: 5, splash: 1, ammo: 1, hard: 1 };
const SHELL_HARDER = 1;           // mortar and artillery dice need one more than a shot does: 4+ before cover (Steve)   // the Germans' guns: like ours, fewer rounds
// The bomber (Steve): the same for both sides. One run a game; a compass spin says which way it flies; it goes straight
// through a field chosen on the edge of the board and drops one bomb on every piece in every field under it, friend or foe.
// need: the score a bomb needs before cover. worth: how many more enemy pieces than a side's own (each of those counts
// one and a half) a line must catch before the computer flies it
const BOMBER = { need: 5, dice: 1, ammo: 1, directions: 16, worth: 2 };
// A section of submachine gunners (Steve: Stalingrad, PPSh or MP 40): a rifle platoon (arms: 'smg' on the piece) of
// `bases` bases of three men, each rolling `dice` dice, at close range only, as the captain's submachine gun
// (Steve: two bases of three men, still six shots)
const SMG = { bases: 2, dice: 3 };
// A gun shield covers this wide an arc in front of the gun, in degrees (Steve: the 88 has 2 cover from the front)
const SHIELD_ARC = 90;
// Minefields (Steve: Stalingrad): each piece going into one rolls a die; this or more sets off a mine, a hit on it
// (an anti-tank hit on a tank)
const MINES = { need: 5 };
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

