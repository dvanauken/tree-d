// SceneView.js - The Scene container: a Three.js view of a TreeModel.
//
// Renderer adapter (pipeline stage 7). Owns the WebGL scene, lights, ground,
// sky, dual cameras (perspective / orthographic), orbit control, and a human
// scale figure. It converts a TreeModel into wood + leaf geometry and displays
// it; it decides nothing about morphology. Rendering is on-demand.

import * as THREE from '../../vendor/three.module.js';
import { OrbitController } from './OrbitController.js';
import { buildWoodGeometry, buildLeafMesh } from './treeGeometry.js';

const SKY_TOP = '#5b9bd5';
const SKY_BOTTOM = '#d4ebf7';
const GRASS = 0x2e5e34;

export class SceneView {
    constructor(container) {
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        const cv = this.renderer.domElement;
        cv.style.display = 'block';
        cv.style.width = '100%';
        cv.style.height = '100%';
        cv.style.touchAction = 'none';
        container.appendChild(cv);

        this.scene = new THREE.Scene();
        this.scene.background = makeSky();

        // Lighting: outdoor hemisphere + key directional + a little fill.
        this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x47602f, 0.95));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(80, 50, 140);
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.12));

        this._addGround();

        // Dual cameras share the orbit controller.
        this.fov = 45;
        this.persp = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 100000);
        this.persp.up.set(0, 0, 1);
        this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100000);
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

        this.renderMode = 'texture'; // 'texture' | 'mesh'
        this.showLeaves = false;
        this.showGrid = true;
        this.showFigure = true;

        this.figure = makeFigure();
        this.scene.add(this.figure);

        this._lastModel = null;
        this._raf = 0;
        this._w = 1;
        this._h = 1;

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

        this.leafMesh = buildLeafMesh(model.leaves);
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
        this.controls.target.set(
            (b.min[0] + b.max[0]) / 2,
            (b.min[1] + b.max[1]) / 2,
            (b.min[2] + b.max[2]) / 2,
        );
        const size = Math.max(
            b.max[0] - b.min[0],
            b.max[1] - b.min[1],
            b.max[2] - b.min[2],
        );
        this.controls.radius = size * 1.4 + 8;
    }

    fit() {
        if (this._lastModel) this.frame(this._lastModel);
        this._updateCamera();
        this.requestRender();
    }

    // --- View toggles ------------------------------------------------------

    setProjection(mode) { this.projection = mode; this._updateCamera(); this.requestRender(); }
    setRenderMode(mode) {
        this.renderMode = mode;
        if (this.wood) this.wood.material.wireframe = mode === 'mesh';
        this.requestRender();
    }
    setShowLeaves(on) { this.showLeaves = on; if (this.leafMesh) this.leafMesh.visible = on; this.requestRender(); }
    setShowGrid(on) { this.showGrid = on; if (this.grid) this.grid.visible = on; this.requestRender(); }
    setShowFigure(on) { this.showFigure = on; this.figure.visible = on; this.requestRender(); }

    // --- Internals ---------------------------------------------------------

    _woodMaterial() {
        return new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0,
            flatShading: true,
            wireframe: this.renderMode === 'mesh',
        });
    }

    _addGround() {
        const mat = new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1, metalness: 0 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat);
        this.scene.add(plane); // PlaneGeometry lies in XY (normal +Z) = horizontal ground

        const grid = new THREE.GridHelper(400, 40, 0x3f7046, 0x356b3d);
        grid.rotation.x = Math.PI / 2; // XZ -> XY
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
        const halfH = r * Math.tan(THREE.MathUtils.degToRad(this.fov) / 2);
        const halfW = halfH * aspect;
        this.ortho.left = -halfW;
        this.ortho.right = halfW;
        this.ortho.top = halfH;
        this.ortho.bottom = -halfH;
        this.ortho.updateProjectionMatrix();
        this.persp.aspect = aspect;
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

// --- Scene props ----------------------------------------------------------

function makeSky() {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(c);
}

// A simple 6-ft human figure for scale, standing in +Z.
function makeFigure() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.8, metalness: 0 });
    const part = (w, d, h, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
        m.position.set(x, 0, z);
        g.add(m);
        return m;
    };
    part(0.26, 0.26, 3.0, -0.18, 1.5); // left leg
    part(0.26, 0.26, 3.0, 0.18, 1.5); // right leg
    part(0.72, 0.36, 2.0, 0, 4.0); // torso
    part(0.2, 0.2, 1.8, -0.52, 4.1); // left arm
    part(0.2, 0.2, 1.8, 0.52, 4.1); // right arm
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mat);
    head.position.set(0, 0, 5.55);
    g.add(head);
    return g;
}
