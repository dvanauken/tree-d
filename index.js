// index.js - Glue only.
//
// Wires the model layer (buildTreeModel) to the renderer (SkeletonView) and
// connects the index.html controls. No tree logic lives here: morphology is in
// src/model, drawing is in src/render. This file just bootstraps and routes UI
// events.

import { listSpecies } from './src/model/species/index.js';
import { buildTreeModel } from './src/model/TreeModel.js';
import { SkeletonView } from './src/render/SkeletonView.js';

document.addEventListener('DOMContentLoaded', () => {
    const view = new SkeletonView(document.getElementById('viewport'));

    const els = {
        species: document.getElementById('species-select'),
        age: document.getElementById('age-select'),
        seed: document.getElementById('seed-input'),
        random: document.getElementById('btn-random'),
        regenerate: document.getElementById('btn-regenerate'),
        grid: document.getElementById('chk-grid'),
        depth: document.getElementById('chk-depth'),
        fit: document.getElementById('btn-fit'),
        stats: document.getElementById('stats'),
    };

    // Populate species dropdown from the registry.
    for (const { key, commonName } of listSpecies()) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = commonName;
        els.species.appendChild(opt);
    }

    // Optional initial state from the URL (?species=palm&age=old&seed=3).
    const q = new URLSearchParams(location.search);
    if (q.has('species')) els.species.value = q.get('species');
    if (q.has('age')) els.age.value = q.get('age');
    if (q.has('seed')) els.seed.value = q.get('seed');

    function rebuild() {
        const model = buildTreeModel(els.species.value, {
            ageClass: els.age.value,
            seed: Number(els.seed.value) || 0,
        });
        view.setModel(model);
        showStats(model);
    }

    function showStats(model) {
        const m = model.metadata;
        els.stats.innerHTML = `
            <div><span class="stat-key">Height</span> <b>${m.height.toFixed(1)} ft</b></div>
            <div><span class="stat-key">Spread</span> <b>${m.spread.toFixed(1)} ft</b></div>
            <div><span class="stat-key">Trunk DBH</span> <b>${m.trunkDBH.toFixed(1)} ft</b></div>
            <div><span class="stat-key">Branches</span> <b>${m.pathCount}</b></div>
            <div><span class="stat-key">Nodes</span> <b>${m.nodeCount}</b></div>
        `;
    }

    els.regenerate.addEventListener('click', rebuild);
    els.species.addEventListener('change', rebuild);
    els.age.addEventListener('change', rebuild);

    els.random.addEventListener('click', () => {
        els.seed.value = Math.floor(Math.random() * 100000);
        rebuild();
    });

    els.grid.addEventListener('change', () => {
        view.showGrid = els.grid.checked;
        view.redraw();
    });
    els.depth.addEventListener('change', () => {
        view.depthCue = els.depth.checked;
        view.redraw();
    });
    els.fit.addEventListener('click', () => {
        view.fit();
        view.redraw();
    });

    rebuild();
});
