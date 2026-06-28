// OrbitController.js - Minimal z-up orbit camera controller.
//
// The OrbitControls addon isn't bundled with our local Three.js build, and a
// small local controller keeps tree-d self-contained. Drag orbits (azimuth +
// elevation) around a target; the wheel dollies in/out. World up is +Z.

import * as THREE from '../../vendor/three.module.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class OrbitController {
    constructor(domElement, onChange) {
        this.el = domElement;
        this.onChange = onChange;

        this.target = new THREE.Vector3(0, 0, 20);
        this.radius = 120;
        this.azimuth = Math.PI * 0.25;
        this.elevation = 0.5; // radians above the horizon
        this.minEl = -0.2;
        this.maxEl = 1.45;

        this._drag = null;
        this._bind();
    }

    _bind() {
        this.el.addEventListener('pointerdown', (e) => {
            this._drag = { x: e.clientX, y: e.clientY };
            this.el.setPointerCapture(e.pointerId);
        });
        this.el.addEventListener('pointermove', (e) => {
            if (!this._drag) return;
            const dx = e.clientX - this._drag.x;
            const dy = e.clientY - this._drag.y;
            this._drag = { x: e.clientX, y: e.clientY };
            this.azimuth -= dx * 0.008;
            this.elevation = clamp(this.elevation + dy * 0.008, this.minEl, this.maxEl);
            if (this.onChange) this.onChange();
        });
        const end = () => { this._drag = null; };
        this.el.addEventListener('pointerup', end);
        this.el.addEventListener('pointercancel', end);
        this.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.radius = clamp(this.radius * (e.deltaY < 0 ? 0.9 : 1 / 0.9), 1, 100000);
            if (this.onChange) this.onChange();
        }, { passive: false });
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
