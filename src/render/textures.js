// textures.js - Procedural canvas textures for a more realistic render.
//
// Generated at runtime (no asset files) but high enough fidelity to lift the
// scene out of "flat shaded" territory: streaky bark, a veined leaf cutout, a
// blade-flecked grass tile, and a hazy sky gradient.

import * as THREE from '../../vendor/three.module.js';

// Light-key bark detail: multiplies the per-order vertex colour, so it adds
// streaks/grain without shifting the base brown.
export function makeBarkTexture() {
    const s = 256;
    const c = canvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#cdc6ba';
    x.fillRect(0, 0, s, s);

    for (let i = 0; i < 220; i++) {
        const px = Math.random() * s;
        const w = 1 + Math.random() * 3.5;
        const a = 0.08 + Math.random() * 0.30;
        const sh = 60 + Math.random() * 90;
        x.strokeStyle = `rgba(${sh * 0.5 | 0},${sh * 0.42 | 0},${sh * 0.34 | 0},${a})`;
        x.lineWidth = w;
        x.beginPath();
        x.moveTo(px, 0);
        let y = 0;
        while (y < s) { y += 6 + Math.random() * 18; x.lineTo(px + (Math.random() * 5 - 2.5), y); }
        x.stroke();
    }
    speckle(x, s, 26);

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
}

// A single leaf, green with veins, transparent background — used as an
// alpha-cut card.
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

export function makeGrassTexture() {
    const s = 256;
    const c = canvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#43603a';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
        const px = Math.random() * s;
        const py = Math.random() * s;
        const g = 55 + Math.random() * 80;
        x.fillStyle = `rgba(${g * 0.45 | 0},${g | 0},${g * 0.4 | 0},0.22)`;
        x.fillRect(px, py, 1, 2 + Math.random() * 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.repeat.set(60, 60);
    t.anisotropy = 4;
    return t;
}

export function makeSkyTexture() {
    const c = canvas(4, 512);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#3f78c0');
    g.addColorStop(0.55, '#83b4e2');
    g.addColorStop(1.0, '#d8ecf6');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 512);
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

function speckle(x, s, amp) {
    const img = x.getImageData(0, 0, s, s);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() * 2 - 1) * amp;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
}
