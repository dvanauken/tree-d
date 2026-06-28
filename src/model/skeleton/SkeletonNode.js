// SkeletonNode.js - A single node in the tree skeleton graph.
//
// Pipeline stage 4 data structure. Positions are in feet. The node knows its
// parent and children by id (ids equal their index in the skeleton node array).

export default class SkeletonNode {
    constructor({ id, parentId = null, position, radius, order, role }) {
        this.id = id;
        this.parentId = parentId;
        this.position = position; // [x, y, z], feet
        this.radius = radius; // feet
        this.order = order; // 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'twig'
        this.role = role; // 'trunk' | 'branch'
        this.children = [];
    }
}
