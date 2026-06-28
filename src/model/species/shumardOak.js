// shumardOak.js - Species profile: Quercus shumardii (Shumard Oak).
//
// Large red oak. Pyramidal when young, maturing to a broad open rounded crown
// with strong ascending limbs off a dominant trunk. Taller and more upright
// than the spreading Live Oak.

export default {
    key: 'quercus-shumardii',
    commonName: 'Shumard Oak',

    matureHeight: 70,
    matureSpread: 55,
    trunkDBH: 2.8,
    canopyClearance: 9,
    trunkHeightToCrown: 14,

    primaryLimbCount: [4, 6],
    primaryElevationDeg: [30, 55], // ascending, broad-rounded
    branchesPerNode: {
        secondary: [3, 4],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 6,
    lengthRatio: 0.64,
    radiusRatio: 0.69,
    divergenceDeg: [24, 48],
    primaryLengthFactor: 0.38,

    sweepPerSegDeg: 6,
    sagPerSegDeg: 5,
    jitterDeg: 4,
    azJitterDeg: 20,
};
