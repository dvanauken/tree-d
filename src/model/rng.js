// rng.js - Deterministic seeded pseudo-random generator.
//
// The same seed always produces the same tree. This is core to the pipeline:
// (species + intent + seed) must resolve to a reproducible parameter pack and
// skeleton. Uses mulberry32 - small, fast, good enough for procedural form.

export function makeRng(seed) {
    let s = (seed >>> 0) || 1;

    function next() {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
        next,
        // Uniform float in [a, b).
        range: (a, b) => a + (b - a) * next(),
        // Integer in [a, b] inclusive.
        int: (a, b) => Math.floor(a + (b - a + 1) * next()),
        // Pick a random element from an array.
        pick: (arr) => arr[Math.floor(next() * arr.length)],
        // Float drawn from a [min, max] tuple.
        span: (t) => t[0] + (t[1] - t[0]) * next(),
        // Integer drawn from a [min, max] tuple (inclusive).
        spanInt: (t) => Math.floor(t[0] + (t[1] - t[0] + 1) * next()),
    };
}
