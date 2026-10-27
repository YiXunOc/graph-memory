import type { DatabaseSyncInstance } from "../src/store/sqlite.ts";

export interface TelemetryRetentionPolicy {
  activityDays: number;
  usageDays: number;
  batchSize: number;
  dryRun: boolean;
}

export function normalizeTelemetryRetentionPolicy(input: Partial<TelemetryRetentionPolicy> = {}): TelemetryRetentionPolicy {
  const policy = { activityDays: input.activityDays ?? 30, usageDays: input.usageDays ?? 90,
    batchSize: input.batchSize ?? 500, dryRun: input.dryRun ?? false };
  for (const [key, value] of Object.entries(policy)) {
    if (key === "dryRun") { if (typeof value !== "boolean") throw new TypeError("dryRun must be boolean"); }
    else if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > (key === "batchSize" ? 10_000 : 36_500)) {
      throw new TypeError(`${key} must be a positive bounded integer`);
    }
  }
  return policy;
}

/** Independently prune telemetry; never touch memory or source tables. */
export function pruneGraphMemoryTelemetry(
  db: DatabaseSyncInstance, input: Partial<TelemetryRetentionPolicy> = {}, now = Date.now(),
): { activities: number; usage: number; deletedActivities: number; deletedUsage: number } {
  const policy = normalizeTelemetryRetentionPolicy(input);
  const select = (table: "gm_runtime_activities" | "gm_provider_usage", days: number) =>
    (db.prepare(`SELECT id FROM ${table} WHERE created_at < ? ORDER BY created_at, id LIMIT ?`)
      .all(now - days * 86_400_000, policy.batchSize) as Array<{ id: string }>).map(row => row.id);
  db.exec(policy.dryRun ? "BEGIN" : "BEGIN IMMEDIATE");
  try {
    const activities = select("gm_runtime_activities", policy.activityDays);
    const usage = select("gm_provider_usage", policy.usageDays);
    const remove = (table: "gm_runtime_activities" | "gm_provider_usage", ids: string[]) => {
      if (policy.dryRun || !ids.length) return 0;
      const placeholders = ids.map(() => "?").join(",");
      return Number(db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids).changes);
    };
    const deletedActivities = remove("gm_runtime_activities", activities);
    const deletedUsage = remove("gm_provider_usage", usage);
    db.exec("COMMIT");
    return { activities: activities.length, usage: usage.length, deletedActivities, deletedUsage };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
