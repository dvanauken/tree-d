// treeGeometry.js - Renderer adapter: skeleton/foliage data -> Three.js geometry.
//
// Wood: one merged BufferGeometry of smooth tapered tube segments (smooth
// radial normals + UVs so a bark texture can wrap), vertex-coloured by branch
// order. Leaves: an InstancedMesh of alpha-cut leaf cards, each positioned,
// scaled, oriented, and tinted per the foliage data.

import * as THREE from '../../vendor/three.module.js';
import { sub, cross, normalize } from '../model/vec3.js';

const RADIAL = 10; // sides per tube ring (smooth limbs)
const V_SCALE = 4; // feet of length per bark-texture tile
const ORDER_COLOR = {
    trunk: 0x4a3526,
    primary: 0x5b4231,
    secondary: 0x6f5340,
    tertiary: 0x80664e,
    twig: 0x927a60,
};

export function buildWoodGeometry(skeleton) {
    const P = [];
    const N = [];
    const C = [];
    const U = [];
    const nodes = skeleton.nodes;
    const col = new THREE.Color();

    for (const path of skeleton.paths) {
        col.set(ORDER_COLOR[path.order] ?? 0x6f5340);
        const ids = path.nodeIds;
        let vlen = 0;
        for (let i = 0; i < ids.length - 1; i++) {
            const a = nodes[ids[i]];
            const b = nodes[ids[i + 1]];
            const segLen = dist(a.position, b.position);
            addSegment(P, N, C, U, a.position, b.position, a.radius, b.radius, col,
                vlen / V_SCALE, (vlen + segLen) / V_SCALE);
            vlen += segLen;
        }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
}

function addSegment(P, N, C, U, a, b, ra, rb, col, va, vb) {
    let dir = sub(b, a);
    const L = Math.hypot(dir[0], dir[1], dir[2]);
    if (L < 1e-6) return;
    dir = [dir[0] / L, dir[1] / L, dir[2] / L];

    const ref = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const right = normalize(cross(dir, ref));
    const up = cross(dir, right);

    const ringA = [];
    const ringB = [];
    const rn = [];
    for (let s = 0; s <= RADIAL; s++) {
        const ang = (s / RADIAL) * Math.PI * 2;
        const c = Math.cos(ang);
        const si = Math.sin(ang);
        const nx = c * right[0] + si * up[0];
        const ny = c * right[1] + si * up[1];
        const nz = c * right[2] + si * up[2];
        rn.push([nx, ny, nz]);
        ringA.push([a[0] + nx * ra, a[1] + ny * ra, a[2] + nz * ra]);
        ringB.push([b[0] + nx * rb, b[1] + ny * rb, b[2] + nz * rb]);
    }

    for (let s = 0; s < RADIAL; s++) {
        const t = s + 1;
        const us = s / RADIAL;
        const ut = t / RADIAL;
        vert(P, N, C, U, ringA[s], rn[s], col, us, va);
        vert(P, N, C, U, ringB[s], rn[s], col, us, vb);
        vert(P, N, C, U, ringB[t], rn[t], col, ut, vb);
        vert(P, N, C, U, ringA[s], rn[s], col, us, va);
        vert(P, N, C, U, ringB[t], rn[t], col, ut, vb);
        vert(P, N, C, U, ringA[t], rn[t], col, ut, va);
    }
}

function vert(P, N, C, U, p, n, col, u, v) {
    P.push(p[0], p[1], p[2]);
    N.push(n[0], n[1], n[2]);
    C.push(col.r, col.g, col.b);
    U.push(u, v);
}

function dist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
        const sz = lf.size * 2.2; // cards a bit larger than the point spacing
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
