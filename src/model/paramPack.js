// paramPack.js - Pipeline stage 3: Deterministic Parameter Pack.
//
// Resolves a species profile into a flat, rendering-free parameter object that
// the skeleton builder consumes. The HERO model (Live Oak) is a DECLARATIVE
// description of one finished, ideal specimen at the apex of its beauty: there
// is NO age scaling, NO seasons, NO growth-over-time, NO LOD. This file simply
// flattens the hero contract into the pack the grower reads.
//
// Legacy species profiles (the older field shape) are still supported via a
// fallback mapping so the rest of the registry keeps working unchanged. The
// hero shape is detected by the presence of `species.hero`. (The `intent`
// argument is accepted for signature compatibility but no longer scales the
// specimen - only the RNG seed varies a build run-to-run, never the ideal form.)

import { deg } from './vec3.js';

export function resolveParams(species, intent) {
    if (species && species.hero) return resolveHero(species);
    return resolveLegacy(species, intent);
}

// --- HERO model -> flat pack ------------------------------------------------
//
// Maps the declarative Live Oak contract directly. No instance intent touches
// the geometry: the only thing that varies run-to-run is the RNG seed applied
// downstream by the grower (which limb wanders where), never the ideal form.
function resolveHero(s) {
    const trunkR = s.hero.trunkDBH / 2;          // 4.0 ft DBH -> 2.0 ft radius
    const char = Math.max(0, Math.min(1, s.character ?? 0)); // Phase-2 amount (0 = gold)

    return {
        shape: 'hero',

        // --- Trunk ----------------------------------------------------------
        trunkRadius: trunkR,
        trunkTaper: s.trunk.taper,               // radius retained to the divide
        // Clear bole height before the trunk divides into scaffold limbs.
        trunkHeight: s.trunk.clearLength,
        trunkLean: s.trunk.lean,
        trunkFluting: s.trunk.fluting,
        trunkSegments: 5,
        dividesInto: s.trunk.dividesInto,        // [2,3] heavy leaders off the bole

        // --- Primary scaffold limbs ----------------------------------------
        scaffoldCount: s.scaffold.count,                 // [4,6]
        basalRadiusFraction: s.scaffold.basalRadiusFraction, // of divide radius
        scaffoldLengthFraction: s.scaffold.lengthFraction,
        takeoffAngleDeg: s.scaffold.takeoffAngle,        // [8,24] low take-off
        taperRetention: s.scaffold.taperRetention,       // slow-taper massive limb
        dip: s.scaffold.dipAndRise.dip,                  // sweep down...
        rise: s.scaffold.dipAndRise.rise,                // ...then arch up
        sinuosity: s.scaffold.sinuosity,                 // low-freq wander

        // Overall reach: spread is the diameter, so a limb reaches ~half of it.
        spread: s.hero.spread,
        height: s.hero.height,

        // --- Per-order branching character (secondary/tertiary/twig) -------
        // Indexed by parent order: a primary(1) spawns secondaries with the
        // 'secondary' rule, a secondary(2) spawns tertiaries, etc.
        branching: {
            1: ruleFor(s.branching, 'secondary'),
            2: ruleFor(s.branching, 'tertiary'),
            3: ruleFor(s.branching, 'twig'),
        },

        maxOrder: Math.min(4, s.maxOrderCap ?? 4), // trunk(0) .. twig(4)

        characterAmount: char,  // 0 = gold tree; gates the Phase-2 fields below

        minRadius: 0.02,

        // ==== NOT YET CONSUMED BY THE GROWER ================================
        // Species-contract fields buildSaneHero does not read yet. They are
        // flattened here so the grower can adopt them one at a time (and so
        // the architecture invariants can hold it to them) - but tuning them
        // today is a NO-OP for the hero. Do not wire them to live UI controls
        // until the grower consumes them.
        trunkFlare: s.trunk.flare,
        clearance: s.hero.clearance,
        crossOver: s.scaffold.crossOver,                 // allow limbs to cross
        dominanceStrength: s.dominance.strength,
        leaderRadiusShare: s.dominance.leaderRadiusShare,
        leaderLengthShare: s.dominance.leaderLengthShare,
        // Phase-2 (character) mechanics, scaled by the gold->aged amount. The
        // active grower implements no pruning/death/lean yet, so these are
        // inert; the removed simulation grower (git 986dc16) consumed them.
        pruneFrac: 0.34 * char,
        deathFrac: 0.13 * char,
        dirBiasAmount: char,        // crown lean / sparse quadrant (0 = balanced)
        // Crown/foliage: the foliage builder currently reads the species
        // profile directly (see TreeModel.buildTreeModel), not these fields.
        crownShape: s.crown.shape,
        leafPlacement: s.crown.placement,        // 'outer-shell'
        crownDensity: s.crown.density,
    };
}

function ruleFor(branching, order) {
    const r = (branching || []).find((b) => b.order === order) || {};
    return {
        count: r.count ?? [2, 3],
        divergenceDeg: r.divergence ?? [30, 50],
        lengthRatio: r.lengthRatio ?? 0.55,
        radiusRatio: r.radiusRatio ?? 0.7,
        straightness: r.straightness ?? 0.4,
    };
}

// --- Legacy species -> flat pack --------------------------------------------
//
// Kept so the non-hero registry entries (sycamore, maple, palm, ...) still
// resolve. No age scaling: legacy profiles render at their stated mature size.
function resolveLegacy(species, intent) {
    const trunkR = species.trunkDBH / 2;
    const maxOrder = Math.min(4, species.maxOrderCap ?? Infinity);

    return {
        shape: 'legacy',
        trunkRadius: trunkR,
        trunkTopFactor: 0.82,
        trunkHeight: species.trunkHeightToCrown,
        trunkLean: 0.5,
        trunkSegments: 6,

        primaryLimbCount: species.primaryLimbCount,
        primaryElevationDeg: species.primaryElevationDeg,
        primaryLength: species.matureSpread * (species.primaryLengthFactor ?? 0.34),
        primaryRadius: trunkR * 0.55,

        segments: species.segmentsPerBranch,
        lengthRatio: species.lengthRatio,
        radiusRatio: species.radiusRatio,
        divergenceDeg: species.divergenceDeg,
        childCounts: {
            1: species.branchesPerNode.secondary,
            2: species.branchesPerNode.tertiary,
            3: species.branchesPerNode.twig,
        },
        maxOrder,

        tipFactor: 0.55,
        forkFactor: 0.95,
        minRadius: 0.03,
        sweepUp: deg(species.sweepPerSegDeg),
        sag: deg(species.sagPerSegDeg),
        jitter: deg(species.jitterDeg),
        azJitter: deg(species.azJitterDeg),
    };
}
