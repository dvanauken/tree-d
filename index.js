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
        species:    $('species-select'),
        age:        $('age-select'),
        seed:       $('seed-input'),
        random:     $('btn-random'),
        regenerate: $('btn-regenerate'),
        name:       $('name-input'),
        save:       $('btn-save'),
        status:     $('statusbar'),
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
        const cell = (k, v) =>
            `<div class="status-cell"><span class="k">${k}</span><span class="v">${v}</span></div>`;
        els.status.innerHTML =
            `<div class="status-cell grow">${model.commonName}</div>`
            + cell('height',   `${m.height.toFixed(1)} ft`)
            + cell('spread',   `${m.spread.toFixed(1)} ft`)
            + cell('DBH',      `${m.trunkDBH.toFixed(1)} ft`)
            + cell('branches', m.pathCount)
            + cell('leaves',   m.leafCount)
            + cell('seed',     model.seed);
    }

    // --- Toolbar -----------------------------------------------------------

    els.species.addEventListener('change', () => { loadSpeciesIntoPanel(); schedule(true); });
    els.age.addEventListener('change', () => schedule(true));
    els.regenerate.addEventListener('click', () => schedule(true));
    els.seed.addEventListener('input', () => schedule(false));
    els.random.addEventListener('click', () => {
        els.seed.value = freshSeed();
        schedule(true);
    });

    els.save.addEventListener('click', async () => {
        const name = (els.name.value || '').trim();
        if (!name) { els.name.focus(); return; }
        await saveTree({
            name,
            speciesKey:  els.species.value,
            commonName:  getSpecies(els.species.value).commonName,
            ageClass:    els.age.value,
            seed:        Number(els.seed.value) || 0,
            profile:     panel.getValues(),
            savedAt:     Date.now(),
        });
        saved.refresh();
    });

    async function loadSaved(name) {
        const rec = await loadTree(name);
        if (!rec) return;
        els.species.value = rec.speciesKey;
        els.age.value     = rec.ageClass;
        els.seed.value    = rec.seed;
        els.name.value    = rec.name;
        if (rec.profile) panel.setValues(rec.profile);
        else             loadSpeciesIntoPanel();
        schedule(true);
    }

    function freshSeed() {
        const current = Number(els.seed.value) || 0;
        const max = Number(els.seed.max) || 999999;
        let next = current;

        for (let i = 0; i < 6 && next === current; i++) {
            if (window.crypto && window.crypto.getRandomValues) {
                const buf = new Uint32Array(1);
                window.crypto.getRandomValues(buf);
                next = buf[0] % (max + 1);
            } else {
                next = Math.floor(Math.random() * (max + 1));
            }
        }

        return next === current ? (current + 1) % (max + 1) : next;
    }

    // --- Scene overlays ----------------------------------------------------

    // Segmented control: one active at a time, syncs aria-pressed.
    function segGroup(id, handler) {
        const g = $(id);
        g.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            for (const c of g.children) {
                const on = c === b;
                c.classList.toggle('active', on);
                c.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            handler(b.dataset.val);
        });
    }
    segGroup('grp-proj',   (v) => scene.setProjection(v));
    segGroup('grp-render', (v) => scene.setRenderMode(v));
    segGroup('grp-fov',    (v) => scene.setFieldOfView(Number(v)));
    segGroup('grp-view',   (v) => {
        const proj = scene.setView(v);
        // Keep the Ortho/Perspective seg in sync with whatever setView chose.
        const g = $('grp-proj');
        for (const c of g.children) {
            const on = c.dataset.val === proj;
            c.classList.toggle('active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    });

    // Toggle button: independent on/off state, syncs aria-pressed.
    function toggle(id, fn) {
        const b = $(id);
        b.addEventListener('click', () => {
            const on = b.classList.toggle('active');
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            fn(on);
        });
    }
    toggle('btn-leaves', (on) => scene.setShowLeaves(on));
    toggle('btn-grid',   (on) => scene.setShowGrid(on));
    toggle('btn-figure', (on) => scene.setShowFigure(on));
    $('btn-zoom-out').addEventListener('click', () => scene.zoom(1.5));
    $('btn-zoom-in' ).addEventListener('click', () => scene.zoom(1 / 1.5));
    $('btn-fit').addEventListener('click', () => scene.fit());

    // --- Initial tree ------------------------------------------------------

    loadSpeciesIntoPanel();
    schedule(true);
});
