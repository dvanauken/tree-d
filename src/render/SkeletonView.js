// SkeletonView.js - Renderer adapter: draws a TreeModel skeleton to a canvas.
//
// This is pipeline stage 7 for the skeleton: it converts generated model data
// into a 2D drawing. It decides nothing about morphology - line widths come
// from node radii, positions from node positions, colour from branch order.
// Branches are drawn back-to-front (painter's algorithm) with optional depth
// cueing. Drag orbits the camera; the wheel zooms.

import { Camera } from './projection.js';
import { sub, dot, clamp, lerp } from '../model/vec3.js';

const ORDER_COLORS = {
    trunk: '#4a3526',
    primary: '#5b4231',
    secondary: '#6f5340',
    tertiary: '#867053',
    twig: '#9c8a6b',
};

// Scene colours.
const SKY_TOP = '#5b9bd5'; // deeper blue overhead
const SKY_BOTTOM = '#d4ebf7'; // pale blue toward the horizon
const HAZE = '#cfe6f4'; // distance fade target (atmospheric perspective)
const GRASS = '#2e5e34'; // dark lush green ground
const GRASS_GRID = '#3f7046'; // grid lines on the grass

// Depth cueing blends colours toward a haze colour instead of using alpha:
// translucent round line-caps would otherwise stack at segment joints and read
// as dark beads along thick limbs.
const hexToRgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ORDER_RGB = Object.fromEntries(
    Object.entries(ORDER_COLORS).map(([k, v]) => [k, hexToRgb(v)]),
);
const HAZE_RGB = hexToRgb(HAZE);
const mix = (c, t) => `rgb(${Math.round(lerp(HAZE_RGB[0], c[0], t))},`
    + `${Math.round(lerp(HAZE_RGB[1], c[1], t))},`
    + `${Math.round(lerp(HAZE_RGB[2], c[2], t))})`;

export class SkeletonView {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'viewport-canvas';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.camera = new Camera();
        this.model = null;
        this.showGrid = true;
        this.depthCue = true;
        this.showFigure = true;

        this._drag = null;
        this._w = 0;
        this._h = 0;

        this._bindEvents();
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(container);
        this._resize();
    }

    setModel(model) {
        this.model = model;
        this.fit();
        this.redraw();
    }

    // Frame the model: centre the camera on its bounds and pick a scale that
    // fits the projected extent into the viewport.
    fit() {
        if (!this.model) return;
        const b = this.model.skeleton.bounds;
        const center = [
            (b.min[0] + b.max[0]) / 2,
            (b.min[1] + b.max[1]) / 2,
            (b.min[2] + b.max[2]) / 2,
        ];
        this.camera.target = center;

        const basis = this.camera.basis();
        let minu = Infinity, maxu = -Infinity, minv = Infinity, maxv = -Infinity;
        for (const n of this.model.skeleton.nodes) {
            const v = sub(n.position, center);
            const sr = dot(v, basis.right);
            const su = dot(v, basis.up);
            if (sr < minu) minu = sr;
            if (sr > maxu) maxu = sr;
            if (su < minv) minv = su;
            if (su > maxv) maxv = su;
        }
        const ew = Math.max(1e-3, maxu - minu);
        const eh = Math.max(1e-3, maxv - minv);
        const margin = 0.85;
        this.camera.scale = Math.min(
            (this._w || 800) * margin / ew,
            (this._h || 600) * margin / eh,
        );
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.canvas.width = Math.max(1, Math.round(w * dpr));
        this.canvas.height = Math.max(1, Math.round(h * dpr));
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._w = w;
        this._h = h;
        this.redraw();
    }

    _bindEvents() {
        this.canvas.addEventListener('pointerdown', (e) => {
            this._drag = { x: e.clientX, y: e.clientY };
            this.canvas.setPointerCapture(e.pointerId);
        });
        this.canvas.addEventListener('pointermove', (e) => {
            if (!this._drag) return;
            const dx = e.clientX - this._drag.x;
            const dy = e.clientY - this._drag.y;
            this._drag = { x: e.clientX, y: e.clientY };
            this.camera.yaw -= dx * 0.008;
            this.camera.pitch = clamp(this.camera.pitch + dy * 0.008, -0.25, 1.45);
            this.redraw();
        });
        const end = () => { this._drag = null; };
        this.canvas.addEventListener('pointerup', end);
        this.canvas.addEventListener('pointercancel', end);
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.scale *= e.deltaY < 0 ? 1.1 : 1 / 1.1;
            this.redraw();
        }, { passive: false });
    }

    redraw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const W = this._w;
        const H = this._h;

        // Sky: vertical blue gradient backdrop.
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, SKY_TOP);
        sky.addColorStop(1, SKY_BOTTOM);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        if (!this.model) return;

        const cx = W / 2;
        const cy = H / 2;
        const cam = this.camera;

        if (this.showGrid) this._drawGround(cx, cy);

        // Flatten paths into camera-projected segments.
        const nodes = this.model.skeleton.nodes;
        const segs = [];
        for (const path of this.model.skeleton.paths) {
            const ids = path.nodeIds;
            for (let i = 0; i < ids.length - 1; i++) {
                const A = nodes[ids[i]];
                const B = nodes[ids[i + 1]];
                const pa = cam.project(A.position, cx, cy);
                const pb = cam.project(B.position, cx, cy);
                segs.push({
                    pa, pb,
                    depth: (pa[2] + pb[2]) / 2,
                    r: (A.radius + B.radius) / 2,
                    order: path.order,
                });
            }
        }

        // Painter's algorithm: far (small depth) first.
        segs.sort((a, b) => a.depth - b.depth);

        let dmin = Infinity, dmax = -Infinity;
        for (const s of segs) {
            if (s.depth < dmin) dmin = s.depth;
            if (s.depth > dmax) dmax = s.depth;
        }
        const drange = Math.max(1e-3, dmax - dmin);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const s of segs) {
            ctx.beginPath();
            ctx.moveTo(s.pa[0], s.pa[1]);
            ctx.lineTo(s.pb[0], s.pb[1]);
            ctx.lineWidth = Math.max(0.5, s.r * 2 * cam.scale);
            const rgb = ORDER_RGB[s.order] || [85, 85, 85];
            // Far segments fade toward the background; near segments full colour.
            const t = this.depthCue ? 0.55 + 0.45 * ((s.depth - dmin) / drange) : 1;
            ctx.strokeStyle = mix(rgb, t);
            ctx.stroke();
        }
    }

    _drawGround(cx, cy) {
        const ctx = this.ctx;
        const cam = this.camera;
        const b = this.model.skeleton.bounds;
        const step = 10; // feet
        const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 0.75 + step;
        const ext = Math.ceil(span / step) * step;

        // Grass: fill the z=0 ground quad. Its far edge reads as the horizon
        // against the sky gradient.
        const corners = [
            [-ext, -ext, 0], [ext, -ext, 0], [ext, ext, 0], [-ext, ext, 0],
        ].map((p) => cam.project(p, cx, cy));
        ctx.fillStyle = GRASS;
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = GRASS_GRID;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        for (let g = -ext; g <= ext; g += step) {
            const a1 = cam.project([g, -ext, 0], cx, cy);
            const a2 = cam.project([g, ext, 0], cx, cy);
            ctx.beginPath();
            ctx.moveTo(a1[0], a1[1]);
            ctx.lineTo(a2[0], a2[1]);
            ctx.stroke();

            const c1 = cam.project([-ext, g, 0], cx, cy);
            const c2 = cam.project([ext, g, 0], cx, cy);
            ctx.beginPath();
            ctx.moveTo(c1[0], c1[1]);
            ctx.lineTo(c2[0], c2[1]);
            ctx.stroke();
        }
    }
}
