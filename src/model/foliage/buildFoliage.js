// buildFoliage.js - Pipeline stage 6: Foliage Builder (dome-shell canopy).
//
// Live oaks read as a dense evergreen DOME whose leaves live on the OUTER SHELL
// of the crown, while the heavy inner scaffold limbs stay bare and visible.
// Leafing only the actual twig tips proved too sparse - the crown stayed
// see-through - so instead:
//   1. Derive the crown centre + anisotropic radii from the skeleton bounds.
//   2. Sample cluster centres over that dome ellipsoid (upper surface plus a
//      drooping skirt), with lumpy radii so the canopy billows.
//   3. Pull each cluster toward the nearest real branch so foliage hangs on
//      the tree rather than floating on a perfect shell.
//   4. Grow a spray of leaf cards around each cluster centre, facing outward.
// (The skeleton still tags distal `shellAnchor` nodes and returns a `crown`
// summary in case twig-anchored placement is revisited; unused here.)
//
// Output: array of leaf records - pure data:
//   { position:[x,y,z], size, tint, rot:[rx,ry,rz], normal:[x,y,z], shell }
// `normal` is the outward canopy normal (used by the renderer to face leaves
// out and to drive backlit translucency). `position/size/tint/rot` preserve the
// original contract so older consumers keep working.

import { add, scale, cross, len, normalize, perp, clamp } from '../vec3.js';

const ORDER_RANK = { trunk: 0, primary: 1, secondary: 2, tertiary: 3, twig: 4 };
const UP = [0, 0, 1];

export function buildFoliage(skeleton, rng, opts = {}) {
    const leafSize = opts.leafSize ?? 1.05;     // feet (cluster card scale)
    const density = opts.leavesPerNode ?? 3;    // leaves per anchor (x cluster)
    const maxLeaves = opts.maxLeaves ?? 14000;

    // Finest order actually present (twigs for broadleaf).
    let finest = 0;
    for (const p of skeleton.paths) finest = Math.max(finest, ORDER_RANK[p.order] ?? 0);
    if (finest === 0) return []; // trunk only - nothing to leaf

    // --- Crown geometry: centre + radius from the foliated bounds -------------
    const b = skeleton.bounds;
    const crownLo = b.min[2] + (b.max[2] - b.min[2]) * 0.18; // skip lower trunk
    const center = [
        (b.min[0] + b.max[0]) * 0.5,
        (b.min[1] + b.max[1]) * 0.5,
        clamp((b.min[2] + b.max[2]) * 0.52, crownLo, b.max[2]),
    ];
    const CANOPY = 1.14;                                  // canopy extends past wood tips
    const rx = (b.max[0] - b.min[0]) * 0.5 * CANOPY || 1;
    const ry = (b.max[1] - b.min[1]) * 0.5 * CANOPY || 1;
    const rz = (b.max[2] - center[2]) * CANOPY || 1;     // dome reaches up over the limbs
    const rDown = (center[2] - b.min[2]) * 0.95 || 1;    // softer underside

    // Normalized distance of a point from the crown centre on the dome ellipsoid
    // (1 = on the shell, <1 = interior). Anisotropic so it tracks the dome.
    function shellDistance(p) {
        const dx = (p[0] - center[0]) / rx;
        const dy = (p[1] - center[1]) / ry;
        const dz0 = p[2] - center[2];
        const dz = dz0 >= 0 ? dz0 / rz : dz0 / rDown;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    function outwardNormal(p) {
        const dz0 = p[2] - center[2];
        const sz = dz0 >= 0 ? rz : rDown;
        const g = [
            (p[0] - center[0]) / (rx * rx),
            (p[1] - center[1]) / (ry * ry),
            dz0 / (sz * sz),
        ];
        if (len(g) < 1e-5) return [...UP];
        return normalize(g);
    }

    // --- Solid canopy: fill the crown DOME shell with leaf clusters ----------
    // A live oak reads as a SOLID billowing dome from outside - you do not see
    // through the crown. Leafing only the (sparse, U-shaped) twig tips leaves
    // the centre see-through. So we sample the dome ELLIPSOID SHELL directly and
    // grow lumpy leaf clusters over the whole upper surface (plus a drooping
    // skirt), closing the canopy into a full dome. The heavy inner limbs still
    // show beneath. Clusters are pulled toward the nearest real branch so the
    // foliage sits on the tree rather than floating in a perfect shell.
    const TAU = Math.PI * 2;
    const leaves = [];

    // Branch points the canopy can hang from (the finer orders + outer primaries).
    const branchPts = [];
    for (const path of skeleton.paths) {
        if ((ORDER_RANK[path.order] ?? 0) < 1) continue;
        const pts = path.spine && path.spine.positions;
        if (!pts) continue;
        for (let i = 1; i < pts.length; i++) branchPts.push(pts[i]);
    }
    const nearestBranch = (p) => {
        let best = null; let bd = Infinity;
        for (const q of branchPts) {
            const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bd) { bd = d; best = q; }
        }
        return { q: best, d: Math.sqrt(bd) };
    };

    const wantDense = (opts.crownDensity ?? 'dense') === 'dense';
    const nClusters = Math.round((wantDense ? 950 : 560) * rng.range(0.9, 1.1));
    const perCluster = Math.max(3, Math.round(density * (wantDense ? 4 : 2.5)));
    const reach = Math.max(rx, ry, rz);

    for (let c = 0; c < nClusters; c++) {
        // Sample a direction over the dome (upper sphere + a little skirt below).
        const theta = rng.range(0, TAU);
        const zc = rng.range(-0.30, 1.0);
        const rc = Math.sqrt(Math.max(0, 1 - zc * zc));
        const dir = [rc * Math.cos(theta), rc * Math.sin(theta), zc];

        // Lumpy radius so the canopy billows rather than being a smooth ellipsoid.
        const lump = 0.82 + 0.20 * rng.next();
        const szc = zc >= 0 ? rz : rDown;
        let cpos = [
            center[0] + dir[0] * rx * lump,
            center[1] + dir[1] * ry * lump,
            center[2] + zc * szc * lump,
        ];

        // Pull the cluster toward the nearest branch so foliage hangs on the tree
        // (mostly keep the shell position; nudge inboard toward real wood).
        const nb = nearestBranch(cpos);
        if (nb.q && nb.d > reach * 0.18) {
            cpos = add(scale(cpos, 0.7), scale(nb.q, 0.3));
        }

        const nOut = outwardNormal(cpos);
        const frame = shellFrame(nOut);
        const spread = leafSize * rng.range(1.7, 2.8);

        for (let k = 0; k < perCluster; k++) {
            const a = rng.range(0, TAU);
            const rr = Math.sqrt(rng.next()) * spread;
            const depth = scale(nOut, -rng.range(0, spread * 0.9)); // canopy thickness
            const pos = add(cpos, add(
                add(scale(frame.side, Math.cos(a) * rr), scale(frame.up, Math.sin(a) * rr)),
                depth,
            ));
            const droop = rng.range(-0.30, 0.5);
            leaves.push({
                position: pos,
                normal: outwardNormal(pos),
                shell: shellDistance(pos),
                size: leafSize * rng.range(0.7, 1.25),
                tint: rng.next(),
                rot: [rng.range(-0.5, 0.5) + droop, rng.range(-0.7, 0.7), rng.range(0, TAU)],
            });
        }
    }

    if (leaves.length > maxLeaves) {
        leaves.sort((a, c) => c.shell - a.shell);
        leaves.length = maxLeaves;
    }
    return leaves;
}

// A frame tangent to the dome shell, from the outward normal.
function shellFrame(nOut) {
    let side = cross(nOut, UP);
    if (len(side) < 1e-4) side = perp(nOut);
    side = normalize(side);
    return { side, up: normalize(cross(nOut, side)) };
}
