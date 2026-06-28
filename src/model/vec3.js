// vec3.js - Minimal 3D vector + scalar math for the model layer.
//
// Pure functions, no rendering dependencies. Vectors are plain [x, y, z]
// arrays in world units (feet). Used by skeleton generation and projection.

export const add   = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub   = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot   = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

export const len = (a) => Math.hypot(a[0], a[1], a[2]);

export const normalize = (a) => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};

// Rotate vector v around unit axis k by angle (radians) — Rodrigues' formula.
export const rotateAxis = (v, k, angle) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const kv = cross(k, v);
    const kd = dot(k, v) * (1 - c);
    return [
        v[0] * c + kv[0] * s + k[0] * kd,
        v[1] * c + kv[1] * s + k[1] * kd,
        v[2] * c + kv[2] * s + k[2] * kd,
    ];
};

// A unit vector perpendicular to d (stable choice).
export const perp = (d) => {
    const a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return normalize(cross(d, a));
};

// --- Scalar helpers ---------------------------------------------------------

export const lerp  = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const deg   = (d) => (d * Math.PI) / 180;
