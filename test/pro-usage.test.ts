import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { getGraphMemoryUsage, recordGraphMemoryUsage } from "../pro/usage.ts";

it("persists main-agent usage with null cache buckets when the provider omits them", () => {
  const dir = mkdtempSync(join(tmpdir(), "gm-usage-"));
  const path = join(dir, "memory.db");
  try {
    const db = openDb(path);
    recordGraphMemoryUsage(db, { id: "dsh:one:11", sessionId: "dsh:one", turnIndex: 2,
      requestKind: "main-agent", provider: "provider", model: "model",
      uncachedInputTokens: 10, outputTokens: 2, totalTokens: 12,
      cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, usageComplete: true });
    expect(recordGraphMemoryUsage(db, { id: "dsh:one:11", sessionId: "dsh:one", turnIndex: 2,
      requestKind: "main-agent", provider: "provider", model: "model",
      uncachedInputTokens: 10, outputTokens: 2, totalTokens: 12,
      cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, usageComplete: true })).toBe(false);
    db.close();
    const reopened = openDb(path);
    expect(getGraphMemoryUsage(reopened, "dsh:one")).toMatchObject([{
      requestKind: "main-agent", cacheReadTokens: null, cacheWriteTokens: null, usageComplete: true,
    }]);
    expect(getGraphMemoryUsage(reopened, "dsh:two")).toEqual([]);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});