// crepeMyrtle.js - Species profile: Lagerstroemia (Crepe Myrtle).
//
// Small ornamental, classically multi-stemmed with a vase form: steep upright
// limbs from low on the tree, fine twiggy crown, smooth bark. (True multi-trunk
// is not modelled yet - approximated here as a low, steeply upright crown.)

export default {
    key: 'lagerstroemia',
    commonName: 'Crepe Myrtle',

    matureHeight: 22,
    matureSpread: 18,
    trunkDBH: 0.6,
    canopyClearance: 4,
    trunkHeightToCrown: 4, // divides low

    primaryLimbCount: [4, 6],
    primaryElevationDeg: [55, 78], // steep, upright vase
    branchesPerNode: {
        secondary: [2, 3],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 6,
    lengthRatio: 0.60,
    radiusRatio: 0.66,
    divergenceDeg: [18, 38],
    primaryLengthFactor: 0.50,

    sweepPerSegDeg: 4,
    sagPerSegDeg: 5,
    jitterDeg: 5,
    azJitterDeg: 20,
};
