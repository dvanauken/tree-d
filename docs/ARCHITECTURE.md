# Architecture

`tree-d` should behave like a compiler for tree assets.

## Pipeline

1. Species Profile
   - Botanical and site-planning defaults.
   - Mature height/spread/DBH.
   - Branching habit, bark, leaf morphology, seasonality.

2. Instance Intent
   - User/project-level request.
   - Age class, clearance, pruning, asymmetry, health, seed, site response.

3. Deterministic Parameter Pack
   - Resolved species + intent + seed.
   - No rendering dependencies.

4. Skeleton Graph
   - Nodes and paths with parent/child relationships.
   - Orders such as trunk, primary limb, secondary branch, twig, leaf stem.
   - Radii, taper, sweep, sag, fork metadata, pruning metadata.

5. Wood Surface Builder
   - Model-layer geometry generation.
   - Organic trunk and branch skins from skeleton paths.
   - Fork blending, root flare, bark UVs, normals, material regions.

6. Foliage Builder
   - Leaf stems, petioles, individual leaves, shoots, clusters.
   - Species-specific leaf geometry.
   - Seasonal variants later.

7. Renderer Adapter
   - Converts generated model data into runtime geometry.
   - Applies materials/textures/lights.
   - Does not create tree morphology.

8. Export/LOD Pipeline
   - Future work.
   - GLB, KTX2, meshopt, atlases, impostors.

## Core Boundary

The model layer owns tree truth.

The renderer may choose how to display generated data, but it must not decide
whether a Live Oak has low sweeping limbs, how wide its trunk is, where the
canopy begins, or how leaves attach.

## First Data Structures

```js
class SkeletonNode {
  id;
  parentId;
  position; // [x, y, z], feet
  radius;
  order; // trunk, primary, secondary, twig, leafStem
  role;
  children;
}

class SkeletonPath {
  id;
  parentPathId;
  nodeIds;
  order;
  role;
}

class TreeModel {
  speciesKey;
  seed;
  skeleton;
  woodMesh;
  leaves;
  metadata;
}
```

