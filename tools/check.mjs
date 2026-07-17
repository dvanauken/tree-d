// check.mjs - Pass/fail gate for the hero Live Oak. Exit 1 on any failure.
//
// Usage:  node tools/check.mjs
//
// Checks, per seed 1..25:
//   1. Architecture invariants: metadata.architecture.firstViolated must be
//      null (see src/model/analysis/architecture.js for the invariant list).
//   2. Dimension fidelity: metadata.height/spread within +/-15% of the
//      declared hero.height / hero.spread.
//
// ENFORCE_DIMENSIONS is false for M1 (record-only, so the baseline lands
// before the grower is tuned); flip to true in M2 when the shape params are
// adopted and the constants are tuned against it.

import { buildTreeModel } from '../src/model/TreeModel.js';
import { getSpecies } from '../src/model/species/index.js';
import { formatArchitecture } from '../src/model/analysis/architecture.js';

const HERO_KEY = 'liveOak';
const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);
const DIM_TOLERANCE = 0.15;
const ENFORCE_DIMENSIONS = false; // M1: record-only. Enforce from M2 on.

const species = getSpecies(HERO_KEY);
const wantH = species.hero.height;
const wantS = species.hero.spread;

let failures = 0;
let worst = { h: 0, hSeed: null, s: 0, sSeed: null };

for (const seed of SEEDS) {
    const m = buildTreeModel(HERO_KEY, { seed });
    const arch = m.metadata.architecture;

    if (arch.firstViolated) {
        failures++;
        console.error(`FAIL seed=${seed} invariant: ${arch.firstViolated.name} -> ${arch.firstViolated.detail}`);
        console.error(formatArchitecture(arch));
    }

    const dh = Math.abs(m.metadata.height - wantH) / wantH;
    const ds = Math.abs(m.metadata.spread - wantS) / wantS;
    if (dh > worst.h) { worst.h = dh; worst.hSeed = seed; }
    if (ds > worst.s) { worst.s = ds; worst.sSeed = seed; }
    if (ENFORCE_DIMENSIONS && (dh > DIM_TOLERANCE || ds > DIM_TOLERANCE)) {
        failures++;
        console.error(`FAIL seed=${seed} dimensions: height ${m.metadata.height.toFixed(1)} (want ~${wantH}), `
            + `spread ${m.metadata.spread.toFixed(1)} (want ~${wantS})`);
    }
}

console.log(`invariants: ${SEEDS.length - failures >= 0 ? '' : ''}${failures === 0 ? 'all pass' : failures + ' failure(s)'} across ${SEEDS.length} seeds`);
console.log(`dimensions${ENFORCE_DIMENSIONS ? '' : ' (record-only)'}: worst height dev ${(worst.h * 100).toFixed(1)}% (seed ${worst.hSeed}), `
    + `worst spread dev ${(worst.s * 100).toFixed(1)}% (seed ${worst.sSeed}), tolerance ${DIM_TOLERANCE * 100}%`);

if (failures > 0) {
    console.error(`\nCHECK FAILED (${failures})`);
    process.exit(1);
}
console.log('CHECK PASSED');
