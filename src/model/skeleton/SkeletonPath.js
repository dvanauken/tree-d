// SkeletonPath.js - An ordered run of nodes forming one branch.
//
// Pipeline stage 4 data structure. A path is the trunk or a single branch: an
// ordered list of node ids. parentPathId links a branch back to the path it
// grew from. The wood surface builder will later skin geometry along paths.

export default class SkeletonPath {
    constructor({ id, parentPathId = null, nodeIds, order, role }) {
        this.id = id;
        this.parentPathId = parentPathId;
        this.nodeIds = nodeIds; // ordered node ids, base -> tip
        this.order = order;
        this.role = role;
    }
}
