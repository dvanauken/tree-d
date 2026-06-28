// SceneView.js - The Scene container: a Three.js view of a TreeModel.
//
// Renderer adapter (pipeline stage 7). Owns the WebGL scene, lighting, ground,
// sky, dual cameras (perspective / orthographic), orbit control, and a human
// scale figure. Aims for a serious outdoor render: filmic tone mapping, sRGB
// output, soft sun shadows, textured bark + grass, and atmospheric fog.

import * as THREE from '../../vendor/three.module.js';
import { OrbitController } from './OrbitController.js';
import { buildWoodGeometry, buildLeafMesh } from './treeGeometry.js';
import { makeLeafTexture, makeSkyTexture } from './textures.js';

const GROUND = 0x5f7351;

export class SceneView {
    constructor(container) {
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const cv = this.renderer.domElement;
        cv.style.display = 'block';
        cv.style.width = '100%';
        cv.style.height = '100%';
        cv.style.touchAction = 'none';
        container.appendChild(cv);

        this.tex = { leaf: makeLeafTexture() };

        this.scene = new THREE.Scene();
        this.scene.background = makeSkyTexture();

        // Lighting: warm key sun (shadows) + cool sky/ground hemisphere.
        this.scene.add(new THREE.HemisphereLight(0xa9d4ff, 0x4a5f38, 0.6));
        this.sun = new THREE.DirectionalLight(0xfff3e0, 2.7);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.bias = -0.0005;
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);
        const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
        fill.position.set(-80, -60, 60);
        this.scene.add(fill);

        this._addGround();

        this.fov = 45;
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
        this.wood.castShadow = true;
        this.wood.receiveShadow = true;
        this.treeGroup.add(this.wood);

        this.leafMesh = buildLeafMesh(model.leaves, this.tex.leaf);
        if (this.leafMesh) {
            this.leafMesh.visible = this.showLeaves;
            this.leafMesh.castShadow = false; // alpha-cut shadows would be square
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
        this.controls.target.set(cx, cy, cz);

        const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
        this.controls.radius = size * 1.4 + 8;

        // Sun + shadow frustum sized to the tree.
        const d = size * 2.2;
        this.sun.position.set(cx + d * 0.55, cy + d * 0.35, cz + d);
        this.sun.target.position.set(cx, cy, cz);
        const sc = this.sun.shadow.camera;
        sc.left = -size; sc.right = size;
        sc.top = size; sc.bottom = -size;
        sc.near = size * 0.4;
        sc.far = d * 2.4;
        sc.updateProjectionMatrix();
    }

    fit() {
        if (this._lastModel) this.frame(this._lastModel);
        this._updateCamera();
        this.requestRender();
    }

    setProjection(mode) { this.projection = mode; this._updateCamera(); this.requestRender(); }
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
            wireframe: this.renderMode === 'mesh',
        });
    }

    _addGround() {
        const mat = new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1, metalness: 0 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat);
        plane.receiveShadow = true;
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
