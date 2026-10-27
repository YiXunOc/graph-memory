import { randomUUID } from "node:crypto";
import type { DatabaseSyncInstance } from "../src/store/sqlite.ts";
import type { GraphMemoryActivity, GraphMemoryActivityKind } from "./types.ts";

export function recordGraphMemoryActivity(db: DatabaseSyncInstance, input: {
  sessionId: string;
  kind: GraphMemoryActivityKind;
  status: GraphMemoryActivity["status"];
  message: string;
  details?: Record<string, number | string | boolean>;
  turnIndex?: number;
  stepIndex?: number;
  eventSeq?: number;
  operationId?: string;
}): GraphMemoryActivity {
  if (!input.sessionId) throw new TypeError("activity requires sessionId");
  const activity: GraphMemoryActivity = {
    id: randomUUID(),
    sessionId: input.sessionId,
    kind: input.kind,
    status: input.status,
    message: input.message,
    ...(input.details ? { details: input.details } : {}),
    ...(input.turnIndex === undefined ? {} : { turnIndex: input.turnIndex }),
    createdAt: Date.now(),
  };
  db.prepare(`INSERT INTO gm_runtime_activities
    (id, session_id, turn_index, step_index, event_seq, operation_id, kind, status, message, details_json, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    activity.id, activity.sessionId, input.turnIndex ?? null, input.stepIndex ?? null,
    input.eventSeq ?? null, input.operationId ?? null, activity.kind, activity.status,
    activity.message, JSON.stringify(activity.details ?? {}), activity.createdAt,
    activity.status === "started" ? null : activity.createdAt,
  );
  return activity;
}

export function getGraphMemoryActivities(db: DatabaseSyncInstance, sessionId: string, limit = 30): GraphMemoryActivity[] {
  if (!sessionId) throw new TypeError("activity requires sessionId");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("activity limit must be 1..100");
  const rows = db.prepare(`SELECT id, session_id, turn_index, kind, status, message, details_json, created_at
    FROM gm_runtime_activities WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(sessionId, limit) as Array<{
    id: string; session_id: string; turn_index: number | null; kind: GraphMemoryActivityKind;
    status: GraphMemoryActivity["status"]; message: string; details_json: string; created_at: number;
  }>;
  return rows.map(row => ({
    id: row.id, sessionId: row.session_id, kind: row.kind, status: row.status,
    message: row.message, details: JSON.parse(row.details_json), createdAt: row.created_at,
    ...(row.turn_index === null ? {} : { turnIndex: row.turn_index }),
  }));
}
