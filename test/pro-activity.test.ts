import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { getGraphMemoryActivities, recordGraphMemoryActivity } from "../pro/activity.ts";

describe("Graph Memory runtime activity", () => {
  it("keeps activity session-scoped, newest-first and page-bounded", () => {
    const dir = mkdtempSync(join(tmpdir(), "gm-activity-"));
    const db = openDb(join(dir, "memory.db"));
    try {
      recordGraphMemoryActivity(db, { sessionId: "a", kind: "recall", status: "completed", message: "Injected 2 memories", details: { count: 2 } });
      recordGraphMemoryActivity(db, { sessionId: "b", kind: "archive", status: "completed", message: "Archived 8 events" });
      recordGraphMemoryActivity(db, { sessionId: "a", kind: "extraction", status: "failed", message: "Extraction failed" });
      expect(getGraphMemoryActivities(db, "a")).toMatchObject([
        { sessionId: "a", kind: "extraction", status: "failed" },
        { sessionId: "a", kind: "recall", status: "completed", details: { count: 2 } },
      ]);
      expect(getGraphMemoryActivities(db, "missing")).toEqual([]);
      expect(getGraphMemoryActivities(db, "a", 1)).toHaveLength(1);
      expect(() => getGraphMemoryActivities(db, "", 1)).toThrow(/sessionId/);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
