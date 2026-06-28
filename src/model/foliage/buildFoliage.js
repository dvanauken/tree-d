// buildFoliage.js - Pipeline stage 6 (first pass): Foliage Builder.
//
// Scatters leaves along the finest-order branches of a skeleton. This is a
// deliberately simple first pass: leaves are points with a size and a colour
// tint, generated deterministically from the same RNG stream as the skeleton.
// Per the project direction, leaves ultimately attach to stems/twigs; this
// stub approximates that by clustering leaves around twig-order nodes.
//
// Output: array of { position:[x,y,z], size, tint } - pure data.

const ORDER_RANK = { trunk: 0, primary: 1, secondary: 2, tertiary: 3, twig: 4 };

export function buildFoliage(skeleton, rng, opts = {}) {
    const leafSize = opts.leafSize ?? 0.85; // feet (diameter)
    const perNode = opts.leavesPerNode ?? 2;
    const jitter = opts.jitter ?? 0.9; // feet of scatter around a node
    const maxLeaves = opts.maxLeaves ?? 4000;

    // Finest order actually present (twigs for broadleaf, fronds for palm).
    let finest = 0;
    for (const p of skeleton.paths) finest = Math.max(finest, ORDER_RANK[p.order] ?? 0);
    if (finest === 0) return []; // trunk only - nothing to leaf

    const leaves = [];
    const nodes = skeleton.nodes;
    for (const path of skeleton.paths) {
        if ((ORDER_RANK[path.order] ?? 0) < finest) continue;
        // Skip the branch base; cluster toward the outer half.
        const ids = path.nodeIds;
        for (let i = Math.floor(ids.length / 2); i < ids.length; i++) {
            const base = nodes[ids[i]].position;
            for (let k = 0; k < perNode; k++) {
                leaves.push({
                    position: [
                        base[0] + rng.range(-jitter, jitter),
                        base[1] + rng.range(-jitter, jitter),
                        base[2] + rng.range(-jitter, jitter),
                    ],
                    size: leafSize * rng.range(0.7, 1.25),
                    tint: rng.next(),
                });
            }
        }
    }

    // Cap with a deterministic stride so dense trees stay performant.
    if (leaves.length > maxLeaves) {
        const stride = leaves.length / maxLeaves;
        const kept = [];
        for (let i = 0; i < maxLeaves; i++) kept.push(leaves[Math.floor(i * stride)]);
        return kept;
    }
    return leaves;
}
