// SavedTrees.js - West-region browser for saved trees.
//
// Lists named trees from IndexedDB, loads one on click, and deletes on the ✕.
// Knows nothing about how a tree is built - it just hands a saved record back
// to the app via onSelect.

import { listTrees, deleteTree } from '../store/treeStore.js';

export class SavedTrees {
    constructor(host, { onSelect } = {}) {
        this.host = host;
        this.onSelect = onSelect;
        this.activeName = null;

        this.list = document.createElement('ul');
        this.list.className = 'saved-list';
        this.empty = document.createElement('p');
        this.empty.className = 'saved-empty';
        this.empty.textContent = 'No saved trees yet.';

        this.host.appendChild(this.empty);
        this.host.appendChild(this.list);

        // Single delegated handler: distinguish load vs. delete by class.
        this.list.addEventListener('click', (e) => {
            const del = e.target.closest('.saved-del');
            if (del) {
                const li = del.closest('li');
                deleteTree(li.dataset.name).then(() => this.refresh());
                return;
            }
            const load = e.target.closest('.saved-load');
            if (!load) return;
            const li = load.closest('li');
            const name = li.dataset.name;
            this.activeName = name;
            this._highlight();
            if (this.onSelect) this.onSelect(name);
        });

        this.refresh();
    }

    async refresh() {
        const rows = await listTrees();
        this.list.innerHTML = '';
        this.empty.style.display = rows.length ? 'none' : 'block';
        for (const r of rows) {
            const li = document.createElement('li');
            li.dataset.name = r.name;
            li.className = 'saved-item';

            // Load button (keyboard-activatable) spans name + meta.
            const load = document.createElement('button');
            load.type = 'button';
            load.className = 'saved-load';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'saved-name';
            nameSpan.textContent = r.name;

            const metaSpan = document.createElement('span');
            metaSpan.className = 'saved-meta';
            metaSpan.textContent = `${r.commonName || r.speciesKey} · seed ${r.seed}`;

            load.appendChild(nameSpan);
            load.appendChild(metaSpan);

            // Delete button with per-item accessible label.
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'saved-del';
            del.setAttribute('aria-label', `Delete ${r.name}`);
            del.textContent = '✕';

            li.appendChild(load);
            li.appendChild(del);
            this.list.appendChild(li);
        }
        this._highlight();
    }

    _highlight() {
        for (const li of this.list.children) {
            li.classList.toggle('active', li.dataset.name === this.activeName);
        }
    }
}
