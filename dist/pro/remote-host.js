import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
const remoteInitializers = [];
/** DSH Typert service exposing only bounded, read-only graph operations. */
export class GraphMemoryProRemoteService extends TypertRemoteService {
    api;
    constructor(ctx, api) {
        super(ctx, "graphMemoryPro");
        this.api = api;
        for (const initialize of remoteInitializers)
            initialize.call(this);
    }
    /** Return one validated, bounded graph projection. */
    snapshot(request) {
        return this.api.getSnapshot(request);
    }
    /** Return bounded content for one selected opaque node id. */
    detail(id) {
        return this.api.getNodeDetail(id);
    }
    /** Return bounded runtime activity without changing the model-visible surface. */
    activity(sessionId, limit) {
        return this.api.getActivities(sessionId, limit);
    }
    overview() { return this.api.getOverview(); }
    turns(query, limit) { return this.api.getTurnMemories(query, limit); }
    relations(query, limit) { return this.api.getRelations(query, limit); }
    usage(sessionId, limit) { return this.api.getUsage(sessionId, limit); }
}
function markRemote(method) {
    Remote(method)(GraphMemoryProRemoteService.prototype[method], {
        name: method,
        private: false,
        static: false,
        addInitializer(initializer) {
            remoteInitializers.push(initializer);
        },
    });
}
markRemote("snapshot");
markRemote("detail");
markRemote("activity");
markRemote("overview");
markRemote("turns");
markRemote("relations");
markRemote("usage");
