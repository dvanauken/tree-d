// treeGeometry.js - Renderer adapter: skeleton/foliage data -> Three.js geometry.
//
// Wood: one continuous tube per branch (rotation-minimizing frame, no twist).
// Realism comes from geometry + procedural maps, never image files: organic
// cross-sections, length-wise bulge/pinch, branch-collar swelling, root flare,
// deep longitudinal FURROWS (scaled by bark.fissure) and muscular trunk-foot
// FLUTING. UVs are emitted so the procedural bark/normal/roughness maps tile at
// a consistent real-world scale; per-vertex colour adds mottling + lichen that
// multiplies over the tiling map. Leaves: instanced glossy live-oak cards.

import * as THREE from '../../vendor/three.module.js';
import { add, sub, scale, dot, cross, len, normalize, rotateAxis, perp } from '../model/vec3.js';
import { ZONE_COLOR } from '../model/analysis/architecture.js';

const RADIAL = 16; // sides per tube ring - enough angular samples to carve furrows

// Per-order base albedo, MULTIPLIED under the tiling bark map (which supplies
// the brown). Kept near-neutral-dark so the map's colour shows through,
// lightening slightly toward the twigs. (Lifted well above the old near-black
// values so the env sheen and cross-section lumps actually read under ACES.)
const ORDER_COLOR = {
    trunk:     0x6a5644,
    primary:   0x6f5a47,
    secondary: 0x74604c,
    tertiary:  0x7a6651,
    twig:      0x806c57,
};

// Bark surface defaults (match hero spec surface.bark) - used if the caller
// doesn't pass profile surface through.
const DEFAULT_BARK = { fissure: 0.4, flute: 0.15 };

// World feet of bark texture per V-tile (how tall one wrap of the map is). Live
// oak furrows are coarse, so a generous tile reads right at human scale.
const BARK_V_FEET = 3.2;

export function buildWoodGeometry(skeleton, surface, opts = {}) {
    const colorByZone = opts.colorMode === 'zone'; // Architecture View
    const bark = (surface && surface.bark) || {};
    const fissure = bark.fissure ?? DEFAULT_BARK.fissure;
    // Trunk-foot muscular fluting strength. SceneView threads it onto `surface`
    // as `trunkFluting` (it lives at profile.trunk.fluting in the hero model).
    const flute = (surface && surface.trunkFluting) ?? DEFAULT_BARK.flute;

    const P = [];
    const C = [];
    const UV = [];
    const I = [];
    const nodes = skeleton.nodes;
    const col = new THREE.Color();
    const forkBulge = computeForkBulges(nodes);

    for (const path of skeleton.paths) {
        if (colorByZone) col.set(ZONE_COLOR[path.zone] ?? 0x888888);
        else col.set(ORDER_COLOR[path.order] ?? 0x705a42);
        addTube(P, C, UV, I, path, nodes, col, fissure, flute, forkBulge);
    }

    // Major forks (several thick limbs carrying off most of the parent's own
    // cross-section) leave a real gap between the independently-swept tubes -
    // not just visual overlap, an actual hole with sky showing through, since
    // no triangle connects one path's surface to another's. A per-vertex
    // collar/bulge on the tubes themselves (above) cannot add the missing
    // surface; only new bridging geometry can. Built here, once per hub, using
    // the same bark noise/colour so it reads as one continuous woody knuckle
    // rather than a separate glued-on shape.
    for (const hub of computeForkHubs(nodes)) {
        col.set(ORDER_COLOR[hub.node.order] ?? 0x705a42);
        addForkHub(P, C, UV, I, hub, col);
    }

    const g = new THREE.BufferGeometry();
    g.setIndex(I);
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.computeVertexNormals();
    return g;
}

const GA = 6;       // angular noise cells (wraps)
const LUMP = 0.11;  // cross-section irregularity
const BULGE = 0.08; // length-wise thickness variation
// Junction swelling at each limb base. Every lateral branch already starts at
// a radius capped relative to its parent's local radius at the fork (see
// buildSkeleton.js: `Math.min(lateralR, spawnNode.radius * 0.92)`), so this
// bump only needs to be a subtle collar, not a second inflation on top of
// that cap - a large isotropic bump here (previously 0.20, decaying over
// ~1.6 ft) re-pushes every one of ~136 fork bases back out past the parent
// surface, which is what reads as an overlapping blob at every junction.
const COLLAR = 0.07;
const COLLAR_DECAY_FEET = 0.9;
const FURROW_DEPTH = 0.10; // fraction of radius carved out by deepest furrow
const FLUTE_DEPTH = 0.16;  // fraction of radius for trunk-foot muscular flutes

// Real branch collars swell in proportion to how much cross-section the
// children actually carry off (pipe-model load), not a flat bump applied
// everywhere - a twig fork carrying almost nothing shouldn't bulge, a major
// primary-to-secondary split carrying a full pipe-model share should. This
// stays inside the SAME tube (addTube below only widens the parent path's
// own ring where it passes a fork node) instead of an unwelded separate hub
// mesh glued on top of the tubes, which is what made the geometry look like
// an added lump rather than one continuous surface last time this was tried.
const FORK_BULGE_MAX = 0.34;
const FORK_BULGE_THRESHOLD = 0.55; // below this child/parent radius ratio, treat as a minor twig fork - no bulge

function computeForkBulges(nodes) {
    const bulge = new Map();
    for (const node of nodes) {
        if (!node.children || node.children.length < 2 || node.radius <= 1e-6) continue;
        let childRadiusSq = 0;
        const childDirs = [];
        for (const cid of node.children) {
            const child = nodes[cid];
            childRadiusSq += child.radius * child.radius;
            const d = sub(child.position, node.position);
            if (len(d) > 1e-6) childDirs.push(normalize(d));
        }
        if (!childDirs.length) continue;
        const ratio = Math.sqrt(childRadiusSq) / node.radius;
        const amount = Math.max(0, Math.min(FORK_BULGE_MAX, (ratio - FORK_BULGE_THRESHOLD) * 0.5));
        if (amount > 0.01) bulge.set(node.id, { amount, radius: node.radius, childDirs });
    }
    return bulge;
}

// A hub is only built for genuinely major forks - the ones severe enough that
// per-tube collar swelling can't close the gap (see FORK_BULGE_THRESHOLD for
// the lighter case every other fork already gets). HUB_MIN_RATIO is
// deliberately higher: most forks are fine with a collar; only the ones
// carrying MORE cross-section than the parent itself actually tear open a
// hole between independently-swept tubes.
const HUB_MIN_RATIO = 1.05;
const HUB_RINGS = 10;   // latitude samples
const HUB_SEGMENTS = 16; // longitude samples - matches RADIAL so bark scale matches neighbouring tubes
const HUB_REACH = 1.28;  // how far past a target's own radius the hub must extend to fully swallow its base
const HUB_FOCUS = 3;      // higher = influence stays more localized around each target direction

function computeForkHubs(nodes) {
    const hubs = [];
    for (const node of nodes) {
        if (!node.children || node.children.length < 2 || node.radius <= 1e-6) continue;
        const targets = [];
        let childRadiusSq = 0;
        for (const cid of node.children) {
            const child = nodes[cid];
            childRadiusSq += child.radius * child.radius;
            const d = sub(child.position, node.position);
            const l = len(d);
            if (l > 1e-6) targets.push({ dir: scale(d, 1 / l), radius: child.radius });
        }
        if (targets.length < 2) continue;
        const ratio = Math.sqrt(childRadiusSq) / node.radius;
        if (ratio < HUB_MIN_RATIO) continue;
        // Reach a little way back toward the parent too, so the hub blends
        // into the incoming limb's surface instead of only the outgoing side.
        if (node.parentId != null) {
            const parent = nodes[node.parentId];
            const d = sub(node.position, parent.position);
            const l = len(d);
            if (l > 1e-6) targets.push({ dir: scale(d, 1 / l), radius: node.radius * 0.85 });
        }
        hubs.push({ node, targets });
    }
    return hubs;
}

function addForkHub(P, C, UV, I, hub, col) {
    const { node, targets } = hub;
    const seed = node.id + 90001;
    const center = node.position;
    const baseRadius = node.radius;

    // Any target direction gives a stable pole for the latitude/longitude
    // sampling grid - which one is arbitrary, it only affects seam placement.
    const zAxis = targets[0].dir;
    let xAxis = perp(zAxis);
    const yAxis = normalize(cross(zAxis, xAxis));
    xAxis = normalize(cross(yAxis, zAxis));

    const startVert = P.length / 3;
    const ring = HUB_SEGMENTS + 1;
    const uTiles = Math.max(1, Math.round((2 * Math.PI * baseRadius) / BARK_V_FEET));
    const vSpan = Math.max(0.5, (2 * baseRadius) / BARK_V_FEET);

    for (let r = 0; r <= HUB_RINGS; r++) {
        const v = r / HUB_RINGS;
        const theta = v * Math.PI;
        const st = Math.sin(theta);
        const ct = Math.cos(theta);

        for (let s = 0; s <= HUB_SEGMENTS; s++) {
            const u = s / HUB_SEGMENTS;
            const phi = u * Math.PI * 2;
            const cp = Math.cos(phi);
            const sp = Math.sin(phi);
            const dir = add(add(scale(xAxis, cp * st), scale(yAxis, sp * st)), scale(zAxis, ct));

            // Radial-basis blend: reach toward whichever target(s) this
            // direction faces (generous enough to fully contain that limb's
            // own base), settling back to the node's own girth elsewhere.
            let wsum = 0;
            let rsum = 0;
            for (const t of targets) {
                const align = Math.max(0, dot(dir, t.dir));
                const w = Math.pow(align, HUB_FOCUS);
                wsum += w;
                rsum += w * (t.radius * HUB_REACH + baseRadius * 0.15);
            }
            const wclamped = Math.min(1, wsum);
            const blended = wsum > 1e-4 ? rsum / wsum : baseRadius;
            let rr = baseRadius + (blended - baseRadius) * wclamped;

            // Same organic surface noise the tubes use, so the hub reads as
            // more bark rather than a separate smoother shape.
            const lump = 1 + LUMP * (gridNoise(seed, u * GA, v * GA * 2) - 0.5) * 2;
            rr *= lump;

            const p = add(center, scale(dir, rr));
            P.push(p[0], p[1], p[2]);
            UV.push(u * uTiles, v * vSpan);

            const warm = gridNoise(seed + 3, u * 3, v * 3) - 0.5;
            const lume = noise1(seed + 5, v * 4 + u) - 0.5;
            const cr = col.r * (1 + lume * 0.22 + warm * 0.10);
            const cg = col.g * (1 + lume * 0.22);
            const cb = col.b * (1 + lume * 0.22 - warm * 0.12);
            C.push(clamp01c(cr), clamp01c(cg), clamp01c(cb));
        }
    }

    for (let r = 0; r < HUB_RINGS; r++) {
        for (let s = 0; s < HUB_SEGMENTS; s++) {
            const a = startVert + r * ring + s;
            const b = startVert + (r + 1) * ring + s;
            const c = startVert + (r + 1) * ring + (s + 1);
            const d = startVert + r * ring + (s + 1);
            I.push(a, b, d, b, c, d);
        }
    }
}

function addTube(P, C, UV, I, path, nodes, col, fissure, flute, forkBulge) {
    const spine = path.spine || fallbackSpine(path, nodes);
    const pts = spine.positions;
    const radii = spine.radii;
    const n = pts.length;
    if (n < 2) return;
    const { normals, binormals } = frames(pts);
    const seed = path.id + 1;
    const startVert = P.length / 3;

    const cum = spine.distances || cumulativeDistances(pts);
    const total = spine.length || cum[n - 1] || 1;
    const GL = Math.max(2, Math.round(total / 2.5)); // length noise cells

    const isTrunk = path.order === 'trunk';
    // Furrow count scales with circumference so grooves stay a constant real
    // width whether on the fat trunk or a thin limb. Muscular flutes are a few
    // big lobes, trunk only, fading up from the foot.
    const baseR0 = radii[0] || 0.3;
    const furrowCount = Math.max(5, Math.round(baseR0 * 9));
    const fluteCount = 5; // live-oak trunks read as a bundle of ~5 muscles
    const furrowK = FURROW_DEPTH * (0.5 + fissure); // fissure deepens grooves

    // U tiling: aim for roughly square bark cells. One horizontal repeat of the
    // map wraps the whole limb; tile vertically by world distance.
    const circumference = 2 * Math.PI * baseR0;
    const uTiles = Math.max(1, Math.round(circumference / BARK_V_FEET));

    // Where this path's OWN control nodes are major forks (a lateral carries
    // off real cross-section right here), widen this ring locally so the
    // parent surface stays wide enough to visually contain what leaves it -
    // this is what actually fixes the overlapping-tube look at a fork; the
    // per-path COLLAR above is deliberately too small to do that alone now.
    const steps = spine.sampleStepPerSegment || 1;
    const forkEvents = [];
    if (forkBulge && forkBulge.size) {
        path.nodeIds.forEach((id, k) => {
            const fork = forkBulge.get(id);
            if (!fork) return;
            const sampleIdx = Math.min(k * steps, n - 1);
            forkEvents.push({
                arc: cum[sampleIdx],
                amount: fork.amount,
                decay: Math.max(0.6, fork.radius * 1.4),
                childDirs: fork.childDirs,
            });
        });
    }

    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const nrm = normals[i];
        const bin = binormals[i];
        const r = radii[i];
        const zb = Math.max(0, p[2]);
        const along = (i / (n - 1)) * GL;
        const vCoord = cum[i] / BARK_V_FEET; // bark V runs up the limb

        // Root flare belongs to the trunk's own transition into the ground,
        // not to any branch - it was previously applied by absolute height
        // alone (unconditional on every path), so Live Oak's low sweeping
        // primaries (which dip close to the ground by design) got the same
        // +55% trunk-foot bulge right at their lowest point: a large dark
        // swollen mass with no relation to an actual fork or the ground.
        const flare = isTrunk ? 1 + 0.55 * Math.exp(-zb / 2.6) : 1;
        const collar = 1 + COLLAR * Math.exp(-cum[i] / COLLAR_DECAY_FEET); // swelling at limb base
        // Active fork events near this ring, with their length-wise falloff
        // pre-computed once per ring (the direction-dependent part is applied
        // per angular vertex below, since a multi-way fork needs to reach
        // asymmetrically toward each child rather than swell uniformly).
        const activeForks = [];
        for (const ev of forkEvents) {
            const falloff = Math.exp(-Math.abs(cum[i] - ev.arc) / ev.decay);
            if (falloff > 0.02) activeForks.push({ ev, falloff });
        }
        const bulge = 1 + BULGE * (noise1(seed, cum[i] * 0.6) - 0.5) * 2;
        // Fluting only near the trunk foot, fading out over the first ~6 ft.
        const fluteAmt = isTrunk ? flute * FLUTE_DEPTH * Math.exp(-cum[i] / 6.0) : 0;

        for (let s = 0; s <= RADIAL; s++) {
            const f = s / RADIAL;
            const ang = f * Math.PI * 2;
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);

            const lump = 1 + LUMP * (gridNoise(seed, f * GA, along) - 0.5) * 2;

            // Longitudinal furrows: sharp inward creases that meander along the
            // limb (along-length noise so grooves break and reconnect).
            const wander = (noise1(seed + 17, cum[i] * 0.5) - 0.5) * 0.6;
            const groove = Math.pow(0.5 + 0.5 * Math.cos((f * furrowCount + wander) * Math.PI * 2), 2.2);
            const furrow = 1 - furrowK * groove;

            // Muscular fluting: a few big lobes near the trunk foot.
            const flutes = 1 - fluteAmt * (0.5 + 0.5 * Math.cos(f * fluteCount * Math.PI * 2));

            const dx = ca * nrm[0] + sa * bin[0];
            const dy = ca * nrm[1] + sa * bin[1];
            const dz = ca * nrm[2] + sa * bin[2];

            // Fork collar: reach further out toward whichever child(ren) this
            // vertex faces, instead of swelling the same amount all the way
            // around - a 4-6 way major fork needs the surface to bulge toward
            // each divergent limb, not just get uniformly fatter.
            let fork = 1;
            for (const { ev, falloff } of activeForks) {
                let dirWeight = 0;
                for (const cd of ev.childDirs) {
                    const d = dx * cd[0] + dy * cd[1] + dz * cd[2];
                    if (d > dirWeight) dirWeight = d;
                }
                const w = 0.35 + 0.65 * dirWeight;
                fork += ev.amount * falloff * w;
            }

            const rr = r * flare * collar * fork * bulge * lump * furrow * flutes;
            P.push(p[0] + dx * rr, p[1] + dy * rr, p[2] + dz * rr);
            UV.push(f * uTiles, vCoord);

            // Per-vertex colour: warm/cool + lightness drift along & around the
            // limb, and a grey lichen wash biased toward forks (small cum).
            const warm = (gridNoise(seed + 3, f * 3, along * 0.7) - 0.5); // -.5..+.5
            const lume = (noise1(seed + 5, cum[i] * 0.8 + f) - 0.5);
            const lichen = Math.max(0, gridNoise(seed + 9, f * 2.2, along * 0.5) - 0.62)
                           * Math.exp(-cum[i] / 4.0) * 1.8;
            let cr = col.r * (1 + lume * 0.22 + warm * 0.10);
            let cg = col.g * (1 + lume * 0.22);
            let cb = col.b * (1 + lume * 0.22 - warm * 0.12);
            // blend toward cool lichen grey
            cr = cr + (0.46 - cr) * lichen;
            cg = cg + (0.49 - cg) * lichen;
            cb = cb + (0.44 - cb) * lichen;
            C.push(clamp01c(cr), clamp01c(cg), clamp01c(cb));
        }
    }

    const ring = RADIAL + 1;
    for (let i = 0; i < n - 1; i++) {
        for (let s = 0; s < RADIAL; s++) {
            const a = startVert + i * ring + s;
            const b = startVert + (i + 1) * ring + s;
            const c = startVert + (i + 1) * ring + (s + 1);
            const d = startVert + i * ring + (s + 1);
            I.push(a, b, d, b, c, d);
        }
    }
    addTipCap(P, C, UV, I, pts[n - 1], startVert + (n - 1) * ring, col);
}

function addTipCap(P, C, UV, I, tip, ringStart, col) {
    const center = P.length / 3;
    P.push(tip[0], tip[1], tip[2]);
    C.push(col.r, col.g, col.b);
    UV.push(0.5, 0.5);
    for (let s = 0; s < RADIAL; s++) {
        I.push(ringStart + s, ringStart + s + 1, center);
    }
}

function clamp01c(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Deterministic hash -> [0,1).
function h2(seed, x, y) {
    let n = (seed * 73856093) ^ ((x + 1024) * 19349663) ^ ((y + 1024) * 83492791);
    n = (n ^ (n >>> 13)) >>> 0;
    n = (n * 1274126177) >>> 0;
    return n / 4294967296;
}

// Smooth value noise on a grid that wraps in the angular axis (period GA).
function gridNoise(seed, fa, fl) {
    const ia = Math.floor(fa);
    const il = Math.floor(fl);
    const ta = fa - ia;
    const tl = fl - il;
    const sa = ta * ta * (3 - 2 * ta);
    const sl = tl * tl * (3 - 2 * tl);
    const a = h2(seed, ia % GA, il);
    const b = h2(seed, (ia + 1) % GA, il);
    const c = h2(seed, ia % GA, il + 1);
    const d = h2(seed, (ia + 1) % GA, il + 1);
    const top = a + (b - a) * sa;
    const bot = c + (d - c) * sa;
    return top + (bot - top) * sl;
}

function noise1(seed, x) {
    const i = Math.floor(x);
    const t = x - i;
    const s = t * t * (3 - 2 * t);
    const a = h2(seed, i, 4096);
    const b = h2(seed, i + 1, 4096);
    return a + (b - a) * s;
}

function fallbackSpine(path, nodes) {
    const positions = path.nodeIds.map((id) => nodes[id].position);
    return {
        positions,
        radii: path.nodeIds.map((id) => nodes[id].radius),
        distances: cumulativeDistances(positions),
    };
}

function cumulativeDistances(pts) {
    const distances = [0];
    for (let i = 1; i < pts.length; i++) {
        distances[i] = distances[i - 1] + len(sub(pts[i], pts[i - 1]));
    }
    return distances;
}

// Rotation-minimizing frame along a polyline (parallel transport).
function frames(pts) {
    const n = pts.length;
    const tang = [];
    for (let i = 0; i < n; i++) {
        let t;
        if (i === 0) t = sub(pts[1], pts[0]);
        else if (i === n - 1) t = sub(pts[n - 1], pts[n - 2]);
        else t = sub(pts[i + 1], pts[i - 1]);
        tang.push(normalize(t));
    }
    const normals = [perp(tang[0])];
    for (let i = 1; i < n; i++) {
        const t0 = tang[i - 1];
        const t1 = tang[i];
        let ni = normals[i - 1];
        const axis = cross(t0, t1);
        const al = len(axis);
        if (al > 1e-6) {
            const ax = scale(axis, 1 / al);
            const angle = Math.atan2(al, dot(t0, t1));
            ni = rotateAxis(ni, ax, angle);
        }
        ni = normalize(sub(ni, scale(t1, dot(ni, t1)))); // re-orthogonalize
        normals.push(ni);
    }
    const binormals = normals.map((nv, i) => cross(tang[i], nv));
    return { normals, binormals };
}

export function buildLeafMesh(leaves, leafTexture, opts = {}) {
    if (!leaves || !leaves.length) return null;

    // Two-tone evergreen range from the species crown.colorRange (dark -> light).
    const range = opts.colorRange || [0x2f4a1e, 0x6a8c3a];
    const sheen = opts.sheen ?? 0.3;

    const geo = new THREE.PlaneGeometry(1, 1);

    // Glossy waxy live-oak cuticle: clearcoat gives the specular sheen highlight
    // (the wet evergreen look) without any image-based gloss map. A small
    // emissive lifts the leaves so deep self-shadowed clusters still read as
    // translucent foliage when backlit, instead of going black.
    const mat = new THREE.MeshPhysicalMaterial({
        map: leafTexture,
        alphaTest: 0.42,
        transparent: false,          // alphaTest cutout - keep depth writes on
        side: THREE.DoubleSide,
        vertexColors: true,          // per-instance color modulates the map
        roughness: 0.5,
        metalness: 0.0,
        clearcoat: sheen,            // waxy specular layer
        clearcoatRoughness: 0.35,
        reflectivity: 0.45,
        sheen: new THREE.Color(0x2c4a1c),
        emissive: new THREE.Color(0x16240d),
        emissiveIntensity: 0.55,     // faint backlit translucency lift
    });

    const mesh = new THREE.InstancedMesh(geo, mat, leaves.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qTilt = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const c = new THREE.Color();

    const dark = new THREE.Color(range[0]);
    const light = new THREE.Color(range[1]);
    const tmpN = new THREE.Vector3();
    const planeNormal = new THREE.Vector3(0, 0, 1); // PlaneGeometry faces +Z

    for (let i = 0; i < leaves.length; i++) {
        const lf = leaves[i];
        pos.set(lf.position[0], lf.position[1], lf.position[2]);

        // Cards are ~2.2x the data size so a single card reads as a leaf spray.
        const sz = lf.size * 2.2;
        scl.set(sz, sz, sz);

        // Face the card outward along the canopy normal (so the shell catches
        // the sun), then add the per-leaf random rotation as natural scatter.
        const r = lf.rot || [0, 0, 0];
        e.set(r[0], r[1], r[2]);
        q.setFromEuler(e);

        if (lf.normal) {
            tmpN.set(lf.normal[0], lf.normal[1], lf.normal[2]).normalize();
            qTilt.setFromUnitVectors(planeNormal, tmpN);
            q.premultiply(qTilt);
        }

        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);

        // Two-tone: interpolate dark<->light by the per-leaf tint, then nudge
        // outer-shell leaves brighter (sun-side) and add slight hue variance so
        // the canopy never looks like one flat green.
        const shellLift = lf.shell != null ? THREE.MathUtils.clamp((lf.shell - 0.6) * 0.6, 0, 0.35) : 0;
        const t = THREE.MathUtils.clamp(lf.tint * 0.85 + shellLift, 0, 1);
        c.copy(dark).lerp(light, t);
        const j = (lf.tint - 0.5) * 0.10;
        c.r = THREE.MathUtils.clamp(c.r + j * 0.5, 0, 1);
        c.b = THREE.MathUtils.clamp(c.b - j * 0.5, 0, 1);
        mesh.setColorAt(i, c);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
}
