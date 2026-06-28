// palm.js - Species profile: a generic fan/feather palm (Arecaceae).
//
// Structurally unlike the broadleaf species: a single tall unbranched trunk
// topped by a radiating crown of arching fronds. maxOrderCap: 1 stops growth at
// the "primaries" (the fronds) so nothing sub-branches. Fronds take off at a
// wide spread of elevations and droop strongly under their own weight.

export default {
    key: 'arecaceae',
    commonName: 'Palm',

    matureHeight: 32,
    matureSpread: 18,
    trunkDBH: 1.2,
    canopyClearance: 0,
    trunkHeightToCrown: 24, // tall bare trunk; crown sits at the top

    primaryLimbCount: [12, 18], // fronds
    primaryElevationDeg: [-12, 58], // radiate up, out, and drooping
    branchesPerNode: {
        secondary: [1, 1], // unused (capped)
        tertiary: [1, 1],
        twig: [1, 1],
    },
    segmentsPerBranch: 8, // smooth frond arch
    lengthRatio: 0.60,
    radiusRatio: 0.60,
    divergenceDeg: [10, 20],
    primaryLengthFactor: 0.70,
    maxOrderCap: 1, // fronds do not sub-branch

    sweepPerSegDeg: 2,
    sagPerSegDeg: 14, // strong droop -> arching fronds
    jitterDeg: 3,
    azJitterDeg: 14,
};
