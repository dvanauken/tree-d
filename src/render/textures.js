// textures.js - The few procedural textures the scene still needs.
//
// Per project direction the wood and ground are plain-shaded (no made-up
// surface textures). What remains: a soft sky gradient backdrop and a single
// leaf-shaped alpha cutout used for the (optional) instanced foliage cards.

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

// Grass ground texture: continuous gradient from rich green to deep dark green.
// No tiling — one stretch across the whole plane.
export function makeGroundTexture() {
    const c = canvas(4, 512);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#1d460d');   /* rich mid green × 0.5 */
    g.addColorStop(1.0, '#071e04');   /* deep dark green × 0.5 */
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

// A single leaf, green with veins, transparent background.
export function makeLeafTexture() {
    const s = 128;
    const c = canvas(s, s);
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    x.translate(s / 2, s / 2);

    const grad = x.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
    grad.addColorStop(0, '#5c8a3a');
    grad.addColorStop(0.5, '#436e29');
    grad.addColorStop(1, '#33571f');
    x.fillStyle = grad;
    x.beginPath();
    x.moveTo(0, -s * 0.46);
    x.quadraticCurveTo(s * 0.34, -s * 0.08, 0, s * 0.46);
    x.quadraticCurveTo(-s * 0.34, -s * 0.08, 0, -s * 0.46);
    x.closePath();
    x.fill();

    x.strokeStyle = 'rgba(20,38,14,0.55)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -s * 0.4);
    x.lineTo(0, s * 0.42);
    x.stroke();
    x.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const yy = i * s * 0.09;
        x.beginPath();
        x.moveTo(0, yy);
        x.lineTo(s * 0.2, yy + (i > 0 ? s * 0.07 : -s * 0.07));
        x.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}
