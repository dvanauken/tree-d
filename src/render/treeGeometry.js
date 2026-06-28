// treeGeometry.js - Renderer adapter: skeleton/foliage data -> Three.js geometry.
//
// Wood: one continuous tube per branch (rotation-minimizing frame, no twist),
// with natural root flare and a subtle buttress near the base. No textures -
// realism comes from the structure; the surface is plain shaded via computed
// smooth normals and a per-order brown vertex colour. Leaves: instanced leaf
// cards.

import * as THREE from '../../vendor/three.module.js';
import { add, sub, scale, dot, cross, len, normalize, rotateAxis, perp } from '../model/vec3.js';

const RADIAL = 12; // sides per tube ring (smooth limbs)

// Plain wood colours, lightening slightly with branch order.
// Bark albedo: warm dark-brown trunk, lightening slightly toward twigs.
// Kept mid-dark so the sun doesn't wash them pale.
const ORDER_COLOR = {
    trunk:     0x140c05,
    primary:   0x0f0904,
    secondary: 0x130c06,
    tertiary:  0x170e08,
    twig:      0x1a110a,
};

export function buildWoodGeometry(skeleton) {
    const P = [];
    const C = [];
    const I = [];
    const nodes = skeleton.nodes;
    const col = new THREE.Color();

    for (const path of skeleton.paths) {
        col.set(ORDER_COLOR[path.order] ?? 0x705a42);
        addTube(P, C, I, path, nodes, col);
    }

    const g = new THREE.BufferGeometry();
    g.setIndex(I);
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return g;
}

// One continuous tube along a branch path, with a rotation-minimizing frame
// (no twist). Realism is in the surface, not a texture: organic non-circular
// cross-sections (value noise around + along), thickness that bulges and
// pinches, branch-collar swelling where a limb leaves its parent, and root
// flare at the trunk foot.
const GA = 6; // angular noise cells (wraps)
const LUMP = 0.11; // cross-section irregularity
const BULGE = 0.08; // length-wise thickness variation
const COLLAR = 0.20; // junction swelling at each limb base
const CURVE_TENSION = 0.75; // lower than Catmull-Rom to avoid fork overshoot
const SMOOTH_STEPS = {
    trunk: 4,
    primary: 4,
    secondary: 3,
    tertiary: 3,
    twig: 2,
};

function addTube(P, C, I, path, nodes, col) {
    const ids = path.nodeIds;
    if (ids.length < 2) return;
    const rawPts = ids.map((id) => nodes[id].position);
    const rawRadii = ids.map((id) => nodes[id].radius);
    const smoothed = smoothPath(rawPts, rawRadii, path.order);
    const pts = smoothed.pts;
    const radii = smoothed.radii;
    const n = pts.length;
    const { normals, binormals } = frames(pts);
    const seed = path.id + 1;
    const startVert = P.length / 3;

    const cum = [0];
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i], pts[i - 1]);
    const total = cum[n - 1] || 1;
    const GL = Math.max(2, Math.round(total / 2.5)); // length noise cells

    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const nrm = normals[i];
        const bin = binormals[i];
        const r = radii[i];
        const zb = Math.max(0, p[2]);
        const along = (i / (n - 1)) * GL;

        const flare = 1 + 0.55 * Math.exp(-zb / 2.6); // trunk-foot root flare
        const collar = 1 + COLLAR * Math.exp(-cum[i] / 1.6); // swelling at limb base
        const bulge = 1 + BULGE * (noise1(seed, cum[i] * 0.6) - 0.5) * 2;

        for (let s = 0; s <= RADIAL; s++) {
            const ang = (s / RADIAL) * Math.PI * 2;
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const lump = 1 + LUMP * (gridNoise(seed, (s / RADIAL) * GA, along) - 0.5) * 2;
            const rr = r * flare * collar * bulge * lump;
            const dx = ca * nrm[0] + sa * bin[0];
            const dy = ca * nrm[1] + sa * bin[1];
            const dz = ca * nrm[2] + sa * bin[2];
            P.push(p[0] + dx * rr, p[1] + dy * rr, p[2] + dz * rr);
            C.push(col.r, col.g, col.b);
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
}

function smoothPath(rawPts, rawRadii, order) {
    if (rawPts.length < 3) return { pts: rawPts, radii: rawRadii };

    const steps = SMOOTH_STEPS[order] ?? 3;
    const pts = [];
    const radii = [];

    for (let i = 0; i < rawPts.length - 1; i++) {
        const p0 = rawPts[i];
        const p1 = rawPts[i + 1];
        const m0 = tangent(rawPts, i);
        const m1 = tangent(rawPts, i + 1);
        const start = i === 0 ? 0 : 1;

        for (let s = start; s <= steps; s++) {
            const t = s / steps;
            pts.push(hermite(p0, p1, m0, m1, t));
            radii.push(smoothRadius(rawRadii[i], rawRadii[i + 1], t));
        }
    }

    return { pts, radii };
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

function dist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

export function buildLeafMesh(leaves, leafTexture) {
    if (!leaves || !leaves.length) return null;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
        map: leafTexture,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, leaves.length);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const c = new THREE.Color();
    const dark = new THREE.Color(0x3a5e26);
    const light = new THREE.Color(0x7ba84a);

    for (let i = 0; i < leaves.length; i++) {
        const lf = leaves[i];
        pos.set(lf.position[0], lf.position[1], lf.position[2]);
        const sz = lf.size * 2.2;
        scl.set(sz, sz, sz);
        const r = lf.rot || [0, 0, 0];
        e.set(r[0], r[1], r[2]);
        q.setFromEuler(e);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        c.copy(dark).lerp(light, lf.tint);
        mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
}
