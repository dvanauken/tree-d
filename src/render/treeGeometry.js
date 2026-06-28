// treeGeometry.js - Renderer adapter: skeleton/foliage data -> Three.js geometry.
//
// The model owns tree truth (node positions + radii); this module only turns
// that into drawable geometry. Wood is a single merged BufferGeometry of
// tapered tube segments (one frustum per skeleton segment), vertex-coloured by
// branch order. Leaves are an InstancedMesh of small spheres.

import * as THREE from '../../vendor/three.module.js';
import { sub, cross, normalize } from '../model/vec3.js';

const RADIAL = 6; // sides per tube ring
const ORDER_COLOR = {
    trunk: 0x4a3526,
    primary: 0x5b4231,
    secondary: 0x6f5340,
    tertiary: 0x867053,
    twig: 0x9c8a6b,
};

export function buildWoodGeometry(skeleton) {
    const positions = [];
    const normals = [];
    const colors = [];
    const nodes = skeleton.nodes;
    const col = new THREE.Color();

    for (const path of skeleton.paths) {
        col.set(ORDER_COLOR[path.order] ?? 0x6f5340);
        const ids = path.nodeIds;
        for (let i = 0; i < ids.length - 1; i++) {
            const a = nodes[ids[i]];
            const b = nodes[ids[i + 1]];
            addSegment(positions, normals, colors, a.position, b.position, a.radius, b.radius, col);
        }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
}

function addSegment(P, N, C, a, b, ra, rb, col) {
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
    for (let s = 0; s < RADIAL; s++) {
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
        const t = (s + 1) % RADIAL;
        pushV(P, N, C, ringA[s], rn[s], col);
        pushV(P, N, C, ringB[s], rn[s], col);
        pushV(P, N, C, ringB[t], rn[t], col);
        pushV(P, N, C, ringA[s], rn[s], col);
        pushV(P, N, C, ringB[t], rn[t], col);
        pushV(P, N, C, ringA[t], rn[t], col);
    }
}

function pushV(P, N, C, p, n, col) {
    P.push(p[0], p[1], p[2]);
    N.push(n[0], n[1], n[2]);
    C.push(col.r, col.g, col.b);
}

export function buildLeafMesh(leaves) {
    if (!leaves || !leaves.length) return null;

    const geo = new THREE.IcosahedronGeometry(0.5, 0); // diameter 1 * per-leaf scale
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, leaves.length);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const c = new THREE.Color();
    const dark = new THREE.Color(0x274a22);
    const light = new THREE.Color(0x6f9e3f);

    for (let i = 0; i < leaves.length; i++) {
        const lf = leaves[i];
        pos.set(lf.position[0], lf.position[1], lf.position[2]);
        scl.setScalar(lf.size);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        c.copy(dark).lerp(light, lf.tint);
        mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
}
