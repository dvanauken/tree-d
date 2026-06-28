// index.js - Glue only.
//
// Bootstraps the Holy Grail shell regions: scene (center), parameter panel
// (east), saved-trees browser (west), toolbar (north), status bar (south).
// Routes UI events to the model + renderer in real time. No tree logic here -
// morphology lives in src/model, drawing in src/render, persistence in
// src/store.

import './src/ui/app-shell.js';
import { getSpecies, listSpecies } from './src/model/species/index.js';
import { buildTreeModel } from './src/model/TreeModel.js';
import { SceneView } from './src/render/SceneView.js';
import { ControlPanel } from './src/ui/ControlPanel.js';
import { SavedTrees } from './src/ui/SavedTrees.js';
import { saveTree, loadTree } from './src/store/treeStore.js';

document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const scene = new SceneView($('scene-host'));
    const panel = new ControlPanel($('param-host'), () => schedule(false));
    const saved = new SavedTrees($('saved-host'), { onSelect: loadSaved });

    const els = {
        species: $('species-select'),
        age: $('age-select'),
        seed: $('seed-input'),
        random: $('btn-random'),
        regenerate: $('btn-regenerate'),
        name: $('name-input'),
        save: $('btn-save'),
        status: $('statusbar'),
    };

    for (const { key, commonName } of listSpecies()) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = commonName;
        els.species.appendChild(opt);
    }

    // --- Build loop (rAF-coalesced; refit only when asked) -----------------

    let currentModel = null;
    let needRefit = true;
    let raf = 0;

    function schedule(refit) {
        if (refit) needRefit = true;
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            rebuild();
        });
    }

    function rebuild() {
        currentModel = buildTreeModel(els.species.value, {
            ageClass: els.age.value,
            seed: Number(els.seed.value) || 0,
            profile: panel.getValues(),
        });
        scene.setModel(currentModel, needRefit);
        needRefit = false;
        showStatus(currentModel);
    }

    function loadSpeciesIntoPanel() {
        panel.setValues(getSpecies(els.species.value));
    }

    function showStatus(model) {
        const m = model.metadata;
        const cell = (k, v) => `<div class="status-cell"><span class="k">${k}</span><span class="v">${v}</span></div>`;
        els.status.innerHTML =
            `<div class="status-cell grow">${model.commonName}</div>`
            + cell('height', `${m.height.toFixed(1)} ft`)
            + cell('spread', `${m.spread.toFixed(1)} ft`)
            + cell('DBH', `${m.trunkDBH.toFixed(1)} ft`)
            + cell('branches', m.pathCount)
            + cell('leaves', m.leafCount)
            + cell('seed', model.seed);
    }

    // --- Toolbar -----------------------------------------------------------

    els.species.addEventListener('change', () => { loadSpeciesIntoPanel(); schedule(true); });
    els.age.addEventListener('change', () => schedule(true));
    els.regenerate.addEventListener('click', () => schedule(true));
    els.seed.addEventListener('input', () => schedule(false));
    els.random.addEventListener('click', () => {
        els.seed.value = Math.floor(Math.random() * 100000);
        schedule(true);
    });

    els.save.addEventListener('click', async () => {
        const name = (els.name.value || '').trim();
        if (!name) { els.name.focus(); return; }
        await saveTree({
            name,
            speciesKey: els.species.value,
            commonName: getSpecies(els.species.value).commonName,
            ageClass: els.age.value,
            seed: Number(els.seed.value) || 0,
            profile: panel.getValues(),
            savedAt: Date.now(),
        });
        saved.refresh();
    });

    async function loadSaved(name) {
        const rec = await loadTree(name);
        if (!rec) return;
        els.species.value = rec.speciesKey;
        els.age.value = rec.ageClass;
        els.seed.value = rec.seed;
        els.name.value = rec.name;
        if (rec.profile) panel.setValues(rec.profile);
        else loadSpeciesIntoPanel();
        schedule(true);
    }

    // --- Scene overlays ----------------------------------------------------

    function segGroup(id, handler) {
        const g = $(id);
        g.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            for (const c of g.children) c.classList.toggle('active', c === b);
            handler(b.dataset.val);
        });
    }
    segGroup('grp-proj', (v) => scene.setProjection(v));
    segGroup('grp-render', (v) => scene.setRenderMode(v));
    segGroup('grp-leaves', (v) => scene.setShowLeaves(v === 'on'));

    const toggle = (id, fn) => {
        const b = $(id);
        b.addEventListener('click', () => fn(b.classList.toggle('active')));
    };
    toggle('btn-grid', (on) => scene.setShowGrid(on));
    toggle('btn-figure', (on) => scene.setShowFigure(on));
    $('btn-fit').addEventListener('click', () => scene.fit());

    // --- Initial tree ------------------------------------------------------

    loadSpeciesIntoPanel();
    schedule(true);
});
