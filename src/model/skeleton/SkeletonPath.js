// SkeletonPath.js - An ordered run of nodes forming one branch.
//
// Pipeline stage 4 data structure. A path is the trunk or a single branch: an
// ordered list of node ids. parentPathId links a branch back to the path it
// grew from. spine is model-owned curve data derived from the node controls.

export default class SkeletonPath {
    constructor({ id, parentPathId = null, nodeIds, order, role, spine = null }) {
        this.id = id;
        this.parentPathId = parentPathId;
        this.nodeIds = nodeIds; // ordered node ids, base -> tip
        this.order = order;
        this.role = role;
        this.structureClass = structureClass(order);
        this.isMajor = this.structureClass === 'trunk'
            || this.structureClass === 'scaffold'
            || this.structureClass === 'structural-limb';
        this.spine = spine;
    }
}

function structureClass(order) {
    switch (order) {
        case 'trunk': return 'trunk';
        case 'primary': return 'scaffold';
        case 'secondary': return 'structural-limb';
        case 'tertiary': return 'branch';
        case 'twig': return 'twig';
        default: return 'branch';
    }
}
