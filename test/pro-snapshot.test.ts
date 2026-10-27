import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { upsertEdge, upsertNode, saveMessageOnce, upsertTurnMemory, replaceNavigationTriples } from "../src/store/store.ts";
import { SqliteGraphSnapshotStore } from "../pro/sqlite.ts";
import type { GraphNodeId } from "../pro/types.ts";

const cleanup: string[] = [];

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "graph-memory-pro-"));
  cleanup.push(dir);
  return join(dir, "memory.db");
}

afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SQLite Pro snapshot store", () => {
  it("returns a bounded projection without session identifiers or node content", () => {
    const dbPath = fixture();
    const db = openDb(dbPath);
    const task = upsertNode(db, {
      type: "TASK",
      name: "ship-dsh-plugin",
      description: "Ship a native DSH plugin",
      content: "private implementation notes",
    }, "dsh:session-secret").node;
    const skill = upsertNode(db, {
      type: "SKILL",
      name: "plugin-install",
      description: "Install a DSH bundle",
      content: "private command history",
    }, "dsh:session-secret").node;
    upsertEdge(db, {
      fromId: task.id,
      toId: skill.id,
      type: "USED_SKILL",
      instruction: "Use the installer",
      sessionId: "dsh:session-secret",
    });
    db.close();

    const store = new SqliteGraphSnapshotStore({
      dbPath,
      defaultNodeLimit: 1,
      detailContentLimit: 8,
    });
    const first = store.getSnapshot();
    expect(first.nodes).toHaveLength(1);
    expect(first.truncated.nodes).toBe(true);
    expect(first.totals).toEqual({ nodes: 2, edges: 1 });
    expect(JSON.stringify(first)).not.toContain("session-secret");
    expect(JSON.stringify(first)).not.toContain("private implementation notes");

    const complete = store.getSnapshot({ maxNodes: 2 });
    expect(complete.nodes).toHaveLength(2);
    expect(complete.edges).toHaveLength(1);
    expect(store.getNodeDetail(task.id as GraphNodeId)).toMatchObject({
      content: "private ",
      contentTruncated: true,
    });
    store.close();
  });

  it("projects turn memories and SPO navigation into the bounded graph snapshot", () => {
    const dbPath = fixture();
    const db = openDb(dbPath);
    saveMessageOnce(db, "source-user", "private-session", 1, "user", "请配置应用端口");
    saveMessageOnce(db, "source-assistant", "private-session", 1, "assistant", "端口已配置为 8080");
    const memory = upsertTurnMemory(db, {
      sessionId: "private-session",
      summary: "用户要求配置应用端口，最终回答确认端口为 8080。",
      outcome: "completed",
      sources: [
        { messageId: "source-user", turnIndex: 1 },
        { messageId: "source-assistant", turnIndex: 1 },
      ],
    });
    replaceNavigationTriples(db, memory, [{ subject: "应用端口", predicate: "配置为", object: "8080" }]);
    db.close();

    const store = new SqliteGraphSnapshotStore({ dbPath });
    const snapshot = store.getSnapshot();
    expect(snapshot.nodes.map(({ type, name }) => ({ type, name })).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { type: "TERM", name: "8080" },
      { type: "TERM", name: "应用端口" },
      { type: "TURN", name: "用户要求配置应用端口，最终回答确认端口为 8080。" },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    expect(snapshot.edges).toMatchObject([{
      type: "NAVIGATES",
      instruction: "配置为",
    }]);
    expect(snapshot.totals).toEqual({ nodes: 3, edges: 1 });
    expect(JSON.stringify(snapshot)).not.toContain("private-session");
    expect(JSON.stringify(snapshot)).not.toContain("source-user");

    expect(store.getTurnMemories().map((row) => row.id)).toEqual([`turn:${memory.id}`]);
    expect(store.getTurnMemories()[0].sourceAvailable).toBe(true);
    const partial = openDb(dbPath);
    partial.prepare("DELETE FROM gm_messages WHERE id='source-assistant'").run();
    partial.close();
    expect(store.getTurnMemories()[0].sourceAvailable).toBe(false);
    const detail = store.getNodeDetail(snapshot.nodes.find((node) => node.type === "TURN")!.id);
    expect(detail).toMatchObject({ type: "TURN" });
    expect(detail?.content).toContain("用户要求配置应用端口，最终回答确认端口为 8080。");
    expect(detail?.content).toContain("请配置应用端口");
    expect(detail?.content).not.toContain("端口已配置为 8080");
    expect(JSON.stringify(detail)).not.toContain("private-session");
    expect(store.getNodeDetail(snapshot.nodes.find((node) => node.type === "TERM" && node.name === "应用端口")!.id)).toMatchObject({ type: "TERM", content: "应用端口" });
    expect(store.getSnapshot({ query: "应用端口", nodeTypes: ["TERM"] }).nodes.map((node) => node.name)).toEqual(["应用端口"]);
    expect(store.getRelations()[0].memoryId).toBe(`turn:${memory.id}`);
    expect(store.getNodeDetail("turn:unknown" as GraphNodeId)).toBeNull();
    store.close();
  });

  it("keeps SPO endpoints visible when summaries exceed the snapshot limit", () => {
    const dbPath = fixture();
    const db = openDb(dbPath);
    for (let index = 0; index < 8; index += 1) {
      saveMessageOnce(db, `user-${index}`, "private-session", index, "user", `问题 ${index}`);
      const memory = upsertTurnMemory(db, {
        sessionId: "private-session",
        summary: `轮次 ${index}`,
        outcome: "completed",
        sources: [{ messageId: `user-${index}`, turnIndex: index }],
      });
      replaceNavigationTriples(db, memory, [{ subject: "应用端口", predicate: "配置为", object: "8080" }]);
    }
    db.close();
    const store = new SqliteGraphSnapshotStore({ dbPath });
    const snapshot = store.getSnapshot({ maxNodes: 4 });
    expect(snapshot.nodes.some((node) => node.type === "TURN")).toBe(true);
    expect(snapshot.nodes.filter((node) => node.type === "TERM")).toHaveLength(2);
    expect(snapshot.edges.some((edge) => edge.type === "NAVIGATES")).toBe(true);
    expect(snapshot.totals).toEqual({ nodes: 10, edges: 8 });
    expect(snapshot.truncated.nodes).toBe(true);
    store.close();
  });

  it("validates limits and node types at the persisted-data boundary", () => {
    const store = new SqliteGraphSnapshotStore({ dbPath: fixture(), maxNodeLimit: 10 });
    expect(() => store.getSnapshot({ maxNodes: 11 })).toThrow(/maxNodes/);
    expect(() => store.getSnapshot({ nodeTypes: ["OTHER" as never] })).toThrow(/nodeTypes/);
    store.close();
    expect(() => store.getSnapshot()).toThrow(/closed/);
  });
});
