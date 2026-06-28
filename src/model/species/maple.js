// maple.js - Species profile: Acer (Maple).
//
// Medium-large shade tree with a dense, rounded-to-oval crown. Upright
// ascending limbs, height a little greater than spread.

export default {
    key: 'acer',
    commonName: 'Maple',

    matureHeight: 50,
    matureSpread: 40,
    trunkDBH: 2.0,
    canopyClearance: 8,
    trunkHeightToCrown: 10,

    primaryLimbCount: [4, 6],
    primaryElevationDeg: [40, 62], // upright oval crown
    branchesPerNode: {
        secondary: [2, 3],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 6,
    lengthRatio: 0.64,
    radiusRatio: 0.68,
    divergenceDeg: [22, 44],
    primaryLengthFactor: 0.36,

    sweepPerSegDeg: 6,
    sagPerSegDeg: 5,
    jitterDeg: 4,
    azJitterDeg: 20,
};
