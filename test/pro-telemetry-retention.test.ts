import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { recordGraphMemoryActivity } from "../pro/activity.ts";
import { recordGraphMemoryUsage } from "../pro/usage.ts";
import { pruneGraphMemoryTelemetry } from "../pro/telemetry-retention.ts";

it("prunes bounded old telemetry without touching memory facts, and supports dry-run", () => {
  const dir = mkdtempSync(join(tmpdir(), "gm-retention-"));
  const db = openDb(join(dir, "memory.db"));
  try {
    const old = Date.now() - 100 * 86_400_000;
    recordGraphMemoryActivity(db, { sessionId: "s", kind: "archive", status: "completed", message: "old" });
    db.prepare("UPDATE gm_runtime_activities SET created_at=? WHERE session_id='s'").run(old);
    recordGraphMemoryUsage(db, { id: "u1", sessionId: "s", turnIndex: 1, requestKind: "main-agent",
      provider: null, model: null, uncachedInputTokens: null, outputTokens: null, totalTokens: null,
      cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, usageComplete: false, createdAt: old });
    db.prepare("INSERT INTO gm_turn_memories (id, session_id, summary, outcome, created_at, updated_at) VALUES ('m', 's', 'fact', 'completed', ?, ?)").run(old, old);
    expect(pruneGraphMemoryTelemetry(db, { activityDays: 30, usageDays: 90, batchSize: 1, dryRun: true })).toMatchObject({ activities: 1, usage: 1, deletedActivities: 0, deletedUsage: 0 });
    expect(pruneGraphMemoryTelemetry(db, { activityDays: 30, usageDays: 90, batchSize: 1, dryRun: false })).toMatchObject({ deletedActivities: 1, deletedUsage: 1 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM gm_turn_memories").get() as any).n).toBe(1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});