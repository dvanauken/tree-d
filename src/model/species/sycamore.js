// sycamore.js - Species profile: Platanus occidentalis (American Sycamore).
//
// Large, fast-growing shade tree. Massive trunk, open ascending crown that is
// nearly as broad as it is tall. Heavy limbs rise then spread.

export default {
    key: 'platanus-occidentalis',
    commonName: 'Sycamore',

    matureHeight: 80,
    matureSpread: 65,
    trunkDBH: 4.0,
    canopyClearance: 9,
    trunkHeightToCrown: 16,

    primaryLimbCount: [3, 5],
    primaryElevationDeg: [35, 60], // ascending scaffold
    branchesPerNode: {
        secondary: [2, 3],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 6,
    lengthRatio: 0.66,
    radiusRatio: 0.70,
    divergenceDeg: [22, 46],
    primaryLengthFactor: 0.40,

    sweepPerSegDeg: 5,
    sagPerSegDeg: 4,
    jitterDeg: 5,
    azJitterDeg: 22,
};
