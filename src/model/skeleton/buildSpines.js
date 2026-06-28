// buildSpines.js - Model-owned curve spines for skeleton paths.
//
// Skeleton nodes remain the editable control graph. Spines are deterministic
// cubic Hermite samples derived from those controls so renderers and future
// exporters consume the same branch curves instead of inventing their own.

import { add, sub, scale, len } from '../vec3.js';

const CURVE_TENSION = 0.75; // lower than Catmull-Rom to avoid fork overshoot
const SAMPLE_STEPS = {
    trunk: 4,
    primary: 4,
    secondary: 3,
    tertiary: 3,
    twig: 2,
};

export function attachSpines(paths, nodes) {
    for (const path of paths) {
        path.spine = buildPathSpine(path, nodes);
    }
}

export function buildPathSpine(path, nodes) {
    const controlPositions = path.nodeIds.map((id) => nodes[id].position);
    const controlRadii = path.nodeIds.map((id) => nodes[id].radius);
    const sampleStepPerSegment = SAMPLE_STEPS[path.order] ?? 3;
    const { positions, radii } = sampleHermite(
        controlPositions,
        controlRadii,
        sampleStepPerSegment,
    );
    const distances = cumulativeDistances(positions);

    return {
        type: 'cubic-hermite',
        tension: CURVE_TENSION,
        controlNodeIds: [...path.nodeIds],
        sampleStepPerSegment,
        positions,
        radii,
        distances,
        length: distances[distances.length - 1] || 0,
    };
}

function sampleHermite(rawPts, rawRadii, steps) {
    if (rawPts.length < 3) {
        return { positions: rawPts, radii: rawRadii };
    }

    const positions = [];
    const radii = [];

    for (let i = 0; i < rawPts.length - 1; i++) {
        const p0 = rawPts[i];
        const p1 = rawPts[i + 1];
        const m0 = tangent(rawPts, i);
        const m1 = tangent(rawPts, i + 1);
        const start = i === 0 ? 0 : 1;

        for (let s = start; s <= steps; s++) {
            const t = s / steps;
            positions.push(hermite(p0, p1, m0, m1, t));
            radii.push(smoothRadius(rawRadii[i], rawRadii[i + 1], t));
        }
    }

    return { positions, radii };
}

function tangent(pts, i) {
    if (i === 0) return scale(sub(pts[1], pts[0]), CURVE_TENSION);
    if (i === pts.length - 1) return scale(sub(pts[i], pts[i - 1]), CURVE_TENSION);
    return scale(sub(pts[i + 1], pts[i - 1]), 0.5 * CURVE_TENSION);
}

function hermite(p0, p1, m0, m1, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return add(
        add(scale(p0, h00), scale(m0, h10)),
        add(scale(p1, h01), scale(m1, h11)),
    );
}

function smoothRadius(a, b, t) {
    const s = t * t * (3 - 2 * t);
    return a + (b - a) * s;
}

function cumulativeDistances(pts) {
    const distances = [0];
    for (let i = 1; i < pts.length; i++) {
        distances[i] = distances[i - 1] + len(sub(pts[i], pts[i - 1]));
    }
    return distances;
}
