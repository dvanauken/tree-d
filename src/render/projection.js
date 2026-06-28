// projection.js - Orbit camera: world (feet) -> screen (pixels).
//
// Renderer-side only. An orthographic orbit camera defined by yaw, pitch, a
// target point, and a pixels-per-foot scale. project() returns [px, py, depth]
// where depth is used for painter's-algorithm ordering and depth cueing.

import { sub, dot, cross, normalize } from '../model/vec3.js';

const WORLD_UP = [0, 0, 1];

export class Camera {
    constructor() {
        this.yaw = Math.PI * 0.25;
        this.pitch = 0.32;
        this.target = [0, 0, 20];
        this.scale = 8; // pixels per foot
    }

    // Orthonormal screen basis: forward points from target toward the camera.
    basis() {
        const cp = Math.cos(this.pitch);
        const sp = Math.sin(this.pitch);
        const cy = Math.cos(this.yaw);
        const sy = Math.sin(this.yaw);
        const forward = [cp * cy, cp * sy, sp];
        let right = cross(WORLD_UP, forward);
        right = normalize(right[0] || right[1] || right[2] ? right : [1, 0, 0]);
        const up = cross(forward, right);
        return { forward, right, up };
    }

    // Project a world point to screen coordinates around centre (cx, cy).
    project(p, cx, cy) {
        const b = this.basis();
        const v = sub(p, this.target);
        const sr = dot(v, b.right);
        const su = dot(v, b.up);
        const depth = dot(v, b.forward);
        return [cx + sr * this.scale, cy - su * this.scale, depth];
    }
}
