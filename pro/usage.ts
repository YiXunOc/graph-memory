import type { DatabaseSyncInstance } from "../src/store/sqlite.ts";
import type { GraphMemoryUsageRow } from "./types.ts";

export function recordGraphMemoryUsage(db: DatabaseSyncInstance, row: Omit<GraphMemoryUsageRow, "createdAt"> & { createdAt?: number }): boolean {
  if (!row.sessionId) throw new TypeError("usage requires sessionId");
  const written = db.prepare(`INSERT OR IGNORE INTO gm_provider_usage
    (id, session_id, turn_index, request_kind, provider, model, uncached_input_tokens,
     output_tokens, total_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
     usage_complete, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.sessionId, row.turnIndex, row.requestKind, row.provider, row.model,
    row.uncachedInputTokens, row.outputTokens, row.totalTokens, row.cacheReadTokens,
    row.cacheWriteTokens, row.reasoningTokens, row.usageComplete ? 1 : 0, row.createdAt ?? Date.now(),
  );
  return Number(written.changes) > 0;
}

export function getGraphMemoryUsage(db: DatabaseSyncInstance, sessionId: string, limit = 30): GraphMemoryUsageRow[] {
  if (!sessionId) throw new TypeError("usage requires sessionId");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("usage limit must be 1..100");
  const rows = db.prepare(`SELECT * FROM gm_provider_usage WHERE session_id=?
    ORDER BY turn_index DESC, created_at DESC, id DESC LIMIT ?`).all(sessionId, limit) as any[];
  return rows.map(row => ({
    id: String(row.id), sessionId: String(row.session_id), turnIndex: Number(row.turn_index),
    requestKind: row.request_kind, provider: row.provider, model: row.model,
    uncachedInputTokens: row.uncached_input_tokens === null ? null : Number(row.uncached_input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    totalTokens: row.total_tokens === null ? null : Number(row.total_tokens),
    cacheReadTokens: row.cache_read_tokens === null ? null : Number(row.cache_read_tokens),
    cacheWriteTokens: row.cache_write_tokens === null ? null : Number(row.cache_write_tokens),
    reasoningTokens: row.reasoning_tokens === null ? null : Number(row.reasoning_tokens),
    usageComplete: Boolean(row.usage_complete), createdAt: Number(row.created_at),
  }));
}
