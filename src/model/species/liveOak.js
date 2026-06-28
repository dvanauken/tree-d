// liveOak.js - Species profile: Quercus virginiana (Southern Live Oak).
//
// Botanical + site-planning defaults. This is model truth: it describes how a
// Live Oak is shaped, NOT how it is drawn. Numbers are mature, residential
// site-planning specimen values (feet / degrees). The renderer never overrides
// these - it only displays what the skeleton builder derives from them.

export default {
    key: 'quercus-virginiana',
    commonName: 'Live Oak',

    // Mature dimensions (feet). Spread exceeds height - broad spreading crown.
    matureHeight: 45,
    matureSpread: 70,
    trunkDBH: 3.0, // diameter at breast height
    canopyClearance: 8, // managed clearance under the canopy

    // Trunk divides low into heavy scaffold limbs.
    trunkHeightToCrown: 9,

    // Branching habit.
    primaryLimbCount: [4, 6], // low heavy scaffold limbs
    primaryElevationDeg: [16, 36], // low, spreading take-off angles
    branchesPerNode: {
        secondary: [3, 4],
        tertiary: [2, 3],
        twig: [2, 3],
    },
    segmentsPerBranch: 6,
    lengthRatio: 0.62, // child length / parent length
    radiusRatio: 0.68, // child radius / parent radius
    divergenceDeg: [24, 52], // branch-off angle from parent

    // Signature Live Oak curvature: limbs sweep up then arch back down.
    sweepPerSegDeg: 7, // upward rise per segment, strongest near the base
    sagPerSegDeg: 6, // gravity droop per segment, strongest near the tip
    jitterDeg: 4, // per-segment wander
    azJitterDeg: 18, // azimuth jitter between siblings
};
