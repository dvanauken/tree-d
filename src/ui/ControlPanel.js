// ControlPanel.js - Grouped parameter editor for the east region.
//
// Builds sliders for every editable species-profile parameter, split into
// logical groups. Scalars get one slider; [min,max] tuples get two. Editing
// fires onChange in real time. getValues() returns a partial species profile
// (overrides) ready for buildTreeModel; setValues(profile) loads a profile in.
//
// Modelled on web-component-II's property-inspector pattern (reference only).

const SCHEMA = [
    {
        group: 'Size (ft)',
        fields: [
            { key: 'matureHeight', label: 'Height', min: 5, max: 120, step: 1 },
            { key: 'matureSpread', label: 'Spread', min: 5, max: 140, step: 1 },
            { key: 'trunkDBH', label: 'Trunk DBH', min: 0.2, max: 6, step: 0.1 },
            { key: 'trunkHeightToCrown', label: 'Trunk to crown', min: 1, max: 60, step: 1 },
        ],
    },
    {
        group: 'Primary limbs',
        fields: [
            { key: 'primaryLimbCount', label: 'Count', range: true, min: 1, max: 24, step: 1 },
            { key: 'primaryElevationDeg', label: 'Elevation°', range: true, min: -30, max: 90, step: 1 },
            { key: 'primaryLengthFactor', label: 'Length factor', min: 0.1, max: 1.2, step: 0.01, default: 0.34 },
        ],
    },
    {
        group: 'Branching',
        fields: [
            { key: 'branchesPerNode.secondary', label: 'Secondary', range: true, min: 1, max: 6, step: 1 },
            { key: 'branchesPerNode.tertiary', label: 'Tertiary', range: true, min: 1, max: 6, step: 1 },
            { key: 'branchesPerNode.twig', label: 'Twig', range: true, min: 1, max: 6, step: 1 },
            { key: 'divergenceDeg', label: 'Divergence°', range: true, min: 5, max: 80, step: 1 },
            { key: 'segmentsPerBranch', label: 'Segments', min: 2, max: 12, step: 1 },
            { key: 'lengthRatio', label: 'Length ratio', min: 0.3, max: 0.9, step: 0.01 },
            { key: 'radiusRatio', label: 'Radius ratio', min: 0.3, max: 0.9, step: 0.01 },
            { key: 'maxOrderCap', label: 'Max order cap', min: 1, max: 5, step: 1, default: 5 },
        ],
    },
    {
        group: 'Shape',
        fields: [
            { key: 'sweepPerSegDeg', label: 'Sweep up°', min: 0, max: 20, step: 0.5 },
            { key: 'sagPerSegDeg', label: 'Sag°', min: 0, max: 20, step: 0.5 },
            { key: 'jitterDeg', label: 'Jitter°', min: 0, max: 15, step: 0.5 },
            { key: 'azJitterDeg', label: 'Azimuth jitter°', min: 0, max: 45, step: 1 },
        ],
    },
    {
        group: 'Foliage',
        fields: [
            { key: 'leafSize', label: 'Leaf size', min: 0.2, max: 3, step: 0.05, default: 0.85 },
            { key: 'leavesPerNode', label: 'Leaf density', min: 1, max: 5, step: 1, default: 2 },
        ],
    },
];

export class ControlPanel {
    constructor(host, onChange) {
        this.host = host;
        this.onChange = onChange;
        this.entries = {}; // key -> entry
        this._build();
    }

    _build() {
        for (const group of SCHEMA) {
            const sec = el('div', 'param-group');
            sec.appendChild(el('h3', null, group.group));
            for (const f of group.fields) sec.appendChild(this._field(f));
            this.host.appendChild(sec);
        }
    }

    _field(f) {
        const wrap = el('div', 'param-field');
        const head = el('div', 'param-head');
        head.appendChild(el('label', null, f.label));
        const out = el('span', 'param-out');
        head.appendChild(out);
        wrap.appendChild(head);

        if (f.range) {
            const row = el('div', 'range-row');
            const lo = slider(f);
            const hi = slider(f);
            row.appendChild(lo);
            row.appendChild(hi);
            wrap.appendChild(row);
            const entry = { f, out, lo, hi, range: true };
            const update = () => { this._refresh(entry); if (this.onChange) this.onChange(); };
            lo.addEventListener('input', () => { if (+lo.value > +hi.value) hi.value = lo.value; update(); });
            hi.addEventListener('input', () => { if (+hi.value < +lo.value) lo.value = hi.value; update(); });
            this.entries[f.key] = entry;
        } else {
            const s = slider(f);
            wrap.appendChild(s);
            const entry = { f, out, s };
            s.addEventListener('input', () => { this._refresh(entry); if (this.onChange) this.onChange(); });
            this.entries[f.key] = entry;
        }
        return wrap;
    }

    _refresh(entry) {
        const { f, out } = entry;
        if (entry.range) out.textContent = `${fmt(entry.lo.value, f.step)}–${fmt(entry.hi.value, f.step)}`;
        else out.textContent = fmt(entry.s.value, f.step);
    }

    setValues(profile) {
        for (const key in this.entries) {
            const entry = this.entries[key];
            const f = entry.f;
            const v = getPath(profile, key);
            if (entry.range) {
                const arr = Array.isArray(v) ? v : [f.min, f.max];
                entry.lo.value = arr[0];
                entry.hi.value = arr[1];
            } else {
                entry.s.value = v != null ? v : (f.default != null ? f.default : f.min);
            }
            this._refresh(entry);
        }
    }

    getValues() {
        const out = {};
        for (const key in this.entries) {
            const entry = this.entries[key];
            const val = entry.range
                ? [num(entry.lo.value), num(entry.hi.value)]
                : num(entry.s.value);
            setPath(out, key, val);
        }
        return out;
    }
}

// --- helpers --------------------------------------------------------------

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function slider(f) {
    const i = document.createElement('input');
    i.type = 'range';
    i.min = f.min;
    i.max = f.max;
    i.step = f.step;
    return i;
}

function fmt(v, step) {
    const n = +v;
    return step && step < 1 ? n.toFixed(2) : String(n);
}

const num = (v) => +v;

function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
        o[ks[i]] = o[ks[i]] || {};
        o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
}
