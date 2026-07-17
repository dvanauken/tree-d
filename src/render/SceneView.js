// SceneView.js - The Scene container: a Three.js view of a TreeModel.
//
// Renderer adapter (pipeline stage 7). Owns the WebGL scene, lighting, ground,
// sky, dual cameras (perspective / orthographic), orbit control, and a human
// scale figure. Aims for a photoreal outdoor render with NO image assets:
// filmic tone mapping, sRGB output, a PROCEDURAL PMREM environment map for
// image-based lighting, a soft VSM sun shadow plus a soft radial contact-shadow
// decal, procedurally furrowed bark maps, glossy leaf cards, and fog.

import * as THREE from '../../vendor/three.module.js';
import { OrbitController } from './OrbitController.js';
import { buildWoodGeometry, buildLeafMesh } from './treeGeometry.js';
import {
    makeLeafTexture, makeSkyTexture, makeGroundTexture,
    makeBarkTextures, makeEnvScene, makeContactShadowTexture,
} from './textures.js';

// ---- Dial these for the look ----------------------------------------------
const LIGHT = {
    sunColor: 0xfff2dc, sunIntensity: 2.7,        // warm key
    skyColor: 0xbcd6ff, groundColor: 0x55633f, hemiIntensity: 0.85, // sky fill
    fillColor: 0xd8e6ff, fillIntensity: 0.35,     // cool bounce
    exposure: 1.0,
    envIntensity: 0.9,    // how much the procedural env map drives ambient/spec
};
const SHADOW = {
    useSunShadow: false,  // sun cast-shadow OFF (user rejected it); grounding is the soft contact decal only
    blurRadius: 6,        // VSM blur (higher = softer)
    mapSize: 2048,
    contactStrength: 0.42,// the SOFT radial blob under the crown (main grounding)
    contactScale: 1.15,   // blob radius as a fraction of crown spread
};
// Default bark surface (hero spec). Generated once; reused across rebuilds.
const DEFAULT_BARK = { color: 0x3a2a1c, roughness: 0.96, fissure: 0.4 };
// ---------------------------------------------------------------------------

export class SceneView {
    constructor(container) {
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = LIGHT.exposure;
        this.renderer.physicallyCorrectLights = true;   // sane intensity falloff
        this.renderer.shadowMap.enabled = false;           // no hard cast shadow on the grass
        this.renderer.shadowMap.type = THREE.VSMShadowMap; // (type kept; unused while disabled)
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

        // Procedural textures. Bark albedo/normal/roughness are generated once
        // (deeply furrowed, matte live-oak) and shared across every limb.
        this.barkBark = { ...DEFAULT_BARK };
        this.barkTex = makeBarkTextures(this.barkBark);
        this.tex = { leaf: makeLeafTexture() };

        this.scene = new THREE.Scene();
        this.scene.background = makeSkyTexture();
        // Fog colour matches the sky horizon so far ground fades into haze.
        this.scene.fog = new THREE.Fog(0xc8dff5, 350, 2200);

        // Sun direction (Z-up world). Warm key from upper front-right.
        this._sunDir = new THREE.Vector3(0.55, 0.35, 1.0).normalize();

        // Procedural image-based lighting via PMREM (no HDRI file).
        this._buildEnvironment();

        // Key sun: warm directional, soft shadow.
        this.sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
        if (SHADOW.useSunShadow) {
            this.sun.castShadow = true;
            this.sun.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
            this.sun.shadow.radius = SHADOW.blurRadius;     // VSM softness
            this.sun.shadow.bias = -0.0004;
            const cam = this.sun.shadow.camera;             // ortho frustum
            cam.near = 1; cam.far = 1200;
            cam.left = -120; cam.right = 120; cam.top = 120; cam.bottom = -120;
        }
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);

        // Sky fill: cool hemisphere (sky over ground bounce).
        this.scene.add(new THREE.HemisphereLight(
            LIGHT.skyColor, LIGHT.groundColor, LIGHT.hemiIntensity));

        // Cool fill from the shadow side, no shadow.
        const fill = new THREE.DirectionalLight(LIGHT.fillColor, LIGHT.fillIntensity);
        fill.position.set(-80, -60, 70);
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
        this.archView = false;   // Architecture View: colour wood by zone

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

        // Thread the species surface params into the geometry so the carved
        // fissures/fluting match the procedural bark maps. trunkFluting lives at
        // profile.trunk.fluting; flatten it onto the surface object the geometry
        // builder reads.
        const profSurface = (model.profile && model.profile.surface) || null;
        const surface = profSurface
            ? { ...profSurface, trunkFluting: model.profile.trunk && model.profile.trunk.fluting }
            : null;
        this._woodSurface = surface;

        this.wood = new THREE.Mesh(
            buildWoodGeometry(model.skeleton, surface, { colorMode: this.archView ? 'zone' : 'bark' }),
            this.archView ? this._archMaterial() : this._woodMaterial(),
        );
        this.wood.castShadow = true;
        this.wood.receiveShadow = true;        // self-shadowing on big limbs
        this.treeGroup.add(this.wood);

        this.leafMesh = buildLeafMesh(model.leaves, this.tex.leaf, {
            colorRange: (model.profile && model.profile.crown && model.profile.crown.colorRange)
                || [0x2f4a1e, 0x6a8c3a],
            sheen: (model.profile && model.profile.surface && model.profile.surface.leaf
                && model.profile.surface.leaf.sheen) ?? 0.3,
        });
        if (this.leafMesh) {
            // Arch view always hides foliage, including across rebuilds.
            this.leafMesh.visible = this.showLeaves && !this.archView;
            this.leafMesh.castShadow = true;   // canopy contributes to the soft shadow
            this.leafMesh.material.envMapIntensity = LIGHT.envIntensity * 0.8;
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

        // Sun sits along the fixed warm direction, scaled to the scene, aiming
        // at the tree centre so the soft shadow lands under the crown.
        const d = size * 2.2;
        this.sun.position.set(
            cx + this._sunDir.x * d,
            cy + this._sunDir.y * d,
            cz + this._sunDir.z * d,
        );
        this.sun.target.position.set(cx, cy, 0);

        // Soft contact shadow scaled to the crown spread, centred under it.
        if (this.contactShadow) {
            const spread = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 1);
            const r = spread * SHADOW.contactScale;
            this.contactShadow.scale.set(r, r, 1);
            this.contactShadow.position.set(cx, cy, 0.03);
        }
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
                ctrl.target.set(
                    (b.min[0] + b.max[0]) / 2,
                    (b.min[1] + b.max[1]) / 2,
                    b.min[2] + treeH / 2,
                );
                ctrl.setRadius(rectFit(treeW, treeH));
            }
        } else if (preset === 'eye') {
            ctrl.elevation = 0.08;              // ~5 deg - ground stays in frame
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
    setShowLeaves(on) { this.showLeaves = on; if (this.leafMesh) this.leafMesh.visible = on && !this.archView; this.requestRender(); }
    setShowGrid(on) { this.showGrid = on; if (this.grid) this.grid.visible = on; this.requestRender(); }
    setShowFigure(on) { this.showFigure = on; this.figure.visible = on; this.requestRender(); }

    // Architecture View: recolour the wood by architectural zone (flat, unlit)
    // and hide the leaves so the structure reads. Returns the model's report.
    setArchView(on) {
        this.archView = on;
        if (this.wood && this._lastModel) {
            const old = this.wood;
            this.treeGroup.remove(old);
            old.geometry.dispose();
            old.material.dispose();
            this.wood = new THREE.Mesh(
                buildWoodGeometry(this._lastModel.skeleton, this._woodSurface, { colorMode: on ? 'zone' : 'bark' }),
                on ? this._archMaterial() : this._woodMaterial(),
            );
            this.wood.castShadow = true;
            this.wood.receiveShadow = true;    // keep parity with setModel
            this.treeGroup.add(this.wood);
        }
        if (this.leafMesh) this.leafMesh.visible = on ? false : this.showLeaves;
        this.requestRender();
        return this._lastModel ? this._lastModel.metadata.architecture : null;
    }

    _archMaterial() {
        return new THREE.MeshBasicMaterial({ vertexColors: true }); // flat, unlit zone colours
    }

    _buildEnvironment() {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader(); // safe warm-up for fromScene
        const envScene = makeEnvScene(THREE, this._sunDir);
        const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1000); // far must exceed the 500-radius env dome (default far=100 clipped it -> dead IBL)
        this.scene.environment = rt.texture;        // drives Standard material IBL
        // (keep scene.background as the crisp sky gradient, not the PMREM blur)
        envScene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        pmrem.dispose();
    }

    _woodMaterial() {
        const b = this.barkBark;
        const m = new THREE.MeshStandardMaterial({
            color: 0xffffff,            // let vertex colour + map define hue
            vertexColors: true,         // mottling / lichen multiply over the map
            map: this.barkTex.map,
            normalMap: this.barkTex.normalMap,
            roughnessMap: this.barkTex.roughnessMap,
            normalScale: new THREE.Vector2(1.0, 1.0),
            roughness: b.roughness,     // matte bark (0.96)
            metalness: 0,               // wood is dielectric
            side: THREE.DoubleSide,
            wireframe: this.renderMode === 'mesh',
        });
        m.envMapIntensity = LIGHT.envIntensity;
        return m; // no clearcoat: live-oak bark is dry and matte
    }

    _addGround() {
        const mat = new THREE.MeshStandardMaterial({
            map: makeGroundTexture(),
            roughness: 1, metalness: 0,
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat);
        plane.receiveShadow = true;          // catches the soft sun shadow
        plane.position.z = 0;
        this.ground = plane;
        this.scene.add(plane);

        // SOFT contact shadow: a blurred radial blob laid flat under the crown.
        // This is the primary, gentle grounding - not a hard dark cast.
        const shMat = new THREE.MeshBasicMaterial({
            map: makeContactShadowTexture(SHADOW.contactStrength),
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            blending: THREE.NormalBlending,
        });
        this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat);
        this.contactShadow.position.z = 0.03;       // avoid z-fighting with grass
        this.contactShadow.renderOrder = 1;
        this.scene.add(this.contactShadow);

        // Subtle reference grid (toggleable), close in tone to the ground.
        const grid = new THREE.GridHelper(400, 40, 0x4a5b40, 0x4a5b40);
        grid.material.transparent = true;
        grid.material.opacity = 0.12;
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
