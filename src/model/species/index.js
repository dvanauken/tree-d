// species/index.js - Species registry.
//
// Maps species keys to profiles. Live Oak is the first (and currently only)
// hero target; additional species are added here as they read correctly.

import liveOak from './liveOak.js';
import sycamore from './sycamore.js';
import crepeMyrtle from './crepeMyrtle.js';
import maple from './maple.js';
import shumardOak from './shumardOak.js';
import whiteBirch from './whiteBirch.js';
import palm from './palm.js';

// Insertion order drives the dropdown order; Live Oak is the hero target.
const REGISTRY = {
    liveOak,
    sycamore,
    crepeMyrtle,
    maple,
    shumardOak,
    whiteBirch,
    palm,
};

export function getSpecies(key) {
    return REGISTRY[key] || liveOak;
}

export function listSpecies() {
    return Object.entries(REGISTRY).map(([key, s]) => ({
        key,
        commonName: s.commonName,
    }));
}

export default REGISTRY;
