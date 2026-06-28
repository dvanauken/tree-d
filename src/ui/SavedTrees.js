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

        this.list.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            const name = li.dataset.name;
            if (e.target.classList.contains('saved-del')) {
                deleteTree(name).then(() => this.refresh());
                return;
            }
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
            li.innerHTML = `
                <span class="saved-name"></span>
                <span class="saved-meta"></span>
                <button class="saved-del" title="Delete" type="button">✕</button>`;
            li.querySelector('.saved-name').textContent = r.name;
            li.querySelector('.saved-meta').textContent = `${r.commonName || r.speciesKey} · seed ${r.seed}`;
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
