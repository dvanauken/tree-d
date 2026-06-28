// ControlPanel.js - Grouped parameter editor for the east region.
//
// Builds sliders for every editable species-profile parameter, split into
// logical groups. Scalars get one slider; [min,max] tuples get two. Editing
// fires onChange in real time. getValues() returns a partial species profile
// (overrides) ready for buildTreeModel; setValues(profile) loads a profile in.

// Counter for stable unique IDs (slider for= / aria-label linkage).
let _uid = 0;

const SCHEMA = [
    {
        group: 'Form & Scale',
        fields: [
            { key: 'matureHeight',        label: 'Height (ft)',           min: 5,   max: 120, step: 1    },
            { key: 'matureSpread',        label: 'Spread (ft)',           min: 5,   max: 140, step: 1    },
            { key: 'trunkDBH',            label: 'Trunk diameter (ft)',   min: 0.2, max: 6,   step: 0.1  },
            { key: 'trunkHeightToCrown',  label: 'Clear trunk (ft)',      min: 1,   max: 60,  step: 1    },
        ],
    },
    {
        group: 'Crown Structure',
        fields: [
            { key: 'primaryLimbCount',      label: 'Main limb count',    range: true, min: 1,   max: 24, step: 1    },
            { key: 'primaryElevationDeg',   label: 'Limb angle (°)', range: true, min: -30, max: 90, step: 1    },
            { key: 'primaryLengthFactor',   label: 'Limb length factor',              min: 0.1, max: 1.2, step: 0.01, default: 0.34 },
        ],
    },
    {
        group: 'Branch Detail',
        fields: [
            { key: 'branchesPerNode.secondary', label: 'Secondary branches', range: true, min: 1, max: 6,  step: 1    },
            { key: 'branchesPerNode.tertiary',  label: 'Tertiary branches',  range: true, min: 1, max: 6,  step: 1    },
            { key: 'branchesPerNode.twig',      label: 'Twigs per node',     range: true, min: 1, max: 6,  step: 1    },
            { key: 'divergenceDeg',             label: 'Branch spread (°)', range: true, min: 5, max: 80, step: 1 },
            { key: 'segmentsPerBranch',         label: 'Branch segments',                 min: 2, max: 12, step: 1    },
            { key: 'lengthRatio',               label: 'Length taper',                    min: 0.3, max: 0.9, step: 0.01 },
            { key: 'radiusRatio',               label: 'Thickness taper',                 min: 0.3, max: 0.9, step: 0.01 },
            { key: 'maxOrderCap',               label: 'Max branch depth',                min: 1,   max: 5,   step: 1, default: 5 },
        ],
    },
    {
        group: 'Character',
        fields: [
            { key: 'sweepPerSegDeg', label: 'Upward sweep (°)',      min: 0, max: 20, step: 0.5 },
            { key: 'sagPerSegDeg',   label: 'Branch droop (°)',       min: 0, max: 20, step: 0.5 },
            { key: 'jitterDeg',      label: 'Branch wander (°)',      min: 0, max: 15, step: 0.5 },
            { key: 'azJitterDeg',    label: 'Rotation variation (°)', min: 0, max: 45, step: 1   },
        ],
    },
    {
        group: 'Foliage',
        fields: [
            { key: 'leafSize',      label: 'Leaf size (ft)',  min: 0.2, max: 3,   step: 0.05, default: 0.85 },
            { key: 'leavesPerNode', label: 'Leaf density',    min: 1,   max: 5,   step: 1,    default: 2    },
        ],
    },
];

export class ControlPanel {
    constructor(host, onChange) {
        this.host = host;
        this.onChange = onChange;
        this.entries = {};
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
        const out  = el('span', 'param-out');

        if (f.range) {
            // Range pair: use a <span> as visual label + aria-labelledby on the group.
            const labelId = `param-lbl-${_uid++}`;
            const lbl = el('span', 'param-lbl', f.label);
            lbl.id = labelId;
            head.appendChild(lbl);
            head.appendChild(out);
            wrap.appendChild(head);

            const row = el('div', 'range-row');
            row.setAttribute('role', 'group');
            row.setAttribute('aria-labelledby', labelId);

            const lo = slider(f);
            lo.setAttribute('aria-label', `${f.label} minimum`);
            const hi = slider(f);
            hi.setAttribute('aria-label', `${f.label} maximum`);
            row.appendChild(lo);
            row.appendChild(hi);
            wrap.appendChild(row);

            const entry = { f, out, lo, hi, range: true };
            const update = () => { this._refresh(entry); if (this.onChange) this.onChange(); };
            lo.addEventListener('input', () => { if (+lo.value > +hi.value) hi.value = lo.value; update(); });
            hi.addEventListener('input', () => { if (+hi.value < +lo.value) lo.value = hi.value; update(); });
            this.entries[f.key] = entry;
        } else {
            // Scalar: proper <label for="id"> → <input id="id"> association.
            const uid = `param-${_uid++}`;
            const lbl = el('label', null, f.label);
            lbl.htmlFor = uid;
            head.appendChild(lbl);
            head.appendChild(out);
            wrap.appendChild(head);

            const s = slider(f);
            s.id = uid;
            wrap.appendChild(s);

            const entry = { f, out, s };
            s.addEventListener('input', () => { this._refresh(entry); if (this.onChange) this.onChange(); });
            this.entries[f.key] = entry;
        }
        return wrap;
    }

    _refresh(entry) {
        const { f, out } = entry;
        if (entry.range) {
            out.textContent = `${fmt(entry.lo.value, f.step)}–${fmt(entry.hi.value, f.step)}`;
            syncSliderFill(entry.lo);
            syncSliderFill(entry.hi);
        } else {
            out.textContent = fmt(entry.s.value, f.step);
            syncSliderFill(entry.s);
        }
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
    if (cls)      e.className   = cls;
    if (text != null) e.textContent = text;
    return e;
}

function slider(f) {
    const i = document.createElement('input');
    i.type = 'range';
    i.min  = f.min;
    i.max  = f.max;
    i.step = f.step;
    return i;
}

function syncSliderFill(i) {
    const min = Number(i.min) || 0;
    const max = Number(i.max) || 100;
    const val = Number(i.value);
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    i.style.setProperty('--pct', `${Math.max(0, Math.min(100, pct))}%`);
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
