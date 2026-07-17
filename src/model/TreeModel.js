// TreeModel.js - The compiled tree asset and the function that builds it.
//
// Orchestrates the model-layer pipeline: species + intent -> parameter pack ->
// seeded RNG -> skeleton graph -> foliage -> metadata. The result is "tree
// truth" that a renderer adapter displays. The wood mesh is built by the
// renderer from the skeleton; foliage is pure data here.

import { getSpecies } from './species/index.js';
import defaultIntent from './intent.js';
import { resolveParams } from './paramPack.js';
import { makeRng } from './rng.js';
import { buildSkeleton } from './skeleton/buildSkeleton.js';
import { buildFoliage } from './foliage/buildFoliage.js';
import { analyzeArchitecture } from './analysis/architecture.js';

export default class TreeModel {
    constructor({ speciesKey, commonName, seed, intent, profile, skeleton, leaves, metadata }) {
        this.speciesKey = speciesKey;
        this.commonName = commonName;
        this.seed = seed;
        this.intent = intent;
        this.profile = profile; // resolved species profile used (with overrides)
        this.skeleton = skeleton; // { nodes, paths, bounds, crown? }
        this.woodMesh = null; // built by the renderer from the skeleton
        this.leaves = leaves; // Foliage Builder output
        this.metadata = metadata;
    }
}

// Deep-ish merge of profile overrides onto a base species profile. Only the
// legacy slider fields are merged (the panel emits legacy field names). The
// hero's nested blocks (hero/trunk/scaffold/dominance/branching/crown/surface)
// are preserved because the panel never writes those keys.
function mergeProfile(base, p) {
    if (!p) return base;
    if (base.hero) return mergeHeroProfile(base, p);
    return {
        ...base,
        ...p,
        branchesPerNode: { ...base.branchesPerNode, ...(p.branchesPerNode || {}) },
    };
}

function mergeHeroProfile(base, p) {
    const out = {
        ...base,
        ...p,
        hero: { ...base.hero },
        trunk: { ...base.trunk },
        scaffold: {
            ...base.scaffold,
            dipAndRise: { ...(base.scaffold && base.scaffold.dipAndRise) },
        },
        dominance: { ...base.dominance },
        crown: { ...base.crown },
        surface: {
            ...base.surface,
            bark: { ...(base.surface && base.surface.bark) },
            leaf: { ...(base.surface && base.surface.leaf) },
        },
        branching: (base.branching || []).map((b) => ({ ...b })),
        branchesPerNode: { ...base.branchesPerNode, ...(p.branchesPerNode || {}) },
    };

    if (p.matureHeight != null) out.hero.height = p.matureHeight;
    if (p.matureSpread != null) out.hero.spread = p.matureSpread;
    if (p.trunkDBH != null) out.hero.trunkDBH = p.trunkDBH;
    if (p.trunkHeightToCrown != null) out.trunk.clearLength = p.trunkHeightToCrown;
    if (p.primaryLimbCount) out.scaffold.count = p.primaryLimbCount;
    if (p.primaryElevationDeg) out.scaffold.takeoffAngle = p.primaryElevationDeg;
    if (p.primaryLengthFactor != null) out.scaffold.lengthFraction = p.primaryLengthFactor;
    if (p.maxOrderCap != null) out.maxOrderCap = p.maxOrderCap;
    if (p.leafSize != null) out.crown.leafSize = p.leafSize;
    if (p.leavesPerNode != null) out.leavesPerNode = p.leavesPerNode;

    const setBranch = (order, key, value) => {
        const rule = out.branching.find((b) => b.order === order);
        if (rule && value != null) rule[key] = value;
    };
    if (p.branchesPerNode) {
        setBranch('secondary', 'count', p.branchesPerNode.secondary);
        setBranch('tertiary', 'count', p.branchesPerNode.tertiary);
        setBranch('twig', 'count', p.branchesPerNode.twig);
    }
    if (p.divergenceDeg) {
        setBranch('secondary', 'divergence', p.divergenceDeg);
        setBranch('tertiary', 'divergence', p.divergenceDeg);
        setBranch('twig', 'divergence', p.divergenceDeg);
    }
    if (p.lengthRatio != null) {
        for (const rule of out.branching) rule.lengthRatio = p.lengthRatio;
    }
    if (p.radiusRatio != null) {
        for (const rule of out.branching) rule.radiusRatio = p.radiusRatio;
    }

    return out;
}

export function buildTreeModel(speciesKey, options = {}) {
    const { ageClass, seed, profile } = options;
    const species = mergeProfile(getSpecies(speciesKey), profile);

    // ageClass is accepted for UI/back-compat but no longer scales the form:
    // the hero is one finished ideal specimen and legacy species render mature.
    const intent = { ...defaultIntent };
    if (ageClass !== undefined) intent.ageClass = ageClass;
    if (seed !== undefined) intent.seed = seed;

    const params = resolveParams(species, intent);
    const rng = makeRng(intent.seed);
    const skeleton = buildSkeleton(params, rng);

    // Foliage options. The hero stores per-leaf size at crown.leafSize (a single
    // ~0.2 ft blade); the canopy builder works in CLUSTER cards, so derive a
    // cluster scale for the hero and fall back to the legacy top-level leafSize.
    const isHero = !!species.hero;
    const leafSize = isHero
        ? (species.crown?.leafSize != null ? species.crown.leafSize * 5 : 1.0)
        : species.leafSize;

    const leaves = buildFoliage(skeleton, rng, {
        leafSize,
        leavesPerNode: species.leavesPerNode,
        placement: species.crown?.placement ?? 'outer-shell',
        crownDensity: species.crown?.density,
        maxLeaves: species.maxLeaves ?? 14000,
    });

    const b = skeleton.bounds;
    const metadata = {
        nodeCount: skeleton.nodes.length,
        pathCount: skeleton.paths.length,
        leafCount: leaves.length,
        height: b.max[2] - b.min[2],
        spread: Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]),
        trunkDBH: params.trunkRadius * 2,
        architecture: analyzeArchitecture(skeleton),
    };

    return new TreeModel({
        speciesKey,
        commonName: species.commonName,
        seed: intent.seed,
        intent,
        profile: species,
        skeleton,
        leaves,
        metadata,
    });
}
