// whiteBirch.js - Species profile: Betula papyrifera (Paper / White Birch).
//
// Slender, narrow-oval tree with delicate, slightly pendulous fine branching
// and bright white bark. Tall relative to its narrow spread. (Often clump-form
// in nature; single-stem approximation here.)

export default {
    key: 'betula-papyrifera',
    commonName: 'White Birch',

    matureHeight: 48,
    matureSpread: 30,
    trunkDBH: 1.2,
    canopyClearance: 6,
    trunkHeightToCrown: 12,

    primaryLimbCount: [3, 5],
    primaryElevationDeg: [45, 68], // narrow, ascending
    branchesPerNode: {
        secondary: [2, 3],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 7,
    lengthRatio: 0.62,
    radiusRatio: 0.66,
    divergenceDeg: [20, 42],
    primaryLengthFactor: 0.34,

    sweepPerSegDeg: 5,
    sagPerSegDeg: 8, // fine twigs droop slightly
    jitterDeg: 6,
    azJitterDeg: 24,
};
