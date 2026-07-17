// architecture.js - Architecture instrumentation for the skeleton.
//
// Classifies every path into an architectural ZONE and reports the metrics we
// need to find broken invariants BEFORE changing the generator: per-zone counts,
// average length, continuation depth (how far a limb runs as one leader chain -
// the "snake" metric), base/tip radius, and termination reasons. It then checks
// a set of architectural invariants and names the FIRST one violated.
//
// Pure analysis - reads the skeleton, changes nothing.

export const ZONES = ['Trunk', 'Scaffold', 'Structural', 'Framework', 'Fine', 'Twig'];

// Distinct, legible colors for the Architecture View (0xRRGGBB).
export const ZONE_COLOR = {
    Trunk:     0x7b4a2d, // brown
    Scaffold:  0xd83a3a, // red
    Structural:0xef8a2b, // orange
    Framework: 0xf2d33c, // yellow
    Fine:      0x3fc46b, // green
    Twig:      0x3aa6e8, // blue
};

const ZONE_BY_ORDER = { trunk: 'Trunk', primary: 'Scaffold', secondary: 'Structural', tertiary: 'Framework', twig: 'Fine' };

function pathLength(path, nodes) {
    if (path.limbLength != null) return path.limbLength;
    let L = 0;
    for (let i = 1; i < path.nodeIds.length; i++) {
        const a = nodes[path.nodeIds[i - 1]].position;
        const b = nodes[path.nodeIds[i]].position;
        L += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    return L;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const round = (x, d = 2) => Number(x.toFixed(d));

export function analyzeArchitecture(skeleton) {
    const { paths, nodes } = skeleton;

    const z = {};
    for (const name of ZONES) z[name] = { count: 0, len: [], depth: [], baseR: [], tipR: [] };
    const termination = {};

    for (const p of paths) {
        const zone = p.zone || ZONE_BY_ORDER[p.order] || 'Fine';
        const bucket = z[zone] || z.Fine;
        bucket.count++;
        bucket.len.push(pathLength(p, nodes));
        bucket.depth.push(p.leaderDepth || 0);
        bucket.baseR.push(p.baseRadius != null ? p.baseRadius : nodes[p.nodeIds[0]].radius);
        bucket.tipR.push(p.tipRadius != null ? p.tipRadius : nodes[p.nodeIds[p.nodeIds.length - 1]].radius);
        const reason = p.termination || 'open';
        termination[reason] = (termination[reason] || 0) + 1;
    }

    const zones = {};
    let maxLeaderDepth = 0;
    for (const name of ZONES) {
        const b = z[name];
        const md = b.depth.length ? Math.max(...b.depth) : 0;
        maxLeaderDepth = Math.max(maxLeaderDepth, md);
        zones[name] = {
            count: b.count,
            avgLength: round(mean(b.len)),
            avgContinuationDepth: round(mean(b.depth)),
            maxContinuationDepth: md,
            avgBaseRadius: round(mean(b.baseR)),
            avgTipRadius: round(mean(b.tipR)),
        };
    }

    // --- INVARIANTS (ordered; we surface the FIRST violated) -----------------
    const inv = [];
    const add = (name, ok, detail) => inv.push({ name, ok, detail });

    add('few-scaffolds', zones.Scaffold.count >= 3 && zones.Scaffold.count <= 10,
        `Scaffold count = ${zones.Scaffold.count} (want 3-10 dominant limbs)`);

    // The agent's headline: a scaffold should ESTABLISH then hand off - not run on
    // as one leader chain. Deep leader chains = the "snake".
    add('scaffold-hands-off', maxLeaderDepth <= 3,
        `max continuation depth = ${maxLeaderDepth} (want <=3; higher means a limb runs on as one snake)`);

    // Radius hierarchy must strictly decrease Trunk > Scaffold > ... (no collapse).
    const rseq = ZONES.map((n) => zones[n].avgBaseRadius);
    let hierOk = true; let hierDetail = 'radius: ' + ZONES.map((n, i) => `${n} ${rseq[i]}`).join(' > ');
    for (let i = 1; i < ZONES.length; i++) {
        if (zones[ZONES[i]].count > 0 && zones[ZONES[i - 1]].count > 0 && rseq[i] >= rseq[i - 1]) {
            hierOk = false; hierDetail = `radius hierarchy collapses at ${ZONES[i - 1]}(${rseq[i - 1]}) -> ${ZONES[i]}(${rseq[i]})`;
            break;
        }
    }
    add('radius-hierarchy', hierOk, hierDetail);

    // Length hierarchy: each successive zone should be shorter on average.
    let lenOk = true; let lenDetail = 'avgLen: ' + ZONES.map((n) => `${n} ${zones[n].avgLength}`).join(' > ');
    for (let i = 2; i < ZONES.length; i++) { // start at Scaffold vs Structural
        const a = zones[ZONES[i - 1]]; const b = zones[ZONES[i]];
        if (a.count > 0 && b.count > 0 && b.avgLength >= a.avgLength) {
            lenOk = false; lenDetail = `length hierarchy collapses at ${ZONES[i - 1]}(${a.avgLength}) -> ${ZONES[i]}(${b.avgLength})`;
            break;
        }
    }
    add('length-hierarchy', lenOk, lenDetail);

    // Mortality should be visible. The dominant loss is PRUNING (branches lost
    // to competition before they ever grow); death/breakage is on top. Rate is
    // measured against everything that was ATTEMPTED, not against survivors.
    const m = skeleton.mortality || { attempted: 0, pruned: 0, died: 0 };
    const lost = m.pruned + m.died;
    const attempted = Math.max(1, m.attempted + m.died);
    const mortRate = lost / attempted;
    const character = skeleton.character ?? 1;
    if (character < 0.05) {
        // GOLD TREE (Phase 1): mortality must be ~0 - every branch survives, clean.
        add('gold-no-mortality', mortRate < 0.03,
            `gold tree: lost ${lost}/${attempted} (${round(100 * mortRate, 1)}%; want ~0, character=${character})`);
    } else {
        add('mortality-present', mortRate >= 0.2,
            `lost ${lost}/${attempted} attempted (${round(100 * mortRate, 1)}%: pruned ${m.pruned}, died ${m.died}; want >=20%)`);
    }
    const total = paths.length;

    const firstViolated = inv.find((i) => !i.ok) || null;

    return { zones, termination, mortality: { ...m, rate: round(mortRate, 3) }, maxLeaderDepth, invariants: inv, firstViolated, totalPaths: total };
}

// Human-readable one-screen report.
export function formatArchitecture(report) {
    const lines = [];
    lines.push('ZONE         count  avgLen  avgDepth maxDepth  baseR  tipR');
    for (const name of ZONES) {
        const s = report.zones[name];
        lines.push(
            name.padEnd(12)
            + String(s.count).padStart(5)
            + String(s.avgLength).padStart(8)
            + String(s.avgContinuationDepth).padStart(9)
            + String(s.maxContinuationDepth).padStart(9)
            + String(s.avgBaseRadius).padStart(7)
            + String(s.avgTipRadius).padStart(6),
        );
    }
    lines.push('');
    lines.push('termination: ' + Object.entries(report.termination).map(([k, v]) => `${k}=${v}`).join('  '));
    const mo = report.mortality;
    lines.push(`mortality: ${(mo.rate * 100).toFixed(0)}% of attempted (pruned ${mo.pruned}, died ${mo.died}, attempted ${mo.attempted})`);
    lines.push('');
    lines.push('invariants:');
    for (const i of report.invariants) lines.push(`  [${i.ok ? 'OK ' : 'XX '}] ${i.name}: ${i.detail}`);
    lines.push('');
    lines.push(report.firstViolated
        ? `FIRST VIOLATED: ${report.firstViolated.name} -> ${report.firstViolated.detail}`
        : 'ALL INVARIANTS PASS');
    return lines.join('\n');
}
