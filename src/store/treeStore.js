// treeStore.js - IndexedDB persistence for named trees.
//
// A saved tree is the recipe needed to rebuild it deterministically:
// species + age + seed + parameter overrides. We store the recipe, not the
// generated geometry - the model layer regenerates identical output from it.

const DB_NAME = 'tree-d';
const STORE = 'trees';
const VERSION = 1;

let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'name' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

function tx(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const result = fn(store);
        t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    }));
}

// record: { name, speciesKey, ageClass, seed, profile, savedAt }
export function saveTree(record) {
    return tx('readwrite', (store) => ({ __req: store.put(record) }));
}

export function listTrees() {
    return tx('readonly', (store) => ({ __req: store.getAll() }))
        .then((rows) => (rows || []).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
}

export function loadTree(name) {
    return tx('readonly', (store) => ({ __req: store.get(name) }));
}

export function deleteTree(name) {
    return tx('readwrite', (store) => ({ __req: store.delete(name) }));
}
