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

export default class TreeModel {
    constructor({ speciesKey, commonName, seed, intent, skeleton, metadata }) {
        this.speciesKey = speciesKey;
        this.commonName = commonName;
        this.seed = seed;
        this.intent = intent;
        this.skeleton = skeleton; // { nodes, paths, bounds }
        this.woodMesh = null; // future: Wood Surface Builder
        this.leaves = null; // future: Foliage Builder
        this.metadata = metadata;
    }
}

export function buildTreeModel(speciesKey, overrides = {}) {
    const species = getSpecies(speciesKey);
    const intent = { ...defaultIntent, ...overrides };
    const params = resolveParams(species, intent);
    const rng = makeRng(intent.seed);
    const skeleton = buildSkeleton(params, rng);

    const b = skeleton.bounds;
    const metadata = {
        nodeCount: skeleton.nodes.length,
        pathCount: skeleton.paths.length,
        height: b.max[2] - b.min[2],
        spread: Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]),
        trunkDBH: params.trunkRadius * 2,
    };

    return new TreeModel({
        speciesKey,
        commonName: species.commonName,
        seed: intent.seed,
        intent,
        skeleton,
        metadata,
    });
}
