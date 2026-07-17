// treeDigest.mjs - Shared digest of a built TreeModel for regression checks.
//
// A digest is a tiny numeric fingerprint of the generated model: counts plus
// coordinate/radius sums. Any change to the generator that alters ANY node,
// radius or leaf at a given seed changes the digest. Used by digest.mjs
// (reporting) and check.mjs (pass/fail gate).

export function digest(model) {
    const s = model.skeleton;
    let posSum = 0;
    let radSum = 0;
    for (const n of s.nodes) {
        posSum += n.position[0] + n.position[1] + n.position[2];
        radSum += n.radius;
    }
    let leafSum = 0;
    for (const lf of model.leaves) {
        leafSum += lf.position[0] + lf.position[1] + lf.position[2] + lf.size;
    }
    return {
        nodes: s.nodes.length,
        paths: s.paths.length,
        leaves: model.leaves.length,
        posSum: posSum.toFixed(6),
        radSum: radSum.toFixed(6),
        leafSum: leafSum.toFixed(6),
        height: Number(model.metadata.height.toFixed(3)),
        spread: Number(model.metadata.spread.toFixed(3)),
        firstViolated: model.metadata.architecture.firstViolated?.name ?? null,
    };
}
