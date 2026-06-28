# tree-d

Hero-first procedural tree generation for architectural and site-analysis use.

This project starts clean from the lessons learned in `tree-3d`: trees are not
renderer primitives. A tree is generated from species knowledge, site intent,
and a hierarchical skeleton graph. Geometry, leaves, stems, bark, and eventual
exports are compiled from that graph.

## Current Direction

- Accuracy before LOD.
- Hero tree first, especially Live Oak.
- Species identity matters: silhouette, bark, branch habit, leaf shape, and
  managed site-planning clearance.
- Leaves attach to stems, stems attach to twigs, twigs attach to branches.
- Renderer code displays generated assets; it does not decide tree morphology.

## First Target

Live Oak (`Quercus virginiana`) as a mature residential/site-planning specimen:

- broad spreading evergreen crown
- managed canopy clearance around 7-8 ft
- trunk DBH based on species profile, not exaggerated mass
- low heavy scaffold limbs
- fine branch hierarchy visible in winter/sparse views
- small leathery oblong leaves on short stems

## Non-Goals For The First Pass

- No generic cylinder/tube/primitive-driven tree form.
- No premature impostor/LOD/export pipeline.
- No broad species catalog before Live Oak reads correctly.

