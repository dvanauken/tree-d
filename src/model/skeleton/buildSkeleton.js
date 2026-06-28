// buildSkeleton.js - Pipeline stage 4: grow the skeleton graph.
//
// Takes a deterministic parameter pack + seeded RNG and produces the node/path
// graph. This is where Live Oak morphology lives: a short trunk that divides
// low into heavy scaffold limbs, which spread wide at low elevation and sweep
// upward before arching back down, recursively branching into finer orders.
//
// Output: { nodes, paths, bounds } - pure data, no rendering concerns.

import SkeletonNode from './SkeletonNode.js';
import SkeletonPath from './SkeletonPath.js';
import {
    add, sub, scale, cross, len, normalize, rotateAxis, perp, lerp, deg,
} from '../vec3.js';

const ORDER = ['trunk', 'primary', 'secondary', 'tertiary', 'twig'];
const UP = [0, 0, 1];

export function buildSkeleton(P, rng) {
    const nodes = [];
    const paths = [];
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };

    function addNode(position, radius, orderIdx, role, parentId) {
        const id = nodes.length;
        const node = new SkeletonNode({
            id, parentId, position, radius,
            order: ORDER[orderIdx], role,
        });
        nodes.push(node);
        if (parentId != null) nodes[parentId].children.push(id);
        for (let k = 0; k < 3; k++) {
            if (position[k] < bounds.min[k]) bounds.min[k] = position[k];
            if (position[k] > bounds.max[k]) bounds.max[k] = position[k];
        }
        return node;
    }

    // --- Trunk: short, near-vertical, slight lean to the crown base ---------

    const trunkR = P.trunkRadius;
    let prev = addNode([0, 0, 0], trunkR, 0, 'trunk', null);
    const trunkIds = [prev.id];
    const leanAxis = normalize([rng.range(-1, 1), rng.range(-1, 1), 0]);

    for (let i = 1; i <= P.trunkSegments; i++) {
        const t = i / P.trunkSegments;
        const lean = P.trunkLean * Math.sin(t * Math.PI * 0.5);
        const pos = [leanAxis[0] * lean, leanAxis[1] * lean, P.trunkHeight * t];
        const r = lerp(trunkR, trunkR * P.trunkTopFactor, t);
        prev = addNode(pos, r, 0, 'trunk', prev.id);
        trunkIds.push(prev.id);
    }
    const trunkPath = new SkeletonPath({
        id: paths.length, parentPathId: null, nodeIds: trunkIds,
        order: 'trunk', role: 'trunk',
    });
    paths.push(trunkPath);

    const crown = prev; // trunk tip = crown base

    // --- Primary scaffold limbs off the crown base -------------------------

    const primaryCount = rng.spanInt(P.primaryLimbCount);
    const baseAz = rng.range(0, Math.PI * 2);
    for (let i = 0; i < primaryCount; i++) {
        const az = baseAz + (i / primaryCount) * Math.PI * 2
            + rng.range(-P.azJitter, P.azJitter);
        const el = deg(rng.span(P.primaryElevationDeg));
        const dir = normalize([
            Math.cos(el) * Math.cos(az),
            Math.cos(el) * Math.sin(az),
            Math.sin(el),
        ]);
        growBranch(
            crown, dir,
            P.primaryLength * rng.range(0.85, 1.0),
            P.primaryRadius, 1, trunkPath.id,
        );
    }

    // --- Recursive branch growth ------------------------------------------

    function growBranch(startNode, dir0, length, radius0, orderIdx, parentPathId) {
        const S = P.segments;
        const segLen = length / S;
        let dir = normalize(dir0);
        let node = startNode;
        const ids = [startNode.id];

        for (let i = 1; i <= S; i++) {
            const t = i / S;

            // Curvature: rise near the base, droop near the tip (Live Oak arch).
            const horiz = cross(dir, UP);
            if (len(horiz) > 1e-4) {
                const axis = normalize(horiz);
                const sweep = P.sweepUp * (1 - t);
                const sag = P.sag * t * (orderIdx <= 2 ? 1 : 0.5);
                dir = rotateAxis(dir, axis, sweep - sag);
            }

            // Random wander.
            dir = rotateAxis(dir, perp(dir), rng.range(-P.jitter, P.jitter));
            dir = normalize(dir);

            const pos = add(node.position, scale(dir, segLen));
            const r = Math.max(P.minRadius, lerp(radius0, radius0 * P.tipFactor, t));
            node = addNode(pos, r, orderIdx, 'branch', node.id);
            ids.push(node.id);
        }

        const path = new SkeletonPath({
            id: paths.length, parentPathId, nodeIds: ids,
            order: ORDER[orderIdx], role: 'branch',
        });
        paths.push(path);

        if (orderIdx < P.maxOrder) {
            const counts = P.childCounts[orderIdx];
            const n = rng.spanInt(counts);
            const tipDir = normalize(
                sub(node.position, nodes[ids[ids.length - 2]].position),
            );
            for (let j = 0; j < n; j++) {
                const div = deg(rng.span(P.divergenceDeg));
                const azc = (j / n) * Math.PI * 2 + rng.range(-P.azJitter, P.azJitter);
                const k = perp(tipDir);
                let cd = rotateAxis(tipDir, k, div); // tilt off parent by divergence
                cd = rotateAxis(cd, tipDir, azc); // spin around the parent direction
                const childRadius = Math.max(
                    P.minRadius,
                    Math.min(radius0 * P.radiusRatio, node.radius * P.forkFactor),
                );
                growBranch(
                    node, normalize(cd),
                    length * P.lengthRatio * rng.range(0.85, 1.05),
                    childRadius, orderIdx + 1, path.id,
                );
            }
        }
        return node;
    }

    return { nodes, paths, bounds };
}
