// digest.mjs - Print deterministic model digests for the reference builds.
//
// Usage:  node tools/digest.mjs
//
// One line per reference build: the hero Live Oak at its reference seeds plus
// every legacy species at seed 1. Run twice - output must be identical
// (determinism). Digests are EXPECTED to change when a grower milestone lands;
// refresh the tables in docs/baseline-live-oak.txt at milestone end and
// explain the change in the commit message. An unexplained digest change is a
// regression.

import { buildTreeModel } from '../src/model/TreeModel.js';
import { listSpecies } from '../src/model/species/index.js';
import { digest } from './treeDigest.mjs';

export const HERO_KEY = 'liveOak';
export const HERO_SEEDS = [1, 42, 12345];

for (const seed of HERO_SEEDS) {
    const m = buildTreeModel(HERO_KEY, { seed });
    console.log(`hero ${HERO_KEY} seed=${seed} ${JSON.stringify(digest(m))}`);
}

for (const { key } of listSpecies()) {
    if (key === HERO_KEY) continue;
    const m = buildTreeModel(key, { seed: 1 });
    console.log(`legacy ${key} seed=1 ${JSON.stringify(digest(m))}`);
}
