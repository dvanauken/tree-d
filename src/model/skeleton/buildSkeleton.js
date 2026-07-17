// buildSkeleton.js - Pipeline stage 4: grow the skeleton armature.
//
// For the HERO Live Oak (P.shape === 'hero') the active grower is
// buildSaneHero: a deliberately explicit loop that builds one order at a time -
// trunk -> primary scaffolds -> secondaries -> tertiaries -> twigs - with the
// Live Oak signature composed directly rather than emerging from simulation:
//
//   1. COMPOSED ASYMMETRY - the major limbs cluster on a favoured side of the
//      crown and reach further, so the tree has a definite "front" and a
//      dominant sweep instead of a radial starburst.
//   2. LOW TAKE-OFF, DIP AND RISE - primaries leave the short bole low, sag
//      through mid-span and lift toward the tips (per-branch sag/tipRise).
//   3. STRICT SIZE HIERARCHY - each order is markedly shorter and thinner than
//      its parent (held to account by src/model/analysis/architecture.js).
//   4. OUTER-SHELL TAGGING - distal tertiary/twig nodes are tagged
//      `shellAnchor` and summarised in `crown`. (The current foliage builder
//      dome-samples from bounds instead; the tags remain in case twig-anchored
//      foliage placement is revisited.)
//
// An earlier simulation-flavoured hero grower (apical dominance, pipe-model
// taper, mortality/pruning, leader continuation, tip fragmentation) was
// removed as unreachable; see git history at commit 986dc16 if those Phase-2
// mechanics are wanted back.
//
// The legacy grower (older species field shape) is preserved for non-hero
// species.
//
// Output contract: { nodes, paths, bounds } (+ `crown`, `mortality`,
// `character` for the hero). Each path carries an `order` tag plus
// architecture metadata (zone/limbLength/baseRadius/tipRadius/termination);
// each node carries a per-node radius; spines are attached via attachSpines.

import SkeletonNode from './SkeletonNode.js';
import SkeletonPath from './SkeletonPath.js';
import { attachSpines } from './buildSpines.js';
import {
    add, sub, scale, dot, cross, len, normalize, rotateAxis, perp, lerp, clamp, deg,
} from '../vec3.js';

const ORDER = ['trunk', 'primary', 'secondary', 'tertiary', 'twig'];
// Architectural ZONE per branch order, for instrumentation / Architecture View.
// trunk -> Trunk, primary -> Scaffold, secondary -> Structural, tertiary ->
// Framework, twig -> Fine; terminal fragment sprays are tagged 'Twig' directly.
const ZONE_BY_ORDER = ['Trunk', 'Scaffold', 'Structural', 'Framework', 'Fine'];
const UP = [0, 0, 1];
const TAU = Math.PI * 2;

export function buildSkeleton(P, rng) {
    if (P.shape === 'hero') return buildSaneHero(P, rng);
    return buildLegacy(P, rng);
}

// ============================================================================
// SANE HERO grower
// ============================================================================
function buildSaneHero(P, rng) {
    const nodes = [];
    const paths = [];
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };
    const shell = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 };
    const mortality = { attempted: 0, pruned: 0, died: 0 };

    const smooth = (t) => t * t * (3 - 2 * t);
    const rotate2 = (v, a) => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        return normalize([v[0] * c - v[1] * s, v[0] * s + v[1] * c, 0]);
    };
    const sideOf = (radial) => [-radial[1], radial[0], 0];

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

    function noteShell(position) {
        for (let k = 0; k < 3; k++) {
            if (position[k] < shell.min[k]) shell.min[k] = position[k];
            if (position[k] > shell.max[k]) shell.max[k] = position[k];
        }
        shell.count++;
    }

    function finishPath(path, length, baseRadius, tipRadius, termination) {
        path.zone = ZONE_BY_ORDER[ORDER.indexOf(path.order)] || 'Fine';
        path.limbLength = length;
        path.baseRadius = baseRadius;
        path.tipRadius = tipRadius;
        path.leaderDepth = 0;
        path.termination = termination;
        path.isLeaderCont = false;
        paths.push(path);
        return path;
    }

    const trunkR = P.trunkRadius;
    const divideR = trunkR * P.trunkTaper;
    const clearH = P.trunkHeight;
    const leanAxis = normalize([rng.range(-1, 1), rng.range(-1, 1), 0]);

    let prev = addNode([0, 0, 0], trunkR, 0, 'trunk', null);
    const trunkIds = [prev.id];
    const trunkSegs = Math.max(5, P.trunkSegments + 1);
    for (let i = 1; i <= trunkSegs; i++) {
        const t = i / trunkSegs;
        const lean = P.trunkLean * 0.65 * smooth(t);
        const wob = P.trunkFluting * 0.35 * Math.sin(t * Math.PI * 1.4) * (1 - t);
        const pos = [
            leanAxis[0] * lean - leanAxis[1] * wob,
            leanAxis[1] * lean + leanAxis[0] * wob,
            clearH * t,
        ];
        prev = addNode(pos, lerp(trunkR, divideR, t), 0, 'trunk', prev.id);
        trunkIds.push(prev.id);
    }

    const trunkPath = new SkeletonPath({
        id: paths.length, parentPathId: null, nodeIds: trunkIds,
        order: 'trunk', role: 'trunk',
    });
    finishPath(trunkPath, clearH, trunkR, divideR, 'open');

    const trunkNodeAt = (z) => {
        let best = nodes[trunkIds[0]];
        let bestD = Infinity;
        for (const id of trunkIds) {
            const n = nodes[id];
            const d = Math.abs(n.position[2] - z);
            if (d < bestD) { bestD = d; best = n; }
        }
        return best;
    };

    function branch({
        startNode, parentPathId, orderIdx, radial, length, radius0,
        segments, tipRise, sag, sideDrift, tipFactor, termination = 'max-order',
    }) {
        const side = sideOf(radial);
        const phase = rng.range(0, TAU);
        let node = startNode;
        const ids = [startNode.id];
        const minTip = orderIdx >= 4 ? P.minRadius : P.minRadius * 1.25;
        const maxZ = P.height * (orderIdx >= 4 ? 0.92 : orderIdx >= 3 ? 0.90 : 0.86);

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const s = smooth(t);
            const drift = sideDrift * Math.sin(phase + t * Math.PI * 1.7) * Math.sin(Math.PI * t);
            const z = startNode.position[2]
                + tipRise * s
                - sag * Math.sin(Math.PI * t) * (1 - 0.25 * t);
            const pos = add(
                add(startNode.position, scale(radial, length * t)),
                add(scale(side, drift), [0, 0, clamp(z, 0.08, maxZ) - startNode.position[2]]),
            );
            const taper = lerp(1, tipFactor, Math.pow(t, 1.18));
            const r = Math.max(minTip, radius0 * taper);
            node = addNode(pos, r, orderIdx, 'branch', node.id);
            ids.push(node.id);
        }

        const path = new SkeletonPath({
            id: paths.length, parentPathId, nodeIds: ids,
            order: ORDER[orderIdx], role: 'branch',
        });
        path.shell = orderIdx >= 3;
        finishPath(path, length, radius0, nodes[ids[ids.length - 1]].radius, termination);
        if (path.shell) {
            const start = Math.max(1, Math.floor(ids.length * 0.45));
            for (let i = start; i < ids.length; i++) {
                nodes[ids[i]].shellAnchor = true;
                noteShell(nodes[ids[i]].position);
            }
        }
        return { path, ids, radial };
    }

    function spawnTwigs(parent, parentRadial, count, lengthScale = 1) {
        const usable = parent.ids.slice(Math.max(1, Math.floor(parent.ids.length * 0.55)));
        for (let i = 0; i < count; i++) {
            const sid = usable[Math.min(usable.length - 1, Math.floor((i + rng.next()) / count * usable.length))];
            const start = nodes[sid];
            const spread = deg(rng.range(-48, 48));
            const radial = rotate2(parentRadial, spread);
            branch({
                startNode: start,
                parentPathId: parent.path.id,
                orderIdx: 4,
                radial,
                length: rng.range(1.7, 3.6) * lengthScale,
                radius0: Math.max(P.minRadius * 1.15, start.radius * rng.range(0.30, 0.42)),
                segments: 2,
                tipRise: rng.range(-0.1, 1.8),
                sag: rng.range(0.0, 0.45),
                sideDrift: rng.range(0.15, 0.55),
                tipFactor: 0.18,
            });
        }
    }

    const crownRadius = P.spread * 0.5;
    const reachScale = clamp(P.scaffoldLengthFraction / 0.52, 0.55, 1.55);
    const primaryCount = clamp(rng.spanInt(P.scaffoldCount), 4, 7);
    const baseAz = rng.range(0, TAU);
    const favoredAz = rng.range(0, TAU);          // the side of the crown that WINS
    const majorCount = clamp(rng.spanInt(P.dividesInto), 2, primaryCount);
    const primaries = [];

    for (let i = 0; i < primaryCount; i++) {
        const isMajor = i < majorCount;
        // COMPOSED ASYMMETRY (a Phase-1 composition choice, not random damage):
        // the hero limbs cluster on the FAVOURED side so one side of the crown
        // clearly dominates (~70/20/10); the support limbs fill the rest of the
        // arc. Favoured-side limbs also reach further, giving the tree a definite
        // "front" and a dominant sweep - the thing that reads as presence.
        let az;
        if (isMajor) {
            az = favoredAz + rng.range(-0.7, 0.7);
        } else {
            const slot = (i - majorCount) / Math.max(1, primaryCount - majorCount);
            az = baseAz + slot * TAU + rng.range(-0.25, 0.25);
        }
        const radial = [Math.cos(az), Math.sin(az), 0];
        const align = Math.cos(az - favoredAz);       // 1 = favoured, -1 = weak side
        const reachBias = lerp(0.68, 1.2, (align + 1) / 2);
        const startZ = lerp(clearH * 0.72, clearH * 1.02, (i + rng.range(0.15, 0.85)) / primaryCount);
        const start = trunkNodeAt(startZ);
        const length = crownRadius * reachScale * reachBias
            * (isMajor ? rng.range(0.95, 1.12) : rng.range(0.55, 0.82));
        const radius0 = Math.min(start.radius * 0.94, divideR * P.basalRadiusFraction * (isMajor ? rng.range(0.9, 1.05) : rng.range(0.5, 0.72)));
        const primary = branch({
            startNode: start,
            parentPathId: trunkPath.id,
            orderIdx: 1,
            radial,
            length,
            radius0,
            segments: 9,
            tipRise: rng.range(9.0, 18.0) + (isMajor ? 0 : 2.0),
            sag: rng.range(3.8, 7.2),
            sideDrift: length * rng.range(0.025, 0.055),
            tipFactor: isMajor ? 0.34 : 0.27,
            termination: 'hand-off',
        });
        primaries.push(primary);
    }

    for (const [pi, primary] of primaries.entries()) {
        const secondaryCount = rng.spanInt(P.branching[1].count);
        for (let j = 0; j < secondaryCount; j++) {
            const station = lerp(0.34, 0.78, (j + rng.range(0.25, 0.75)) / secondaryCount);
            const sid = primary.ids[Math.min(primary.ids.length - 1, Math.max(1, Math.round(station * (primary.ids.length - 1))))];
            const start = nodes[sid];
            const sideSign = ((pi + j) % 2 === 0) ? 1 : -1;
            const radial = rotate2(primary.radial, sideSign * deg(rng.range(34, 68)));
            const length = crownRadius * reachScale * rng.range(0.24, 0.42) * lerp(1.05, 0.72, station);
            const secondary = branch({
                startNode: start,
                parentPathId: primary.path.id,
                orderIdx: 2,
                radial,
                length,
                radius0: Math.max(P.minRadius * 2.0, start.radius * rng.range(0.38, 0.54)),
                segments: 5,
                tipRise: rng.range(7.0, 16.0),
                sag: rng.range(0.8, 2.6),
                sideDrift: length * rng.range(0.03, 0.07),
                tipFactor: 0.28,
                termination: 'hand-off',
            });

            const tertiaryCount = rng.spanInt(P.branching[2].count);
            for (let k = 0; k < tertiaryCount; k++) {
                const tstation = lerp(0.42, 0.86, (k + rng.range(0.25, 0.75)) / tertiaryCount);
                const tid = secondary.ids[Math.min(secondary.ids.length - 1, Math.max(1, Math.round(tstation * (secondary.ids.length - 1))))];
                const tstart = nodes[tid];
                const tradial = rotate2(secondary.radial, rng.range(-1, 1) * deg(rng.range(22, 48)));
                const tertiary = branch({
                    startNode: tstart,
                    parentPathId: secondary.path.id,
                    orderIdx: 3,
                    radial: tradial,
                    length: rng.range(5.5, 10.5),
                    radius0: Math.max(P.minRadius * 1.5, tstart.radius * rng.range(0.34, 0.50)),
                    segments: 3,
                    tipRise: rng.range(2.2, 7.0),
                    sag: rng.range(0.2, 0.9),
                    sideDrift: rng.range(0.3, 1.0),
                    tipFactor: 0.24,
                    termination: 'terminal',
                });
                spawnTwigs(tertiary, tradial, rng.spanInt(P.branching[3].count), 0.8);
            }

            spawnTwigs(secondary, secondary.radial, 1 + (rng.next() < 0.55 ? 1 : 0), 1.0);
        }
        spawnTwigs(primary, primary.radial, 2, 1.15);
    }

    attachSpines(paths, nodes);
    const crown = shell.count > 0
        ? { min: shell.min, max: shell.max, anchorCount: shell.count }
        : { min: bounds.min, max: bounds.max, anchorCount: 0 };

    return { nodes, paths, bounds, crown, mortality, character: P.characterAmount ?? 0 };
}

// ============================================================================
// LEGACY grower (older species field shape) - preserved unchanged in behaviour.
// ============================================================================
const L_PRIMARY_ATTACH = [0.26, 0.88];
const L_CHILD_ZONE = { 1: [0.22, 0.78], 2: [0.34, 0.84], 3: [0.50, 0.92] };
const L_CHILD_LENGTH_SCALE = { 1: 1.18, 2: 0.95, 3: 0.64 };
const L_CHILD_UP_BIAS = { 1: 0.02, 2: 0.08, 3: 0.15 };
const L_CHILD_UNDERSIDE_SCALE = { 1: 0.85, 2: 0.70, 3: 0.55 };
const L_ORDER_TIP_FACTOR = { 1: 0.42, 2: 0.32, 3: 0.20, 4: 0.10 };

function buildLegacy(P, rng) {
    const nodes = [];
    const paths = [];
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };

    function addNode(position, radius, orderIdx, role, parentId) {
        const id = nodes.length;
        const node = new SkeletonNode({
            id, parentId, position, radius, order: ORDER[orderIdx], role,
        });
        nodes.push(node);
        if (parentId != null) nodes[parentId].children.push(id);
        for (let k = 0; k < 3; k++) {
            if (position[k] < bounds.min[k]) bounds.min[k] = position[k];
            if (position[k] > bounds.max[k]) bounds.max[k] = position[k];
        }
        return node;
    }

    function shuffledRange(n) {
        const a = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng.range(0, i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function stratifiedT(i, n, range) {
        const [lo, hi] = range;
        return lo + ((i + rng.range(0.18, 0.82)) / n) * (hi - lo);
    }

    function slotAngle(slot, count) {
        const center = ((slot + 0.5) / count) * TAU;
        const jitter = Math.min(P.azJitter, (TAU / count) * 0.22);
        return center + rng.range(-jitter, jitter);
    }

    function localFrame(parentDir) {
        const t = normalize(parentDir);
        let up = sub(UP, scale(t, dot(UP, t)));
        if (len(up) < 1e-4) up = perp(t);
        else up = normalize(up);
        const side = normalize(cross(up, t));
        return { t, up, side };
    }

    function childDirection(parentDir, divergence, slot, count, parentOrderIdx) {
        const { t, up, side } = localFrame(parentDir);
        const az = slotAngle(slot, count);
        let radial = normalize(add(scale(side, Math.cos(az)), scale(up, Math.sin(az))));
        const underside = dot(radial, UP);
        if (underside < 0) {
            const downScale = L_CHILD_UNDERSIDE_SCALE[parentOrderIdx] ?? 0.5;
            radial = normalize(add(scale(radial, downScale), scale(up, 1 - downScale)));
        }
        let dir = normalize(add(scale(t, Math.cos(divergence)), scale(radial, Math.sin(divergence))));
        dir = normalize(add(dir, scale(UP, L_CHILD_UP_BIAS[parentOrderIdx] ?? 0.14)));
        return dir;
    }

    function childLength(parentLength, parentOrderIdx, spawnT) {
        const orderScale = L_CHILD_LENGTH_SCALE[parentOrderIdx] ?? 0.65;
        const positionScale = lerp(1.12, 0.72, spawnT);
        return parentLength * P.lengthRatio * orderScale * positionScale * rng.range(0.88, 1.08);
    }

    function tipFactor(orderIdx) {
        return L_ORDER_TIP_FACTOR[orderIdx] ?? P.tipFactor;
    }

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
        id: paths.length, parentPathId: null, nodeIds: trunkIds, order: 'trunk', role: 'trunk',
    });
    paths.push(trunkPath);

    const primaryCount = rng.spanInt(P.primaryLimbCount);
    const baseAz = rng.range(0, TAU);
    const azSlots = shuffledRange(primaryCount);

    for (let i = 0; i < primaryCount; i++) {
        const t = stratifiedT(i, primaryCount, L_PRIMARY_ATTACH);
        const trunkIdx = Math.min(Math.floor(t * trunkIds.length), trunkIds.length - 1);
        const spawnNode = nodes[trunkIds[trunkIdx]];
        const az = baseAz + slotAngle(azSlots[i], primaryCount);
        const el = deg(rng.span(P.primaryElevationDeg));
        const dir = normalize([
            Math.cos(el) * Math.cos(az),
            Math.cos(el) * Math.sin(az),
            Math.sin(el),
        ]);
        growBranch(spawnNode, dir, P.primaryLength * rng.range(1.15, 1.35), P.primaryRadius, 1, trunkPath.id);
    }

    function growBranch(startNode, dir0, length, radius0, orderIdx, parentPathId) {
        const S = P.segments;
        const segLen = length / S;
        let dir = [...normalize(dir0)];
        let node = startNode;
        const ids = [startNode.id];
        const dirs = [[...dir]];

        for (let i = 1; i <= S; i++) {
            const t = i / S;
            const horiz = cross(dir, UP);
            if (len(horiz) > 1e-4) {
                const axis = normalize(horiz);
                const sweep = P.sweepUp * (1 - t);
                const sag = P.sag * t * (orderIdx <= 2 ? 1 : 0.5);
                dir = rotateAxis(dir, axis, sweep - sag);
            }
            const wanderAxis = rotateAxis(perp(dir), dir, rng.range(0, TAU));
            dir = normalize(rotateAxis(dir, wanderAxis, rng.range(-P.jitter, P.jitter)));
            const pos = add(node.position, scale(dir, segLen));
            const r = Math.max(P.minRadius, lerp(radius0, radius0 * tipFactor(orderIdx), t));
            node = addNode(pos, r, orderIdx, 'branch', node.id);
            ids.push(node.id);
            dirs.push([...dir]);
        }

        const path = new SkeletonPath({
            id: paths.length, parentPathId, nodeIds: ids, order: ORDER[orderIdx], role: 'branch',
        });
        paths.push(path);

        if (orderIdx < P.maxOrder) {
            const n = rng.spanInt(P.childCounts[orderIdx]);
            if (n === 0) return node;
            const zone = L_CHILD_ZONE[orderIdx] ?? [0.30, 0.88];
            const childAzSlots = shuffledRange(n);
            for (let j = 0; j < n; j++) {
                const t = stratifiedT(j, n, zone);
                const segIdx = Math.min(Math.floor(t * S), S - 1);
                const spawnNode = nodes[ids[segIdx + 1]];
                const branchDir = dirs[segIdx + 1];
                const div = deg(rng.span(P.divergenceDeg));
                const cd = childDirection(branchDir, div, childAzSlots[j], n, orderIdx);
                const childRadius = Math.max(
                    P.minRadius,
                    Math.min(radius0 * P.radiusRatio, spawnNode.radius * P.forkFactor),
                );
                growBranch(spawnNode, cd, childLength(length, orderIdx, t), childRadius, orderIdx + 1, path.id);
            }
        }
        return node;
    }

    attachSpines(paths, nodes);
    return { nodes, paths, bounds };
}
