// buildSkeleton.js - Pipeline stage 4: grow the skeleton armature.
//
// For the HERO Live Oak this is the spectacle: the bare-limb structure itself.
// The grower implements the structural truths of Quercus virginiana:
//
//   1. APICAL DOMINANCE  - every limb continues a dominant, comparatively
//      straight LEADER that inherits most of the radius/length; lateral
//      children are markedly thinner and shorter. Not democratic equal forks.
//   2. MASSIVE SLOW-TAPER LIMBS - scaffolds leave the trunk at a large fraction
//      of trunk radius and retain radius slowly, so a mid-limb is still a
//      believable fraction of trunk thickness.
//   3. DIP-AND-RISE + SINUOSITY - primaries take off low, sweep out and DOWN,
//      then arch back UP, with low-frequency sinuous wander. The signature line.
//   4. CROSS-OVER - azimuths are perturbed, not an even fan; limbs may cross.
//   5. PER-ORDER CHARACTER - secondary/tertiary/twig differ in count,
//      divergence, length, radius and straightness.
//   6. OUTER-SHELL FOLIAGE ANCHORS - distal twigs are tagged `shell:true` and a
//      crown summary is returned so the foliage builder can leaf only the outer
//      surface, leaving the heavy inner armature bare and visible.
//
// The legacy grower (older field shape) is preserved for non-hero species.
//
// Output contract (unchanged): { nodes, paths, bounds } (+ additive `crown` for
// the hero). Each path carries an `order` tag (trunk/primary/secondary/tertiary/
// twig); each node carries a per-node radius; spines are attached via
// attachSpines.

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
// HERO grower
// ============================================================================
function buildHero(P, rng) {
    const nodes = [];
    const paths = [];
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };
    // Crown shell accumulator: the outer-most leafing anchors.
    const shell = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 };
    // Mortality ledger: would-be branches lost to competition (pruning) + limbs
    // that broke/shaded out (death). Surfaced in the architecture report.
    const mort = { attempted: 0, pruned: 0, died: 0 };

    function addNode(position, radius, orderIdx, role, parentId, extra) {
        const id = nodes.length;
        const node = new SkeletonNode({
            id, parentId, position, radius,
            order: ORDER[orderIdx], role,
        });
        if (extra) Object.assign(node, extra);
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

    function localFrame(parentDir) {
        const t = normalize(parentDir);
        let up = sub(UP, scale(t, dot(UP, t)));
        if (len(up) < 1e-4) up = perp(t);
        else up = normalize(up);
        const side = normalize(cross(up, t));
        return { t, up, side };
    }

    // ------------------------------------------------------------------------
    // TRUNK: short clear bole, gentle lean + flare, dividing into heavy leaders.
    // 4ft DBH hero -> trunkRadius 2.0 ft. taper 0.88 -> ~1.76 ft at the divide.
    // ------------------------------------------------------------------------
    const trunkR = P.trunkRadius;
    const divideR = trunkR * P.trunkTaper;
    const leanAxis = normalize([rng.range(-1, 1), rng.range(-1, 1), 0]);
    const TS = P.trunkSegments;

    const clearH = P.trunkHeight;                        // clear bole height
    // SHORT leader: a Live Oak transitions trunk->crown LOW; the scaffolds, not
    // the leader, own the crown. Keep the central axis just above the divide.
    const leaderTop = clearH + Math.max(4, (P.height - clearH) * 0.22);
    let prev = addNode([0, 0, 0], trunkR, 0, 'trunk', null);
    const trunkIds = [prev.id];
    // Clear bole 0..clearH at full radius (tapering to divideR).
    for (let i = 1; i <= TS; i++) {
        const t = i / TS;
        const lean = P.trunkLean * Math.sin(t * Math.PI * 0.5);
        const wob = P.trunkFluting * 0.6 * Math.sin(t * Math.PI * 1.3) * (1 - t);
        const pos = [
            leanAxis[0] * lean + (-leanAxis[1]) * wob,
            leanAxis[1] * lean + (leanAxis[0]) * wob,
            clearH * t,
        ];
        prev = addNode(pos, lerp(trunkR, divideR, t), 0, 'trunk', prev.id);
        trunkIds.push(prev.id);
    }
    // Central LEADER continuation clearH..leaderTop: tapers hard, leans and
    // wanders. It fills the crown CENTRE and gives primary limbs varied heights
    // to spawn from - which is what stops the structure being a radial fan/bowl.
    const LS = 6;
    const leadLean = normalize([rng.range(-1, 1), rng.range(-1, 1), 0]);
    for (let j = 1; j <= LS; j++) {
        const t = j / LS;
        const pPos = nodes[trunkIds[trunkIds.length - 1]].position;
        // Gentle sway only - the Gold Tree leader is upright and balanced, not a
        // hard lean. (Phase-2 character can add a stronger directional lean.)
        const sway = (leaderTop - clearH) * 0.05 * Math.sin(t * Math.PI);
        const pos = [
            pPos[0] + leadLean[0] * sway + rng.range(-0.18, 0.18),
            pPos[1] + leadLean[1] * sway + rng.range(-0.18, 0.18),
            lerp(clearH, leaderTop, t),
        ];
        // Taper to a FINE point (curved) so the leader dissolves into the crown
        // instead of ending in a fat sawn-off stub.
        prev = addNode(pos, lerp(divideR, P.minRadius * 2, Math.pow(t, 1.4)), 0, 'trunk', prev.id);
        trunkIds.push(prev.id);
    }
    const trunkPath = new SkeletonPath({
        id: paths.length, parentPathId: null, nodeIds: trunkIds,
        order: 'trunk', role: 'trunk',
    });
    trunkPath.zone = 'Trunk';
    trunkPath.termination = 'open';
    trunkPath.leaderDepth = 0;
    paths.push(trunkPath);

    // ------------------------------------------------------------------------
    // PRIMARY SCAFFOLD LIMBS
    //
    // The bole divides into a FEW heavy leaders (dividesInto), and additional
    // scaffolds erupt just below the divide. Each scaffold base radius is
    // basalRadiusFraction * divideR -> for the hero ~0.75 * 1.76 = 1.32 ft
    // (a 2.6 ft thick limb leaving a 4 ft trunk). taperRetention keeps it
    // massive far out along the limb (see growLimb).
    // ------------------------------------------------------------------------
    const scaffoldCount = clamp(rng.spanInt(P.scaffoldCount), rng.spanInt(P.dividesInto), 9);
    const baseAz = rng.range(0, TAU);

    // Reach of a primary limb. The finished crown radius is NOT just the
    // primary length: the leader continuation plus each order's outward laterals
    // keep pushing tips outward, so a primary of length L yields a crown radius
    // of roughly REACH_ACCUM x L. We size the primary so the FOLIATED dome
    // closes at the declared crown radius (spread/2) instead of overshooting,
    // while scaffold.lengthFraction still governs the share a primary itself
    // contributes vs. the finer outward growth. REACH_ACCUM is tuned JOINTLY
    // with the dome-arch RISE_GAIN below so the hero lands at ~100 ft spread /
    // ~50 ft height together.
    const REACH_ACCUM = 2.3;   // long limbs: big HORIZONTAL reach (spread >> height)
    const crownRadius = P.spread * 0.5;
    const baseLimbLen = (crownRadius / REACH_ACCUM) * (P.scaffoldLengthFraction / 0.55);

    const zOf = (id) => nodes[id].position[2];
    const nearestTrunkNode = (z) => {
        let best = trunkIds[0]; let bd = Infinity;
        for (const id of trunkIds) {
            const d = Math.abs(zOf(id) - z);
            if (d < bd) { bd = d; best = id; }
        }
        return nodes[best];
    };

    // DIRECTIONAL BIAS: real crowns are not radially even - light, wind and
    // competition make one side grow stronger and a quadrant stay sparse.
    const favoredAz = rng.range(0, TAU);
    // Phase-2 crown lean: 0 at character 0 (the balanced Gold Tree).
    const dirBias = rng.range(0.18, 0.42) * (P.dirBiasAmount ?? 1);

    for (let i = 0; i < scaffoldCount; i++) {
        // Stratified spawn HEIGHT along the bole + leader: heavy limbs low near
        // the divide, finer limbs higher up. Spawning at VARIED heights (not one
        // point) is what makes it branch like a tree instead of a radial fan.
        const hf = (i + rng.range(0.15, 0.85)) / scaffoldCount;
        const anchor = nearestTrunkNode(lerp(clearH * 0.8, leaderTop * 0.9, hf));

        const slotCenter = (i / scaffoldCount) * TAU;
        const azNoise = P.crossOver ? rng.range(-1, 1) * (TAU / scaffoldCount) * 0.9 : 0;
        let az = baseAz + slotCenter + azNoise;

        // Pull azimuth toward the favoured side; drop some limbs on the weak side
        // so the crown leans and a quadrant reads sparse (not a tidy starburst).
        const align = Math.cos(az - favoredAz);            // -1 (weak) .. 1 (favoured)
        az += dirBias * 0.5 * Math.sin(favoredAz - az);
        mort.attempted++;
        if (align < -0.55 && rng.next() < dirBias * 0.6) { mort.pruned++; continue; }

        const takeoff = deg(rng.span(P.takeoffAngleDeg));
        const radial = [Math.cos(az), Math.sin(az), 0];
        const dir = normalize(add(scale(radial, Math.cos(takeoff)), scale(UP, Math.sin(takeoff))));

        // HERO scaffolds (the dividesInto leaders) are the STARS: monumental,
        // long, low, thick - they own the crown. The rest are clearly
        // subordinate support. This "few unforgettable limbs" hierarchy is what
        // reads as presence rather than a democratic bush.
        const heightTaper = lerp(1.0, 0.62, hf);
        const isLeader = i < rng.spanInt(P.dividesInto);
        const baseR = Math.min(
            anchor.radius * 0.98,
            divideR * P.basalRadiusFraction * heightTaper * (isLeader ? 1.0 : rng.range(0.5, 0.74)),
        );
        const limbLen = baseLimbLen * heightTaper
            * (isLeader ? rng.range(1.35, 1.75) : rng.range(0.55, 0.85))
            * lerp(0.85, 1.25, (align + 1) / 2);

        growLimb({
            startNode: anchor,
            dir0: dir,
            radial,
            length: limbLen,
            radius0: Math.max(P.minRadius, baseR),
            orderIdx: 1,
            parentPathId: trunkPath.id,
            primary: true,
        });
    }

    // CROWN APEX: the central leader dissolves into a small tuft of upper-crown
    // limbs rather than ending in a stub (fixes the "sawn-off trunk" look).
    const apex = nodes[trunkIds[trunkIds.length - 1]];
    const apexN = 3 + rng.spanInt([0, 1]);
    const apexAz0 = rng.range(0, TAU);
    for (let i = 0; i < apexN; i++) {
        const az = apexAz0 + (i / apexN) * TAU + rng.range(-0.4, 0.4);
        const el = deg(rng.range(38, 64));
        const rad = [Math.cos(az), Math.sin(az), 0];
        const dir = normalize(add(scale(rad, Math.cos(el)), scale(UP, Math.sin(el))));
        growLimb({
            startNode: apex, dir0: dir, radial: rad,
            length: baseLimbLen * 0.5 * rng.range(0.8, 1.1),
            radius0: Math.max(P.minRadius, apex.radius * 0.9),
            orderIdx: 2, parentPathId: trunkPath.id, primary: false,
        });
    }

    // ROOT FLARE: a few buttress roots spread from the foot and dive to the
    // soil, so the flare continues into root structure instead of stopping flat.
    const foot = nodes[trunkIds[0]];
    const rootN = 5 + rng.spanInt([0, 1]);
    const rootAz0 = rng.range(0, TAU);
    for (let i = 0; i < rootN; i++) {
        const az = rootAz0 + (i / rootN) * TAU + rng.range(-0.35, 0.35);
        let rdir = normalize([Math.cos(az), Math.sin(az), 0.12]); // out, slight shoulder
        let nd = foot;
        const rids = [foot.id];
        const rsegs = 3;
        const rlen = trunkR * rng.range(2.4, 3.6);
        for (let s = 1; s <= rsegs; s++) {
            const tt = s / rsegs;
            rdir = normalize(add(rdir, [0, 0, -0.5])); // arch down into the ground
            const pos = add(nd.position, scale(rdir, rlen / rsegs));
            pos[2] = Math.min(pos[2], 0.4 - tt * 0.8); // shoulder near base, dive to soil
            const r = trunkR * Math.max(0.12, (1 - tt) * 0.85) * rng.range(0.7, 0.95);
            nd = addNode(pos, Math.max(P.minRadius, r), 0, 'trunk', nd.id);
            rids.push(nd.id);
        }
        const rp = new SkeletonPath({
            id: paths.length, parentPathId: trunkPath.id, nodeIds: rids, order: 'trunk', role: 'root',
        });
        rp.zone = 'Trunk';
        rp.termination = 'root';
        rp.leaderDepth = 0;
        paths.push(rp);
    }

    // ------------------------------------------------------------------------
    // LIMB GROWTH with apical dominance.
    //
    // A limb is grown as a sequence of segments. At chosen stations along it we
    // spawn LATERAL children (markedly thinner/shorter). The limb itself then
    // CONTINUES as the dominant leader, inheriting leaderRadiusShare /
    // leaderLengthShare and staying comparatively straight. The leader is one
    // recursive call so it reads as a single continuous member, not a fork.
    // ------------------------------------------------------------------------
    function growLimb(cfg) {
        const {
            startNode, dir0, radial, length, radius0, orderIdx, parentPathId, primary,
            leaderDepth = 0, isLeaderCont = false,
        } = cfg;

        const childRule = P.branching[orderIdx]; // how THIS limb spawns its laterals
        const straightness = orderIdx === 1
            ? 1 - P.sinuosity                 // primaries are the sinuous signature
            : (childRule ? childRule.straightness : 0.5);

        // Segment count: heavier orders get more segments for a smooth arch.
        const S = orderIdx === 1 ? 9 : orderIdx === 2 ? 6 : orderIdx === 3 ? 4 : 3;
        const segLen = length / S;
        let dir = [...normalize(dir0)];
        let node = startNode;
        const ids = [startNode.id];
        const dirs = [[...dir]];

        // A stable bending plane (out-and-up) for the dip-and-rise sweep.
        const planeAxis = normalize(cross(dir, UP));
        const usePlane = len(planeAxis) > 1e-4;
        // Sinuous wander uses a smooth low-frequency sine, phase-randomised.
        const sinPhase = rng.range(0, TAU);
        const sinFreq = rng.range(1.2, 2.0);
        const sinAmp = (1 - straightness) * (orderIdx === 1 ? 0.10 : 0.07);
        // Smoothstep + the limb's starting elevation, for the absolute dip-and-
        // rise profile below (we drive the tangent's elevation directly).
        const sstep = (x) => x * x * (3 - 2 * x);
        const elev0 = Math.asin(clamp(dir[2], -1, 1));
        // Per-limb variation in the swoop so limbs aren't identical arcs.
        const dipScale = primary ? rng.range(0.45, 1.35) : 1;
        // Scaffolds leave low and reach OUT (the spread), dipping then lifting
        // gently at the ends - heavy arching limbs, not a flat drooping fan.
        const limbTarget = primary ? rng.range(-0.04, 0.24) : 0;
        const retainK = orderIdx === 1 ? 1.6 : 2.2;

        // PLAN LATERAL CHILDREN up front so the pipe-model taper can step the
        // radius down abruptly at each fork. PRUNING: a large share of would-be
        // branches are lost to shade / competition, so drop them outright. Their
        // spacing is deliberately uneven (not metronomic).
        const plannedLats = [];
        if (orderIdx < P.maxOrder && childRule) {
            const n = rng.spanInt(childRule.count);
            for (let j = 0; j < n; j++) {
                mort.attempted++;
                if (rng.next() < P.pruneFrac) { mort.pruned++; continue; } // lost to shade / competition
                const frac = (j + rng.range(0.05, 0.95)) / n;
                const station = lerp(0.28, 0.95, frac);
                const segIdx = clamp(Math.round(station * S), 1, S);
                const rEst = radius0 * Math.pow(P.taperRetention, (segIdx / S) * retainK);
                const lateralR = Math.max(
                    P.minRadius,
                    rEst * childRule.radiusRatio * (1 - P.dominanceStrength * 0.25) * rng.range(0.72, 1.0),
                );
                plannedLats.push({ j, n, station, segIdx, lateralR });
            }
        }
        const dropAt = [];
        for (const L of plannedLats) dropAt[L.segIdx] = (dropAt[L.segIdx] || 0) + L.lateralR * L.lateralR;

        let removed = 0; // running cross-section carried off by laterals (pipe model)
        for (let i = 1; i <= S; i++) {
            const t = i / S;

            if (usePlane) {
                let bend;
                if (primary) {
                    // Each primary arcs smoothly from its low take-off to a
                    // per-limb TARGET elevation. Targets vary widely, so the tips
                    // distribute over a DOME surface (low->wide edge, high->crown
                    // centre) instead of all tracing one shell (which reads as a
                    // pancake, goblet, or vase). A gentle basal dip near the base
                    // adds the live-oak swoop.
                    const dip = -0.16 * dipScale;
                    const base = t < 0.25
                        ? lerp(elev0, elev0 + dip, sstep(t / 0.25))
                        : lerp(elev0 + dip, limbTarget, sstep((t - 0.25) / 0.75));
                    bend = base - Math.asin(clamp(dir[2], -1, 1));
                } else {
                    // Higher orders reach UP strongly into the light to FILL the
                    // dome VOLUME with vertical depth (the primaries form a low
                    // spreading layer; the secondaries/tertiaries/twigs must
                    // climb above them to build a thick rounded crown, not a flat
                    // disc), with only the straightest members sagging slightly.
                    const UP_ARCH = 0.19;   // framework climbs to billow a dome ON TOP of the wide scaffolds
                    bend = (UP_ARCH - 0.18 * (1 - straightness)) * (Math.PI / S);
                }
                dir = rotateAxis(dir, planeAxis, bend);
            }

            // SINUOSITY: smooth low-frequency lateral wander in the limb plane.
            if (sinAmp > 0 && usePlane) {
                const sway = Math.sin(sinPhase + t * Math.PI * sinFreq) * sinAmp / S;
                const swayAxis = normalize(add(scale(UP, 0.3), planeAxis));
                dir = normalize(rotateAxis(dir, swayAxis, sway));
            }

            // Tiny high-frequency jitter; twigs get the most (jagged fine ends).
            const jit = (orderIdx >= 3 ? 0.05 : 0.02) * (1 - straightness * 0.5);
            if (jit > 0) {
                const jAxis = rotateAxis(perp(dir), dir, rng.range(0, TAU));
                dir = normalize(rotateAxis(dir, jAxis, rng.range(-jit, jit)));
            }

            const pos = add(node.position, scale(dir, segLen));

            // PIPE-MODEL (da Vinci) taper: a gentle base loss along the limb plus
            // an ABRUPT step-down at each fork as the lateral carries off its
            // cross-section. Nature's taper is violent at junctions, not smooth.
            if (dropAt[i]) removed += dropAt[i] * 0.8;
            const baseR = radius0 * Math.pow(P.taperRetention, t * retainK);
            const r = Math.max(
                P.minRadius,
                Math.sqrt(Math.max(P.minRadius * P.minRadius, baseR * baseR - removed)),
            );
            node = addNode(pos, r, orderIdx, 'branch', node.id);
            ids.push(node.id);
            dirs.push([...dir]);
        }

        const path = new SkeletonPath({
            id: paths.length, parentPathId, nodeIds: ids,
            order: ORDER[orderIdx], role: 'branch',
        });
        // --- ARCHITECTURE INSTRUMENTATION (metadata only; no geometry change) --
        path.zone = ZONE_BY_ORDER[orderIdx] || 'Fine';
        path.isLeaderCont = isLeaderCont;     // a leader continuation vs a fresh lateral
        path.leaderDepth = leaderDepth;       // links since the last lateral (snake length)
        path.limbLength = length;             // intended limb length
        path.baseRadius = radius0;
        path.tipRadius = node.radius;
        path.termination = 'open';            // set below when the leader decision is made
        paths.push(path);

        const tipNode = node;
        const tipDir = dir;
        const tipR = tipNode.radius;

        // --- SPAWN the planned (already-pruned) lateral children ------------
        for (const L of plannedLats) {
            const spawnNode = nodes[ids[L.segIdx]];
            const branchDir = dirs[L.segIdx];
            const div = deg(rng.span(childRule.divergenceDeg));
            const cd = childDirection(branchDir, radial, div, L.j, L.n, orderIdx);
            const lateralLen = length * childRule.lengthRatio * (1 - L.station * 0.25)
                * rng.range(0.8, 1.1);
            growLimb({
                startNode: spawnNode,
                dir0: cd,
                radial,
                length: lateralLen,
                radius0: Math.min(L.lateralR, spawnNode.radius * 0.92),
                orderIdx: orderIdx + 1,
                parentPathId: path.id,
                primary: false,
            });
        }

        // --- LEADER CONTINUATION, with DEATH and TIP FRAGMENTATION ----------
        // The limb continues as the dominant leader - unless it DIES (broken
        // top / shaded out), leaving a stub. When a branch end stops, it does
        // not finish as one clean shoot: it FRAGMENTS into a few short twiglets.
        if (orderIdx < P.maxOrder && childRule) {
            const leaderLen = length * P.leaderLengthShare;
            const leaderR = Math.max(P.minRadius, tipR * P.leaderRadiusShare);
            const deathP = P.deathFrac * (orderIdx >= 2 ? 1.5 : 0.4);
            const alive = rng.next() > deathP;
            if (alive && leaderLen > segLen * 1.1 && leaderR > P.minRadius * 1.4) {
                path.termination = 'continued';   // handed on to a leader continuation
                growLimb({
                    startNode: tipNode,
                    dir0: tipDir,
                    radial,
                    length: leaderLen,
                    radius0: leaderR,
                    orderIdx: orderIdx + 1,
                    parentPathId: path.id,
                    primary: false,
                    leaderDepth: leaderDepth + 1,  // same leader chain -> deeper
                    isLeaderCont: true,
                });
            } else {
                if (!alive) mort.died++;
                path.termination = !alive ? 'died'
                    : leaderR <= P.minRadius * 1.4 ? 'too-thin' : 'too-short';
                if (orderIdx >= 2) fragmentTip(tipNode, tipDir, radial, tipR, orderIdx);
            }
        } else {
            path.termination = 'max-order';
            fragmentTip(tipNode, tipDir, radial, tipR, orderIdx);
        }

        // --- OUTER-SHELL TAGGING -------------------------------------------
        // Tag the finest, outermost members so foliage can build an outer shell
        // and the heavy inner armature stays bare. Twigs (order 4) and the
        // distal end of tertiaries are the canopy surface.
        if (orderIdx >= 3) {
            path.shell = true;
            const start = Math.floor(ids.length * (orderIdx === 4 ? 0.0 : 0.5));
            for (let i = start; i < ids.length; i++) {
                nodes[ids[i]].shellAnchor = true;
                noteShell(nodes[ids[i]].position);
            }
        } else {
            path.shell = false;
        }

        return tipNode;
    }

    // TERMINAL FRAGMENTATION: a branch end never finishes as one clean shoot in
    // nature - it frays into a few short divergent twiglets. This kills the
    // tell-tale "every tip is a single clean stroke" look.
    function fragmentTip(tipNode, tipDir, radial, tipR, orderIdx) {
        if (tipR < P.minRadius * 1.15) return;
        const childOrder = Math.min(orderIdx + 1, 4);
        const k = 2 + (rng.next() < 0.45 ? 1 : 0);
        for (let f = 0; f < k; f++) {
            const div = deg(rng.range(16, 44));
            let d = normalize(childDirection(tipDir, radial, div, f, k, Math.min(orderIdx, 3)));
            let nd = tipNode;
            const fids = [tipNode.id];
            const segs = 2;
            // Twiglets must stay SHORTER and THINNER than the Fine branches they
            // spring from (was overshooting both, breaking the size hierarchy).
            const flen = rng.range(0.5, 1.3);
            let fBaseR = 0;
            for (let s = 1; s <= segs; s++) {
                const jAxis = rotateAxis(perp(d), d, rng.range(0, TAU));
                d = normalize(rotateAxis(d, jAxis, rng.range(-0.22, 0.22)));
                const pos = add(nd.position, scale(d, flen / segs));
                const r = Math.max(P.minRadius, tipR * (1 - s / (segs + 1)) * 0.45);
                if (s === 1) fBaseR = r;
                nd = addNode(pos, r, childOrder, 'branch', nd.id);
                fids.push(nd.id);
            }
            const fp = new SkeletonPath({
                id: paths.length, parentPathId: null, nodeIds: fids,
                order: ORDER[childOrder], role: 'branch',
            });
            fp.shell = true;
            fp.zone = 'Twig';
            fp.termination = 'fragment';
            fp.leaderDepth = 0;
            fp.isLeaderCont = false;
            fp.limbLength = flen;
            fp.baseRadius = fBaseR;                  // the twiglet's own (thin) wood
            fp.tipRadius = nodes[fids[fids.length - 1]].radius;
            paths.push(fp);
            for (let i = 1; i < fids.length; i++) {
                nodes[fids[i]].shellAnchor = true;
                noteShell(nodes[fids[i]].position);
            }
        }
    }

    // Direction of a lateral child: diverge from the limb, biased outward
    // (away from trunk) and slightly up, with cross-over azimuth scatter.
    function childDirection(parentDir, outwardRadial, divergence, slot, count, parentOrderIdx) {
        const { t, up, side } = localFrame(parentDir);
        const center = ((slot + 0.5) / count) * TAU;
        const jitter = (TAU / count) * 0.45;
        const az = center + rng.range(-jitter, jitter);
        let radial = normalize(add(scale(side, Math.cos(az)), scale(up, Math.sin(az))));

        // Bias the lateral to keep heading OUTWARD (toward the canopy edge)
        // rather than diving back at the trunk.
        if (outwardRadial && dot(radial, outwardRadial) < 0) {
            radial = normalize(add(scale(radial, 0.45), scale(outwardRadial, 0.55)));
        }
        // Keep undersides from plunging straight down.
        if (dot(radial, UP) < -0.3) {
            radial = normalize(add(scale(radial, 0.6), scale(UP, 0.4)));
        }

        let dir = normalize(add(scale(t, Math.cos(divergence)), scale(radial, Math.sin(divergence))));
        // Gentle upward bias grows stronger for finer orders (twigs reach up
        // into the light at the canopy surface).
        const upBias = parentOrderIdx >= 3 ? 0.16 : 0.06;
        dir = normalize(add(dir, scale(UP, upBias)));
        return dir;
    }

    attachSpines(paths, nodes);

    // Expose where the canopy SHELL is so foliage can leaf the outer surface
    // only. Falls back to the full bounds if nothing got tagged.
    const crown = shell.count > 0
        ? { min: shell.min, max: shell.max, anchorCount: shell.count }
        : { min: bounds.min, max: bounds.max, anchorCount: 0 };

    return { nodes, paths, bounds, crown, mortality: mort, character: P.characterAmount ?? 0 };
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
