import type { EdgeType, NodeStatus, NodeType } from "../src/types.ts";

export type GraphNodeType = NodeType | "TURN" | "TERM";
export type GraphEdgeType = EdgeType | "NAVIGATES";

export type GraphMemoryActivityKind = "archive" | "projection" | "recall" | "extraction" | "embedding";

export interface GraphMemoryActivity {
  id: string;
  sessionId: string;
  kind: GraphMemoryActivityKind;
  status: "started" | "completed" | "failed";
  message: string;
  details?: Record<string, number | string | boolean>;
  turnIndex?: number;
  createdAt: number;
}

export interface GraphMemoryUsageRow {
  id: string;
  sessionId: string;
  turnIndex: number;
  requestKind: "main-agent" | "graph-extraction" | "embedding";
  provider: string | null;
  model: string | null;
  uncachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  usageComplete: boolean;
  createdAt: number;
}

export interface GraphMemoryTurnRow {
  id: string;
  summary: string;
  outcome: string;
  createdAt: number;
  updatedAt: number;
  sourceAvailable: boolean;
  tripleCount: number;
}

export interface GraphMemoryRelationRow {
  id: string;
  memoryId: string;
  subject: string;
  predicate: string;
  object: string;
  summary: string;
  outcome: string;
  createdAt: number;
}

export interface GraphMemoryOverview {
  turnMemories: number;
  navigationTerms: number;
  navigationTriples: number;
  navigationCommunities: number;
  legacyNodes: number;
  legacyEdges: number;
  extraction: { pending: number; succeeded: number; quarantined: number };
  turnVectors: number;
}

/** Opaque graph node identifier accepted by the Pro Host API. */
export type GraphNodeId = string & { readonly __graphNodeId: unique symbol };

/** Opaque graph edge identifier emitted by the Pro Host API. */
export type GraphEdgeId = string & { readonly __graphEdgeId: unique symbol };

/** Filters and result limits for a browser-safe graph projection. */
export interface GraphSnapshotRequest {
  query?: string;
  nodeTypes?: GraphNodeType[];
  maxNodes?: number;
}

/** Node fields safe to render in a graph overview. */
export interface GraphSnapshotNode {
  id: GraphNodeId;
  type: GraphNodeType;
  name: string;
  description: string;
  status: NodeStatus;
  validatedCount: number;
  sourceSessionCount: number;
  communityId: string | null;
  pagerank: number;
  createdAt: number;
  updatedAt: number;
}

/** Edge fields safe to render in a graph overview. */
export interface GraphSnapshotEdge {
  id: GraphEdgeId;
  fromId: GraphNodeId;
  toId: GraphNodeId;
  type: GraphEdgeType;
  instruction: string;
  condition?: string;
  createdAt: number;
}

/** Bounded graph data transferred from the DSH Host to a trusted Client plugin. */
export interface GraphSnapshot {
  generatedAt: number;
  nodes: GraphSnapshotNode[];
  edges: GraphSnapshotEdge[];
  totals: {
    nodes: number;
    edges: number;
  };
  truncated: {
    nodes: boolean;
    edges: boolean;
  };
}

/** Full content fetched only after the user selects a known node identifier. */
export interface GraphNodeDetail extends GraphSnapshotNode {
  content: string;
  contentTruncated: boolean;
}

/** Host-owned read API; no database handle, query language, or credential crosses it. */
export interface GraphMemoryProHostApi {
  getSnapshot(request?: GraphSnapshotRequest): GraphSnapshot;
  getNodeDetail(id: GraphNodeId): GraphNodeDetail | null;
  getActivities(sessionId: string, limit?: number): GraphMemoryActivity[];
  getUsage(sessionId: string, limit?: number): GraphMemoryUsageRow[];
  getOverview(): GraphMemoryOverview;
  getTurnMemories(query?: string, limit?: number): GraphMemoryTurnRow[];
  getRelations(query?: string, limit?: number): GraphMemoryRelationRow[];
}
