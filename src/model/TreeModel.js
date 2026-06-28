// TreeModel.js - The compiled tree asset and the function that builds it.
//
// Orchestrates the model-layer pipeline: species + intent -> parameter pack ->
// seeded RNG -> skeleton graph -> metadata. The result is "tree truth" that a
// renderer adapter displays. Wood mesh and foliage are future stages and are
// left null for now.

import { getSpecies } from './species/index.js';
import defaultIntent from './intent.js';
import { resolveParams } from './paramPack.js';
import { makeRng } from './rng.js';
import { buildSkeleton } from './skeleton/buildSkeleton.js';
import { buildFoliage } from './foliage/buildFoliage.js';

export default class TreeModel {
    constructor({ speciesKey, commonName, seed, intent, profile, skeleton, leaves, metadata }) {
        this.speciesKey = speciesKey;
        this.commonName = commonName;
        this.seed = seed;
        this.intent = intent;
        this.profile = profile; // resolved species profile used (with overrides)
        this.skeleton = skeleton; // { nodes, paths, bounds }
        this.woodMesh = null; // future: Wood Surface Builder (geometry built by renderer)
        this.leaves = leaves; // Foliage Builder output
        this.metadata = metadata;
    }
}

// Deep-ish merge of profile overrides onto a base species profile.
function mergeProfile(base, p) {
    if (!p) return base;
    return {
        ...base,
        ...p,
        branchesPerNode: { ...base.branchesPerNode, ...(p.branchesPerNode || {}) },
    };
}

export function buildTreeModel(speciesKey, options = {}) {
    const { ageClass, seed, profile } = options;
    const species = mergeProfile(getSpecies(speciesKey), profile);

    const intent = { ...defaultIntent };
    if (ageClass !== undefined) intent.ageClass = ageClass;
    if (seed !== undefined) intent.seed = seed;

    const params = resolveParams(species, intent);
    const rng = makeRng(intent.seed);
    const skeleton = buildSkeleton(params, rng);
    const leaves = buildFoliage(skeleton, rng, {
        leafSize: species.leafSize,
        leavesPerNode: species.leavesPerNode,
    });

    const b = skeleton.bounds;
    const metadata = {
        nodeCount: skeleton.nodes.length,
        pathCount: skeleton.paths.length,
        leafCount: leaves.length,
        height: b.max[2] - b.min[2],
        spread: Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]),
        trunkDBH: params.trunkRadius * 2,
    };

    return new TreeModel({
        speciesKey,
        commonName: species.commonName,
        seed: intent.seed,
        intent,
        profile: species,
        skeleton,
        leaves,
        metadata,
    });
}
