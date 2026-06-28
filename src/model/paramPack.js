// paramPack.js - Pipeline stage 3: Deterministic Parameter Pack.
//
// Resolves (species profile + instance intent) into a flat, rendering-free
// parameter object that the skeleton builder consumes. Age class scales the
// specimen and limits branch depth. No randomness here - the seed is applied
// later by the skeleton builder via the RNG.

import { deg } from './vec3.js';

const AGE = {
    young: { size: 0.5, maxOrder: 3 },
    mature: { size: 1.0, maxOrder: 4 },
    old: { size: 1.15, maxOrder: 4 },
};

export function resolveParams(species, intent) {
    const age = AGE[intent.ageClass] || AGE.mature;
    const dbh = species.trunkDBH * age.size;
    const trunkR = dbh / 2;

    return {
        // Trunk
        trunkRadius: trunkR,
        trunkTopFactor: 0.82,
        trunkHeight: species.trunkHeightToCrown * age.size,
        trunkLean: 0.5 * age.size,
        trunkSegments: 4,

        // Primary scaffold limbs
        primaryLimbCount: species.primaryLimbCount,
        primaryElevationDeg: species.primaryElevationDeg,
        primaryLength: species.matureSpread
            * (species.primaryLengthFactor ?? 0.34) * age.size,
        primaryRadius: trunkR * 0.55,

        // Recursive branching
        segments: species.segmentsPerBranch,
        lengthRatio: species.lengthRatio,
        radiusRatio: species.radiusRatio,
        divergenceDeg: species.divergenceDeg,
        childCounts: {
            1: species.branchesPerNode.secondary,
            2: species.branchesPerNode.tertiary,
            3: species.branchesPerNode.twig,
        },
        // Age limits branch depth; a species may cap it lower (e.g. a palm,
        // which never sub-branches past its fronds).
        maxOrder: Math.min(age.maxOrder, species.maxOrderCap ?? Infinity),

        // Per-branch shaping (radians)
        tipFactor: 0.55,
        minRadius: 0.03,
        sweepUp: deg(species.sweepPerSegDeg),
        sag: deg(species.sagPerSegDeg),
        jitter: deg(species.jitterDeg),
        azJitter: deg(species.azJitterDeg),
    };
}
