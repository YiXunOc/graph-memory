import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { getGraphMemoryActivities, recordGraphMemoryActivity } from "../pro/activity.ts";

it("persists scoped Graph Memory activity across independent SQLite connections", () => {
  const dir = mkdtempSync(join(tmpdir(), "gm-activity-"));
  const path = join(dir, "memory.db");
  try {
    const writer = openDb(path);
    recordGraphMemoryActivity(writer, { sessionId: "dsh:one", kind: "archive", status: "completed", message: "归档完成", details: { events: 3 }, turnIndex: 2 });
    recordGraphMemoryActivity(writer, { sessionId: "dsh:two", kind: "recall", status: "completed", message: "召回完成" });
    writer.close();
    const reader = openDb(path);
    expect(getGraphMemoryActivities(reader, "dsh:one")).toMatchObject([{ kind: "archive", message: "归档完成", details: { events: 3 }, turnIndex: 2 }]);
    expect(getGraphMemoryActivities(reader, "dsh:two")).toHaveLength(1);
    expect(() => getGraphMemoryActivities(reader, "", 30)).toThrow(/session/i);
    reader.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});