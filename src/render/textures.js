// textures.js - Runtime PROCEDURAL canvas textures for the scene.
//
// HARD RULE: no image files. Every map here is computed in code (gradients,
// value-noise fbm, Sobel) on a <canvas>, or built from geometry + vertex colour
// (the env dome). Photoreal detail comes from these procedural maps, the
// geometry, the materials and the lighting - never a .jpg/.png/.hdr asset.
//
// Exports:
//   makeSkyTexture()            - crisp sky gradient backdrop (scene.background)
//   makeGroundTexture()         - radial grass vignette for the ground plane
//   makeLeafTexture()           - live-oak leaf-spray alpha card
//   makeBarkTextures(bark)      - { map, normalMap, roughnessMap } furrowed bark
//   makeEnvScene(THREE, sunDir) - tiny sky scene for PMREMGenerator.fromScene
//   makeContactShadowTexture()  - soft radial blob to ground the tree

import * as THREE from '../../vendor/three.module.js';

// Blue sky gradient: deep blue at zenith fading to pale horizon.
export function makeSkyTexture() {
    const c = canvas(4, 512);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#1a6bbf');   /* deep sky blue at top */
    g.addColorStop(0.5, '#5ba3e0');   /* mid blue */
    g.addColorStop(1.0, '#c8dff5');   /* pale blue-white at horizon */
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

// ---------------------------------------------------------------------------
// GROUND VIGNETTE / GRADIENT
// Radial: lit grass-green near the tree, easing to a darker, hazier ring so the
// plane keeps reading as ground at grazing angles and never goes pure black.
// Mapped so its centre sits under the tree (ClampToEdge, no tiling).
// ---------------------------------------------------------------------------
export function makeGroundTexture() {
    const s = 512;
    const c = canvas(s, s);
    const x = c.getContext('2d');

    // Base fill so corners never fall to pure black.
    x.fillStyle = '#13300c';
    x.fillRect(0, 0, s, s);

    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.62);
    g.addColorStop(0.0, '#244e15');  // lit grass directly under/around tree
    g.addColorStop(0.5, '#1b3d10');  // mid
    g.addColorStop(1.0, '#102a0b');  // hazy darker ring toward horizon
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);

    // Faint procedural mottling so the plane isn't a perfect gradient.
    let seed = 91;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    x.globalAlpha = 0.06;
    for (let i = 0; i < 900; i++) {
        x.fillStyle = rnd() > 0.5 ? '#2c5a1b' : '#0c2208';
        const r = 1 + rnd() * 3;
        x.beginPath();
        x.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
        x.fill();
    }
    x.globalAlpha = 1;

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
}

// ---------------------------------------------------------------------------
// LEAF CLUSTER ALPHA  (live oak / Quercus virginiana)
//
// Live-oak leaves are SMALL, oblong/elliptic, entire-margined, glossy dark
// evergreen above and paler beneath. A single canopy card here stands for a
// tight spray of a few such leaves: a handful of overlapping small ellipses,
// each with a faint midrib and a soft specular sheen streak, so back-lighting
// and the leaf interior read without any photographic texture. Mostly opaque in
// the leaf bodies, fully transparent between them -> crisp alphaTest silhouette.
// ---------------------------------------------------------------------------
export function makeLeafTexture() {
    const s = 128;
    const c = canvas(s, s);
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    x.translate(s / 2, s / 2);

    let seed = 17;
    const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    // One oblong live-oak leaflet: dark glossy body, paler midrib, sheen streak.
    function leaflet(px, py, rx, ry, rot) {
        x.save();
        x.translate(px, py);
        x.rotate(rot);

        // Body: vertical gradient gives a subtle volumetric shaded edge.
        const g = x.createLinearGradient(0, -ry, 0, ry);
        g.addColorStop(0.0, '#3f6e2c');   // lit upper edge
        g.addColorStop(0.45, '#2c5320');  // glossy dark mid
        g.addColorStop(1.0, '#1c3a16');   // shaded lower edge
        x.fillStyle = g;
        x.beginPath();
        leafOutline(x, rx, ry);
        x.fill();

        // Midrib: thin paler central vein.
        x.strokeStyle = 'rgba(150,185,110,0.55)';
        x.lineWidth = Math.max(0.6, rx * 0.10);
        x.beginPath();
        x.moveTo(0, -ry * 0.86);
        x.lineTo(0, ry * 0.80);
        x.stroke();

        // Specular sheen streak (the waxy cuticle highlight).
        const sg = x.createLinearGradient(-rx * 0.3, -ry, rx * 0.3, ry);
        sg.addColorStop(0.0, 'rgba(190,220,150,0.0)');
        sg.addColorStop(0.5, 'rgba(200,228,160,0.30)');
        sg.addColorStop(1.0, 'rgba(190,220,150,0.0)');
        x.fillStyle = sg;
        x.beginPath();
        x.ellipse(-rx * 0.18, -ry * 0.15, rx * 0.34, ry * 0.55, 0, 0, Math.PI * 2);
        x.fill();

        x.restore();
    }

    // A spray of small leaves radiating from a common point.
    const N = 9;
    for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 + rnd() * 0.6;
        const dist = s * (0.06 + rnd() * 0.20);
        const px = Math.cos(ang) * dist;
        const py = Math.sin(ang) * dist * 0.85;
        const rx = s * (0.055 + rnd() * 0.035);   // narrow blades
        const ry = s * (0.13 + rnd() * 0.075);    // ~2.5:1 oblong
        const rot = ang + (rnd() - 0.5) * 0.7;
        leaflet(px, py, rx, ry, rot);
    }
    // A couple of central leaves to fill the core of the spray.
    leaflet((rnd() - 0.5) * s * 0.1, (rnd() - 0.5) * s * 0.1,
        s * 0.07, s * 0.17, (rnd() - 0.5) * 0.8);
    leaflet((rnd() - 0.5) * s * 0.12, (rnd() - 0.5) * s * 0.12,
        s * 0.062, s * 0.15, Math.PI * 0.5 + (rnd() - 0.5) * 0.8);

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
}

// Live-oak leaf silhouette: oblong-elliptic, rounded base, gently pointed tip.
function leafOutline(x, rx, ry) {
    x.moveTo(0, -ry);                                  // tip
    x.bezierCurveTo(rx * 0.9, -ry * 0.55, rx, ry * 0.2, rx * 0.5, ry * 0.78);
    x.bezierCurveTo(rx * 0.22, ry, -rx * 0.22, ry, -rx * 0.5, ry * 0.78); // rounded base
    x.bezierCurveTo(-rx, ry * 0.2, -rx * 0.9, -ry * 0.55, 0, -ry);
}

// ---------------------------------------------------------------------------
// PROCEDURAL BARK MAPS  (live oak / Quercus virginiana)
//
// One runtime canvas pass per channel. A shared height field (layered
// value-noise fbm + vertical fissure warping) drives all three maps so colour,
// normal and roughness stay registered: deepest furrow = darkest + slightly
// wetter (less rough); raised ridges = paler + rougher. Tiles seamlessly
// because every noise lookup wraps in both axes.
//
//   makeBarkTextures(bark) -> { map, normalMap, roughnessMap }
//
// `bark` = species.surface.bark = { color, roughness, fissure }. Defaults match
// the hero spec (0x3a2a1c, 0.96, 0.4) so it is safe to call with nothing.
// ---------------------------------------------------------------------------
const BARK_TEX_SIZE = 512; // px, square, power-of-two for mip/repeat

export function makeBarkTextures(bark = {}) {
    const baseHex = bark.color ?? 0x3a2a1c;
    const rough = bark.roughness ?? 0.96;
    const fissure = bark.fissure ?? 0.4;

    const S = BARK_TEX_SIZE;
    const height = buildBarkHeightField(S, fissure); // Float32 [0..1], seamless

    const map = new THREE.CanvasTexture(barkColorCanvas(S, height, baseHex, fissure));
    map.encoding = THREE.sRGBEncoding;            // albedo is colour data
    tuneBarkTexture(map);

    const normalMap = new THREE.CanvasTexture(barkNormalCanvas(S, height, fissure));
    // normal stays LINEAR (default) - it is vector data, must not be gamma'd
    tuneBarkTexture(normalMap);

    const roughnessMap = new THREE.CanvasTexture(barkRoughnessCanvas(S, height, rough));
    tuneBarkTexture(roughnessMap); // linear (default)

    return { map, normalMap, roughnessMap };
}

function tuneBarkTexture(t) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
}

// --- shared height field -----------------------------------------------------
// Live-oak bark = strong vertical furrows (V axis = up the trunk) that meander,
// fork and break, over a finer blocky/plated value-noise. Returns a Float32Array
// of length S*S in [0,1] where 1 = top of a ridge, 0 = bottom of a furrow.
function buildBarkHeightField(S, fissure) {
    const h = new Float32Array(S * S);
    const seed = 1337;
    let lo = Infinity, hi = -Infinity;

    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const u = x / S, v = y / S;

            // Domain-warp the horizontal coordinate by low-freq noise so the
            // vertical furrows wander instead of being dead-straight stripes.
            const warp = (tileFbm(seed + 11, u, v, 3, 1) - 0.5) * 0.22 * (0.6 + fissure);
            const uu = u + warp;

            // Primary furrows: ridged noise stretched vertically so grooves run
            // UP the limb. ridged = 1 - |2n-1| gives sharp creases.
            const fr = tileFbm(seed, uu * 5.0, v * 1.4, 4, 5.0);
            const ridged = 1 - Math.abs(2 * fr - 1);
            let value = Math.pow(ridged, 1.4); // sharpen the creases

            // Finer plated grain riding on top of the furrows.
            const grain = tileFbm(seed + 7, uu * 14.0, v * 6.0, 4, 14.0);
            value = value * 0.78 + grain * 0.22;

            // fissure deepens the furrows: push values toward extremes.
            const deep = (value - 0.5) * (1 + fissure * 1.3) + 0.5;
            const hv = clamp01(deep);
            h[y * S + x] = hv;
            if (hv < lo) lo = hv;
            if (hv > hi) hi = hv;
        }
    }
    // Normalise to use the full [0,1] range (stable contrast regardless of fbm).
    const inv = hi > lo ? 1 / (hi - lo) : 1;
    for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) * inv;
    return h;
}

// --- colour map --------------------------------------------------------------
function barkColorCanvas(S, height, baseHex, fissure) {
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const d = img.data;

    const base = hexRgb(baseHex);
    // Warm chocolate ridges -> near-black furrow bottoms, with cool grey-green
    // lichen blooms in patches.
    const ridge = mulRgb(base, 1.55);  // sun-caught ridge crest
    const floor = mulRgb(base, 0.32);  // shadowed furrow bottom
    const lichen = [150, 158, 138];    // grey-green crustose lichen

    const seed = 9001;
    for (let y = 0; y < S; y++) {
        for (let x2 = 0; x2 < S; x2++) {
            const i = y * S + x2;
            const hgt = height[i];

            let r = lerp(floor[0], ridge[0], hgt);
            let g = lerp(floor[1], ridge[1], hgt);
            let b = lerp(floor[2], ridge[2], hgt);

            // Mottling: large slow blotches of lighter/darker brown.
            const blotch = tileFbm(seed, x2 / S * 3.0, y / S * 3.0, 3, 3.0) - 0.5;
            const mf = 1 + blotch * 0.45;
            r *= mf; g *= mf; b *= mf;

            // Lichen: thresholded patchy noise, only on raised, exposed bark.
            const lp = tileFbm(seed + 31, x2 / S * 4.0, y / S * 4.0, 4, 4.0);
            const lichenMask = smoothstep(0.62, 0.78, lp) * smoothstep(0.45, 0.7, hgt);
            r = lerp(r, lichen[0], lichenMask * 0.7);
            g = lerp(g, lichen[1], lichenMask * 0.7);
            b = lerp(b, lichen[2], lichenMask * 0.7);

            const o = i * 4;
            d[o]     = clampByte(r);
            d[o + 1] = clampByte(g);
            d[o + 2] = clampByte(b);
            d[o + 3] = 255;
        }
    }
    x.putImageData(img, 0, 0);
    return c;
}

// --- normal map (tangent space) ---------------------------------------------
// Sobel gradient of the height field -> RGB normal. Furrow depth scaled so the
// fissures read as real grooves under the directional sun.
function barkNormalCanvas(S, height, fissure) {
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const d = img.data;

    const strength = 2.2 + fissure * 3.2; // deeper fissures -> stronger normals
    const at = (px, py) => height[((py + S) % S) * S + ((px + S) % S)];

    for (let y = 0; y < S; y++) {
        for (let x2 = 0; x2 < S; x2++) {
            const tl = at(x2 - 1, y - 1), t = at(x2, y - 1), tr = at(x2 + 1, y - 1);
            const l = at(x2 - 1, y),                          r = at(x2 + 1, y);
            const bl = at(x2 - 1, y + 1), bb = at(x2, y + 1), br = at(x2 + 1, y + 1);
            const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
            const gy = (bl + 2 * bb + br) - (tl + 2 * t + tr);

            let nx = -gx * strength;
            let ny = -gy * strength;
            let nz = 1.0;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nx *= inv; ny *= inv; nz *= inv;

            const o = (y * S + x2) * 4;
            d[o]     = Math.round((nx * 0.5 + 0.5) * 255);
            d[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            d[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            d[o + 3] = 255;
        }
    }
    x.putImageData(img, 0, 0);
    return c;
}

// --- roughness map -----------------------------------------------------------
// Ridge crests dry/rough; furrow bottoms a touch wetter/smoother; fine speckle
// to break specular. Centred on the material's base roughness.
function barkRoughnessCanvas(S, height, baseRough) {
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const d = img.data;

    const seed = 4242;
    const base255 = clampByte(baseRough * 255);
    for (let y = 0; y < S; y++) {
        for (let x2 = 0; x2 < S; x2++) {
            const i = y * S + x2;
            const hgt = height[i];
            let rgh = base255 + (hgt - 0.5) * 36;     // crests rougher
            const sp = tileFbm(seed, x2 / S * 20.0, y / S * 20.0, 2, 20.0) - 0.5;
            rgh += sp * 22;                            // fine speckle
            const o = i * 4;
            const v = clampByte(rgh);
            d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
        }
    }
    x.putImageData(img, 0, 0);
    return c;
}

// --- seamless value-noise fbm ------------------------------------------------
// fbm whose lowest octave wraps over `period` cells, so sampling the full [0,1]
// canvas with the matching frequency tiles with no seam. `freq` is the base
// frequency in cells across the unit square; it is also the wrap period.
function tileFbm(seed, fx, fy, octaves, period) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    const per = Math.max(1, Math.round(period));
    for (let o = 0; o < octaves; o++) {
        sum += amp * tileValueNoise(seed + o * 101, fx * freq, fy * freq, per * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return sum / norm;
}

function tileValueNoise(seed, x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const p = Math.max(1, Math.round(period));
    const a = hash2(seed, mod(xi, p),     mod(yi, p));
    const b = hash2(seed, mod(xi + 1, p), mod(yi, p));
    const cc = hash2(seed, mod(xi, p),     mod(yi + 1, p));
    const dd = hash2(seed, mod(xi + 1, p), mod(yi + 1, p));
    const top = a + (b - a) * u;
    const bot = cc + (dd - cc) * u;
    return top + (bot - top) * v;
}

function hash2(seed, x, y) {
    let n = (seed * 73856093) ^ ((x + 1) * 19349663) ^ ((y + 1) * 83492791);
    n = (n ^ (n >>> 13)) >>> 0;
    n = (n * 1274126177) >>> 0;
    return n / 4294967296;
}

// ---------------------------------------------------------------------------
// PROCEDURAL ENVIRONMENT DOME
// A tiny sky scene used only as a source for PMREMGenerator.fromScene().
// Vertex-coloured sphere: warm-tinted sun bloom, blue zenith, pale horizon,
// dark-green ground hemisphere. No image files - pure geometry + colour.
// Returns a THREE.Scene you pass to PMREMGenerator.
// ---------------------------------------------------------------------------
export function makeEnvScene(THREE_, sunDir) {
    const scene = new THREE_.Scene();

    const geo = new THREE_.SphereGeometry(500, 48, 32);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const zenith  = new THREE_.Color(0x2f6fb0).convertSRGBToLinear();
    const horizon = new THREE_.Color(0xcfe0ef).convertSRGBToLinear();
    const ground  = new THREE_.Color(0x29331e).convertSRGBToLinear();
    const sunCol  = new THREE_.Color(0xfff1d8).convertSRGBToLinear();

    const sun = sunDir.clone().normalize();
    const c = new THREE_.Color();
    const v = new THREE_.Vector3();

    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        const up = THREE_.MathUtils.clamp(v.z, -1, 1); // Z-up world

        if (up >= 0) {
            // Sky: horizon -> zenith, eased so the horizon band is broad.
            const t = Math.pow(up, 0.55);
            c.copy(horizon).lerp(zenith, t);
            // Sun bloom: soft warm disc + halo around the sun direction.
            const dd = Math.max(0, v.dot(sun));
            const halo = Math.pow(dd, 6.0) * 0.5 + Math.pow(dd, 60.0) * 1.4;
            c.lerp(sunCol, Math.min(halo, 1.0));
        } else {
            // Ground hemisphere: darkens with depth, mild warm bounce near horizon.
            const t = Math.pow(-up, 0.6);
            c.copy(horizon).lerp(ground, 0.4 + 0.6 * t);
            c.multiplyScalar(0.85);
        }
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE_.Float32BufferAttribute(colors, 3));

    const mat = new THREE_.MeshBasicMaterial({
        vertexColors: true,
        side: THREE_.BackSide,
        toneMapped: false,
        depthWrite: false,
    });
    scene.add(new THREE_.Mesh(geo, mat));
    return scene;
}

// ---------------------------------------------------------------------------
// SOFT CONTACT-SHADOW DECAL
// A blurred radial gradient on transparent canvas. Laid flat on the ground
// under the crown to "ground" the tree softly - NOT a hard cast shadow.
// Darkest at centre, feathering to nothing at the rim. Tune via `strength`.
// ---------------------------------------------------------------------------
export function makeContactShadowTexture(strength = 0.42) {
    const s = 512;
    const c = canvas(s, s);
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);

    const cx = s / 2, cy = s / 2;

    const wide = x.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5);
    wide.addColorStop(0.0, `rgba(10,14,8,${0.55 * strength})`);
    wide.addColorStop(0.35, `rgba(10,14,8,${0.40 * strength})`);
    wide.addColorStop(0.7, `rgba(10,14,8,${0.12 * strength})`);
    wide.addColorStop(1.0, 'rgba(10,14,8,0)');
    x.fillStyle = wide;
    x.fillRect(0, 0, s, s);

    const core = x.createRadialGradient(cx, cy, 0, cx, cy, s * 0.28);
    core.addColorStop(0.0, `rgba(6,10,5,${0.45 * strength})`);
    core.addColorStop(1.0, 'rgba(6,10,5,0)');
    x.fillStyle = core;
    x.fillRect(0, 0, s, s);

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

// --- small helpers -----------------------------------------------------------
function mod(a, n) { return ((a % n) + n) % n; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}
function hexRgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
function mulRgb(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}
