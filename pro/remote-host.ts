import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {
  GraphMemoryProHostApi,
  GraphMemoryActivity,
  GraphMemoryOverview,
  GraphMemoryRelationRow,
  GraphMemoryTurnRow,
  GraphMemoryUsageRow,
  GraphNodeDetail,
  GraphNodeId,
  GraphSnapshot,
  GraphSnapshotRequest,
} from "./types.ts";

type RemoteInitializer = (this: GraphMemoryProRemoteService) => void;
const remoteInitializers: RemoteInitializer[] = [];

/** DSH Typert service exposing only bounded, read-only graph operations. */
export class GraphMemoryProRemoteService extends TypertRemoteService {
  private readonly api: GraphMemoryProHostApi;

  constructor(ctx: unknown, api: GraphMemoryProHostApi) {
    super(ctx, "graphMemoryPro");
    this.api = api;
    for (const initialize of remoteInitializers) initialize.call(this);
  }

  /** Return one validated, bounded graph projection. */
  snapshot(request: GraphSnapshotRequest): GraphSnapshot {
    return this.api.getSnapshot(request);
  }

  /** Return bounded content for one selected opaque node id. */
  detail(id: GraphNodeId): GraphNodeDetail | null {
    return this.api.getNodeDetail(id);
  }

  /** Return bounded runtime activity without changing the model-visible surface. */
  activity(sessionId: string, limit?: number): GraphMemoryActivity[] {
    return this.api.getActivities(sessionId, limit);
  }

  overview(): GraphMemoryOverview { return this.api.getOverview(); }
  turns(query?: string, limit?: number): GraphMemoryTurnRow[] { return this.api.getTurnMemories(query, limit); }
  relations(query?: string, limit?: number): GraphMemoryRelationRow[] { return this.api.getRelations(query, limit); }
  usage(sessionId: string, limit?: number): GraphMemoryUsageRow[] { return this.api.getUsage(sessionId, limit); }
}

function markRemote(method: "snapshot" | "detail" | "activity" | "overview" | "turns" | "relations" | "usage"): void {
  Remote(method)(GraphMemoryProRemoteService.prototype[method] as (...args: any[]) => any, {
    name: method,
    private: false,
    static: false,
    addInitializer(initializer: RemoteInitializer) {
      remoteInitializers.push(initializer);
    },
  } as unknown as ClassMethodDecoratorContext);
}

markRemote("snapshot");
markRemote("detail");
markRemote("activity");
markRemote("overview");
markRemote("turns");
markRemote("relations");
markRemote("usage");
