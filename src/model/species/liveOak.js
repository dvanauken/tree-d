// liveOak.js - Species profile: Quercus virginiana (Southern Live Oak).
//
// THE HERO. This is a DECLARATIVE description of one finished, ideal specimen at
// the apex of its beauty: a magnificent mature Southern Live Oak. There is NO
// age scaling, NO seasons, NO growth-over-time, NO LOD. The numbers below are
// the agreed contract the whole pipeline codes against; `resolveParams` detects
// the hero by the presence of the `hero` block and flattens it into the pack the
// grower reads. The renderer never overrides these - it only displays what the
// skeleton + foliage builders derive from them.
//
// Units: feet / degrees. Colours: 0xRRGGBB.

export default {
    id: 'quercus-virginiana',
    key: 'quercus-virginiana',   // registry key (kept for save/load compatibility)
    commonName: 'Live Oak',
    form: 'decurrent-dome',

    // BUILD ORDER: character is the Phase-2 deviation amount. 0 = the GOLD TREE
    // (the ideal, healthy, balanced specimen - no pruning, death, asymmetry or
    // damage). Phase-2 effects scale up from there. Build the gold tree first.
    character: 0,

    // Overall finished dimensions of the hero specimen.
    hero: { height: 36, spread: 100, trunkDBH: 4.0, clearance: 8 },

    // Legacy editor fields mirrored from the hero profile so the current panel
    // displays useful values and saved profiles stay compatible.
    matureHeight: 36,
    matureSpread: 100,
    trunkDBH: 4.0,
    trunkHeightToCrown: 7,
    primaryLimbCount: [4, 6],
    primaryElevationDeg: [8, 24],
    primaryLengthFactor: 0.52,
    branchesPerNode: {
        secondary: [2, 3],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    divergenceDeg: [28, 58],
    segmentsPerBranch: 5,
    lengthRatio: 0.48,
    radiusRatio: 0.58,
    maxOrderCap: 4,
    sweepPerSegDeg: 4,
    sagPerSegDeg: 4,
    jitterDeg: 3,
    azJitterDeg: 14,
    leafSize: 0.20,
    leavesPerNode: 3,
    maxLeaves: 12000,

    // Short, muscular bole that divides low into heavy leaders.
    trunk: {
        clearLength: 7, taper: 0.88, lean: 0.4, flare: 0.6,
        fluting: 0.15, dividesInto: [2, 3],   // a FEW monumental hero leaders
    },

    // The signature spreading scaffold: few massive slow-taper limbs that take
    // off low, dip toward the ground, then arch back up, wandering and crossing.
    scaffold: {
        count: [4, 6], takeoffAngle: [8, 24], basalRadiusFraction: 0.82,
        taperRetention: 0.90, lengthFraction: 0.52,
        dipAndRise: { dip: 0.28, rise: 0.65 }, sinuosity: 0.55, crossOver: true,
    },

    // Apical dominance: each limb continues as a dominant leader that inherits
    // most of the radius/length; laterals are markedly thinner and shorter.
    dominance: { strength: 0.62, leaderRadiusShare: 0.72, leaderLengthShare: 0.64 },

    // Per-order character for the subordinate branching (keyed by child order).
    branching: [
        { order: 'secondary', count: [2, 3], divergence: [28, 48], lengthRatio: 0.56, radiusRatio: 0.66, straightness: 0.58 },
        { order: 'tertiary',  count: [2, 3], divergence: [32, 54], lengthRatio: 0.48, radiusRatio: 0.58, straightness: 0.42 },
        { order: 'twig',      count: [2, 3], divergence: [34, 58], lengthRatio: 0.36, radiusRatio: 0.46, straightness: 0.28 },
    ],

    // Dense evergreen dome; leaves live on the OUTER SHELL of the crown.
    crown: {
        shape: 'broad-dome', leafSize: 0.20, density: 'dense',
        placement: 'outer-shell', colorRange: [0x2f4a1e, 0x6a8c3a],
    },

    // Surface character consumed by the procedural bark/leaf materials.
    surface: {
        bark: { color: 0x3a2a1c, roughness: 0.96, fissure: 0.4 },
        leaf: { sheen: 0.3, twoTone: true },
    },
};
