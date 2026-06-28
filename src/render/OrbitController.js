// OrbitController.js - Minimal z-up orbit camera controller.
//
// Left-drag: orbit (azimuth + elevation).
// Right-drag or Shift+left-drag: pan (translate target in screen plane).
// Scroll wheel: dolly (change radius).
// Two-finger touch: pinch to zoom, drag to pan.
// Keyboard, when focused: arrows orbit, Shift+arrows pan, +/- zoom, Home fits.
// World up is +Z.

import * as THREE from '../../vendor/three.module.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class OrbitController {
    constructor(domElement, onChange) {
        this.el = domElement;
        this.onChange = onChange;

        this.target = new THREE.Vector3(0, 0, 20);
        this.homeTarget = this.target.clone();
        this.radius = 120;
        this.homeRadius = this.radius;
        this.minRadius = 1;
        this.maxRadius = 100000;
        this.azimuth = Math.PI * 0.25;
        this.elevation = 0.08;
        this.minEl = 0.0;
        this.maxEl = 1.45;
        this.rotateSpeed = 0.006;
        this.zoomSpeed = 0.0015;
        this.keyRotateStep = 0.08;

        this._drag = null;
        this._pointers = new Map();
        this._pinch = null;
        this._bind();
    }

    setFrame(target, radius, { minRadius, maxRadius } = {}) {
        this.homeTarget.copy(target);
        this.homeRadius = radius;
        if (minRadius != null) this.minRadius = minRadius;
        if (maxRadius != null) this.maxRadius = maxRadius;
        this.target.copy(target);
        this.setRadius(radius);
    }

    resetFrame() {
        this.target.copy(this.homeTarget);
        this.setRadius(this.homeRadius);
        this._notify();
    }

    setRadius(radius) {
        this.radius = clamp(radius, this.minRadius, this.maxRadius);
    }

    _bind() {
        this.el.addEventListener('contextmenu', (e) => e.preventDefault());

        this.el.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button > 2) return;
            e.preventDefault();
            if (this.el.focus) this.el.focus({ preventScroll: true });

            const isPan = e.button === 2 || e.button === 1 || e.shiftKey;
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: isPan };
            this.el.setPointerCapture(e.pointerId);

            if (this._pointers.size === 2) this._pinch = this._pinchState();
        });

        this.el.addEventListener('pointermove', (e) => {
            if (!this._pointers.has(e.pointerId)) return;
            e.preventDefault();

            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this._pinch && this._pointers.size >= 2) {
                const next = this._pinchState();
                if (!next) return;
                const dx = next.cx - this._pinch.cx;
                const dy = next.cy - this._pinch.cy;
                if (next.distance > 1 && this._pinch.distance > 1) {
                    this.setRadius(this.radius * (this._pinch.distance / next.distance));
                }
                this._pan(dx, dy);
                this._pinch = next;
                this._notify();
                return;
            }

            if (!this._drag || this._drag.id !== e.pointerId) return;
            const dx = e.clientX - this._drag.x;
            const dy = e.clientY - this._drag.y;
            this._drag.x = e.clientX;
            this._drag.y = e.clientY;

            if (this._drag.pan || e.shiftKey) {
                this._pan(dx, dy);
            } else {
                this.azimuth -= dx * this.rotateSpeed;
                this.elevation = clamp(this.elevation - dy * this.rotateSpeed, this.minEl, this.maxEl);
            }
            this._notify();
        });

        const end = (e) => {
            this._pointers.delete(e.pointerId);
            if (this.el.hasPointerCapture?.(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
            if (this._drag && this._drag.id === e.pointerId) this._drag = null;
            this._pinch = this._pointers.size >= 2 ? this._pinchState() : null;
        };
        this.el.addEventListener('pointerup', end);
        this.el.addEventListener('pointercancel', end);

        this.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.clientHeight : 1;
            this.setRadius(this.radius * Math.exp(e.deltaY * unit * this.zoomSpeed));
            this._notify();
        }, { passive: false });

        this.el.addEventListener('keydown', (e) => this._key(e));
    }

    // Move the orbit target in the camera's screen plane.
    // Dragging right/down moves the world with the pointer (grab feel).
    _pan(dx, dy) {
        const az = this.azimuth;
        const el = this.elevation;
        const speed = this.radius * 0.0015;

        // Screen-right vector (horizontal, independent of elevation)
        const rx = -Math.sin(az);
        const ry =  Math.cos(az);

        // Screen-up vector (tilted by elevation)
        const ux = -Math.cos(az) * Math.sin(el);
        const uy = -Math.sin(az) * Math.sin(el);
        const uz = Math.cos(el);

        this.target.x -= (dx * rx - dy * ux) * speed;
        this.target.y -= (dx * ry - dy * uy) * speed;
        this.target.z -= (         - dy * uz) * speed;
    }

    _pinchState() {
        const pts = [...this._pointers.values()];
        if (pts.length < 2) return null;
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return {
            cx: (a.x + b.x) * 0.5,
            cy: (a.y + b.y) * 0.5,
            distance: Math.hypot(dx, dy),
        };
    }

    _key(e) {
        const fast = e.altKey ? 0.35 : e.ctrlKey ? 2.5 : 1;
        const panStep = 34 * fast;
        const rotStep = this.keyRotateStep * fast;
        let used = true;

        switch (e.key) {
        case 'ArrowLeft':
            if (e.shiftKey) this._pan(-panStep, 0);
            else this.azimuth += rotStep;
            break;
        case 'ArrowRight':
            if (e.shiftKey) this._pan(panStep, 0);
            else this.azimuth -= rotStep;
            break;
        case 'ArrowUp':
            if (e.shiftKey) this._pan(0, -panStep);
            else this.elevation = clamp(this.elevation + rotStep, this.minEl, this.maxEl);
            break;
        case 'ArrowDown':
            if (e.shiftKey) this._pan(0, panStep);
            else this.elevation = clamp(this.elevation - rotStep, this.minEl, this.maxEl);
            break;
        case '+':
        case '=':
            this.setRadius(this.radius * 0.86);
            break;
        case '-':
        case '_':
            this.setRadius(this.radius / 0.86);
            break;
        case 'Home':
        case '0':
            this.target.copy(this.homeTarget);
            this.setRadius(this.homeRadius);
            break;
        default:
            used = false;
        }

        if (!used) return;
        e.preventDefault();
        this._notify();
    }

    _notify() {
        if (this.onChange) this.onChange();
    }

    position() {
        const ce = Math.cos(this.elevation);
        const se = Math.sin(this.elevation);
        const ca = Math.cos(this.azimuth);
        const sa = Math.sin(this.azimuth);
        return new THREE.Vector3(
            this.target.x + this.radius * ce * ca,
            this.target.y + this.radius * ce * sa,
            this.target.z + this.radius * se,
        );
    }

    apply(camera) {
        camera.position.copy(this.position());
        camera.up.set(0, 0, 1);
        camera.lookAt(this.target);
    }
}
