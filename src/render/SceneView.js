// SceneView.js - The Scene container: a Three.js view of a TreeModel.
//
// Renderer adapter (pipeline stage 7). Owns the WebGL scene, lighting, ground,
// sky, dual cameras (perspective / orthographic), orbit control, and a human
// scale figure. Aims for a serious outdoor render: filmic tone mapping, sRGB
// output, soft sun shadows, textured bark + grass, and atmospheric fog.

import * as THREE from '../../vendor/three.module.js';
import { OrbitController } from './OrbitController.js';
import { buildWoodGeometry, buildLeafMesh } from './treeGeometry.js';
import { makeLeafTexture, makeSkyTexture, makeGroundTexture } from './textures.js';

export class SceneView {
    constructor(container) {
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        const cv = this.renderer.domElement;
        cv.style.display = 'block';
        cv.style.width = '100%';
        cv.style.height = '100%';
        cv.style.touchAction = 'none';
        cv.tabIndex = 0;
        cv.setAttribute('role', 'img');
        cv.setAttribute(
            'aria-label',
            'Interactive 3D tree viewport. Drag to orbit, Shift-drag or right-drag to pan, scroll to zoom. When focused, arrow keys orbit, Shift plus arrow keys pan, plus and minus zoom, and Home fits the tree.',
        );
        container.appendChild(cv);

        this.tex = { leaf: makeLeafTexture() };

        this.scene = new THREE.Scene();
        this.scene.background = makeSkyTexture();
        // Fog color matches sky horizon so the far ground fades naturally.
        this.scene.fog = new THREE.Fog(0xc8dff5, 300, 1800);

        // Lighting: warm key sun (shadows) + cool sky/ground hemisphere.
        this.scene.add(new THREE.HemisphereLight(0xa9d4ff, 0x7a9a60, 1.4));
        this.sun = new THREE.DirectionalLight(0xfff3e0, 0.9);
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);
        const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
        fill.position.set(-80, -60, 60);
        this.scene.add(fill);

        this._addGround();

        this.fov = 45;
        this.orthoScaleFov = 45;
        this.persp = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 100000);
        this.persp.up.set(0, 0, 1);
        this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 100000);
        this.ortho.up.set(0, 0, 1);
        this.projection = 'perspective';

        this.controls = new OrbitController(cv, () => {
            this._updateCamera();
            this.requestRender();
        });

        this.treeGroup = new THREE.Group();
        this.scene.add(this.treeGroup);
        this.wood = null;
        this.leafMesh = null;

        this.renderMode = 'texture';
        this.showLeaves = false;
        this.showGrid = true;
        this.showFigure = true;

        this.figure = makeFigure();
        this.scene.add(this.figure);

        this._lastModel = null;
        this._raf = 0;
        this._w = 1;
        this._h = 1;
        this._frameSize = 120;

        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(container);
        this._resize();
    }

    activeCamera() {
        return this.projection === 'perspective' ? this.persp : this.ortho;
    }

    setModel(model, refit = true) {
        this._lastModel = model;
        this._clearTree();

        this.wood = new THREE.Mesh(buildWoodGeometry(model.skeleton), this._woodMaterial());
        this.treeGroup.add(this.wood);

        this.leafMesh = buildLeafMesh(model.leaves, this.tex.leaf);
        if (this.leafMesh) {
            this.leafMesh.visible = this.showLeaves;
            this.treeGroup.add(this.leafMesh);
        }

        const baseR = model.skeleton.nodes[0] ? model.skeleton.nodes[0].radius : 1;
        this.figure.position.set(baseR + 3, 0, 0);

        if (refit) this.frame(model);
        this._updateCamera();
        this.requestRender();
    }

    frame(model) {
        const b = model.skeleton.bounds;
        const cx = (b.min[0] + b.max[0]) / 2;
        const cy = (b.min[1] + b.max[1]) / 2;
        const cz = (b.min[2] + b.max[2]) / 2;

        const dx = b.max[0] - b.min[0];
        const dy = b.max[1] - b.min[1];
        const dz = b.max[2] - b.min[2];
        const size = Math.max(dx, dy, dz, 1);
        const sphereRadius = Math.max(Math.hypot(dx, dy, dz) * 0.5, 1);
        const aspect = Math.max(this._w / this._h, 0.1);
        const fitFovDegrees = this.projection === 'perspective' ? this.fov : this.orthoScaleFov;
        const vFov = THREE.MathUtils.degToRad(fitFovDegrees);
        const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
        const fitFov = Math.max(Math.min(vFov, hFov), 0.1);
        const cameraRadius = (sphereRadius / Math.sin(fitFov * 0.5)) * 1.08;
        this._frameSize = size;
        this.controls.setFrame(
            new THREE.Vector3(cx, cy, cz),
            cameraRadius,
            {
                minRadius: Math.max(sphereRadius * 0.18, 2),
                maxRadius: Math.max(cameraRadius * 8, 200),
            },
        );

        const d = size * 2.2;
        this.sun.position.set(cx + d * 0.55, cy + d * 0.35, cz + d);
        this.sun.target.position.set(cx, cy, cz);
    }

    fit() {
        if (this._lastModel) this.frame(this._lastModel);
        this._updateCamera();
        this.requestRender();
    }

    zoom(factor) {
        this.controls.setRadius(this.controls.radius * factor);
        this._updateCamera();
        this.requestRender();
    }

    setFieldOfView(degrees) {
        this.fov = THREE.MathUtils.clamp(degrees, 20, 85);
        this._updateCamera();
        this.requestRender();
    }

    setView(preset) {
        const ctrl = this.controls;
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.orthoScaleFov) / 2);
        const aspect  = Math.max(this._w / this._h, 0.1);

        // Fit a 2D rectangle (screenW × screenH in world units) into the ortho frame.
        const rectFit = (w, h, pad = 0.55) => {
            const rH = (h * pad) / tanHalf;
            const rW = (w * pad) / (aspect * tanHalf);
            return Math.max(rH, rW, 10);
        };

        if (preset === 'plan') {
            ctrl.elevation = Math.PI * 0.499;   // near-vertical, avoids gimbal
            this.projection = 'ortho';
            if (this._lastModel) {
                const b = this._lastModel.skeleton.bounds;
                ctrl.target.set(
                    (b.min[0] + b.max[0]) / 2,
                    (b.min[1] + b.max[1]) / 2,
                    (b.min[2] + b.max[2]) / 2,
                );
                ctrl.setRadius(rectFit(b.max[0] - b.min[0], b.max[1] - b.min[1]));
            }
        } else if (preset === 'elev') {
            ctrl.elevation = 0.0;
            this.projection = 'ortho';
            if (this._lastModel) {
                const b = this._lastModel.skeleton.bounds;
                const treeW = b.max[0] - b.min[0];
                const treeH = b.max[2] - b.min[2];
                // Center the view on the tree; base of tree sits near the bottom.
                ctrl.target.set(
                    (b.min[0] + b.max[0]) / 2,
                    (b.min[1] + b.max[1]) / 2,
                    b.min[2] + treeH / 2,
                );
                ctrl.setRadius(rectFit(treeW, treeH));
            }
        } else if (preset === 'eye') {
            ctrl.elevation = 0.08;              // ~5° — ground stays in frame
            ctrl.target.z = 6;                  // eye height in feet
            this.projection = 'perspective';
            if (this._lastModel) {
                const b = this._lastModel.skeleton.bounds;
                const spread = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 1);
                ctrl.setRadius(Math.max(spread * 1.1, 30));
            }
        }
        this._updateCamera();
        this.requestRender();
        return this.projection;
    }

    setProjection(mode) {
        this.projection = mode;
        this._updateCamera();
        this.requestRender();
    }
    setRenderMode(mode) {
        this.renderMode = mode;
        if (this.wood) this.wood.material.wireframe = mode === 'mesh';
        this.requestRender();
    }
    setShowLeaves(on) { this.showLeaves = on; if (this.leafMesh) this.leafMesh.visible = on; this.requestRender(); }
    setShowGrid(on) { this.showGrid = on; if (this.grid) this.grid.visible = on; this.requestRender(); }
    setShowFigure(on) { this.showFigure = on; this.figure.visible = on; this.requestRender(); }

    _woodMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.9,
            metalness: 0,
            side: THREE.DoubleSide,
            wireframe: this.renderMode === 'mesh',
        });
    }

    _addGround() {
        const mat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat);
        this.scene.add(plane);

        // Subtle reference grid (toggleable), close in tone to the ground.
        const grid = new THREE.GridHelper(400, 40, 0x4a5b40, 0x4a5b40);
        grid.material.transparent = true;
        grid.material.opacity = 0.15;
        grid.rotation.x = Math.PI / 2;
        grid.position.z = 0.05;
        this.grid = grid;
        this.scene.add(grid);
    }

    _clearTree() {
        if (this.wood) {
            this.treeGroup.remove(this.wood);
            this.wood.geometry.dispose();
            this.wood.material.dispose();
            this.wood = null;
        }
        if (this.leafMesh) {
            this.treeGroup.remove(this.leafMesh);
            this.leafMesh.geometry.dispose();
            this.leafMesh.material.dispose();
            this.leafMesh = null;
        }
    }

    _updateCamera() {
        const aspect = this._w / this._h;
        const r = this.controls.radius;
        const halfH = r * Math.tan(THREE.MathUtils.degToRad(this.orthoScaleFov) / 2);
        const halfW = halfH * aspect;
        this.ortho.left = -halfW;
        this.ortho.right = halfW;
        this.ortho.top = halfH;
        this.ortho.bottom = -halfH;
        this.ortho.updateProjectionMatrix();
        this.persp.aspect = aspect;
        this.persp.fov = this.fov;
        this.persp.near = Math.max(0.05, r / 2000);
        this.persp.far = Math.max(1000, r + this._frameSize * 6);
        this.persp.updateProjectionMatrix();
        this.controls.apply(this.activeCamera());
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (!w || !h) return;
        this._w = w;
        this._h = h;
        this.renderer.setSize(w, h, false);
        this._updateCamera();
        this.requestRender();
    }

    requestRender() {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            this.renderer.render(this.scene, this.activeCamera());
        });
    }
}

// A simple 6-ft human figure for scale, standing in +Z.
function makeFigure() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.7, metalness: 0 });
    const part = (w, d, h, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
        m.position.set(x, 0, z);
        m.castShadow = true;
        g.add(m);
    };
    part(0.26, 0.26, 3.0, -0.18, 1.5);
    part(0.26, 0.26, 3.0, 0.18, 1.5);
    part(0.72, 0.36, 2.0, 0, 4.0);
    part(0.2, 0.2, 1.8, -0.52, 4.1);
    part(0.2, 0.2, 1.8, 0.52, 4.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat);
    head.position.set(0, 0, 5.55);
    head.castShadow = true;
    g.add(head);
    return g;
}
