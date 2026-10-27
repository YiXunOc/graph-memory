import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { Context, Service } from "@deepseek-ai/cordis";

interface LoadedClient {
  id: string;
  factory: (require: (id: string) => unknown) => {
    inject: string[];
    apply(ctx: any): Promise<() => Promise<void>>;
  };
}

describe("DSH Pro client bundle", () => {
  it("reads its mounted Remote namespace from a Cordis-scoped sidebar action", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    const plugin = loaded!.factory((id) => {
      if (id === "react") return { createElement: (...args: unknown[]) => args, Fragment: "fragment" };
      throw new Error(`unexpected client external ${id}`);
    });
    const root = new Context();
    let namespace: { dispose(): Promise<void> } | undefined;
    class Remote extends Service {
      constructor() { super(root, "remote"); }
      async $mount() {
        namespace = root.plugin({ apply: (ctx: Context) => {
          new class extends Service {
            constructor() { super(ctx, "remote.graphMemoryPro"); }
            async snapshot() { return { ok: true, value: { nodes: [] } }; }
            async activity(sessionId: string) { return { ok: true, value: [{ sessionId }] }; }
            async usage(sessionId: string) { return { ok: true, value: [{ sessionId }] }; }
          }();
        } });
        await namespace;
        return async () => { await namespace?.dispose(); };
      }
    }
    new Remote();
    const entries: any[] = [];
    class Slots extends Service {
      constructor() { super(root, "slots"); }
      inject(_name: string, register: () => unknown) { register(); return () => { entries.length = 0; }; }
      register(options: unknown, component: unknown) { const entry = { options, component }; entries.push(entry); return () => {}; }
    }
    new Slots();
    try {
      const fiber = root.plugin(plugin);
      await fiber;
      expect(entries.map(entry => entry.options.name)).toEqual(["sidebar.footer.action", "conversation.session.header.utilities"]);
      const global = entries[0].options.inject();
      expect(global.loadActivity).toBeUndefined();
      expect(global.loadUsage).toBeUndefined();
      const scoped = entries[1].options.inject("session-a");
      await expect(scoped.loadActivity()).resolves.toEqual([{ sessionId: "dsh:session-a" }]);
      await expect(scoped.loadUsage()).resolves.toEqual([{ sessionId: "dsh:session-a" }]);
      await fiber.dispose();
      expect(entries).toHaveLength(0);
      expect(root.get("remote.graphMemoryPro")).toBeUndefined();
    } finally {
      await root.fiber.dispose();
    }
  });
  it("withdraws the Remote if sidebar registration fails", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    const plugin = loaded!.factory(() => ({}));
    const root = new Context();
    const disposeRemote = vi.fn(async () => {});
    class Remote extends Service {
      constructor() { super(root, "remote"); }
      async $mount() {
        root.provide("remote.graphMemoryPro", { snapshot: async () => ({ ok: true, value: {} }) });
        return disposeRemote;
      }
    }
    new Remote();
    class Slots extends Service {
      constructor() { super(root, "slots"); }
      inject() { throw new Error("slot failed"); }
    }
    new Slots();
    try {
      await expect(root.plugin(plugin)).rejects.toThrow("slot failed");
      expect(disposeRemote).toHaveBeenCalledOnce();
    } finally {
      await root.fiber.dispose();
    }
  });
  it("mounts strict Remote descriptors and registers the sidebar entry", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    expect(loaded?.id).toBe("graph-memory-pro-dsh");

    const react = {
      Fragment: "fragment",
      createElement: (...args: unknown[]) => ({ args }),
      useState: (initial: unknown) => [initial, () => {}],
      useCallback: (callback: unknown) => callback,
      useEffect: () => {},
    };
    const plugin = loaded!.factory((id) => {
      if (id === "react") return react;
      throw new Error(`unexpected client external ${id}`);
    });
    const mounted: any[] = [];
    const registered: any[] = [];
    const disposeRemote = vi.fn(async () => {});
    const disposeSlots: Array<() => void> = [];
    const ctx = {
      inject: (_services: string[], apply: (scope: any) => () => void) => {
        const dispose = apply(ctx);
        return Object.assign(Promise.resolve(), { dispose: async () => { dispose(); } });
      },
      remote: {
        $mount: async (contribution: any) => {
          for (const descriptor of contribution.descriptors) {
            for (const codec of [descriptor.result, ...descriptor.parameters.map((parameter: any) => parameter.codec)]) {
              expect(codec.create, `${descriptor.id} strict codec factory`).toBeTypeOf("function");
              expect(codec.create().parse).toBeTypeOf("function");
            }
          }
          mounted.push(contribution);
          return disposeRemote;
        },
      },
      slots: {
        inject: (name: string, setup: () => unknown) => {
          expect(["sidebar.footer.action", "conversation.session.header.utilities"]).toContain(name);
          setup();
          const dispose = vi.fn();
          disposeSlots.push(dispose);
          return dispose;
        },
        register: (options: unknown, component: unknown) => {
          registered.push({ options, component });
          return () => {};
        },
      },
    };

    const dispose = await plugin.apply(ctx);
    expect(plugin.inject).toEqual(["slots", "remote"]);
    expect(mounted[0].descriptors.map((descriptor: any) => descriptor.method)).toEqual(["snapshot", "detail", "overview", "turns", "relations", "activity", "usage"]);
    const snapshotCodec = mounted[0].descriptors[0].result.create();
    expect(snapshotCodec.parse({
      generatedAt: 1,
      nodes: [{
        id: "turn:memory", type: "TURN", name: "摘要", description: "摘要", status: "active",
        validatedCount: 1, sourceSessionCount: 0, communityId: null, pagerank: 0, createdAt: 1, updatedAt: 1,
      }, { id: "term:port", type: "TERM", name: "端口", description: "导航词", status: "active",
        validatedCount: 1, sourceSessionCount: 0, communityId: null, pagerank: 0, createdAt: 1, updatedAt: 1 }],
      edges: [{ id: "navigation:edge", fromId: "term:port", toId: "term:value", type: "NAVIGATES", instruction: "配置为", createdAt: 1 }],
      totals: { nodes: 2, edges: 1 }, truncated: { nodes: false, edges: false },
    }).nodes[0].type).toBe("TURN");
    const activityCodec = mounted[0].descriptors.find((descriptor: any) => descriptor.method === "activity").result.create();
    const validActivity = { id: "a", sessionId: "s", kind: "archive", status: "completed", message: "已归档", createdAt: 1 };
    expect(activityCodec.parse([validActivity])).toHaveLength(1);
    expect(() => activityCodec.parse([{ ...validActivity, kind: "unknown" }])).toThrow();
    expect(() => activityCodec.parse([{ ...validActivity, createdAt: "yesterday" }])).toThrow(/createdAt/);
    expect(() => activityCodec.parse([{ ...validActivity, details: { count: {} } }])).toThrow(/details/);
    const codec = (method: string) => mounted[0].descriptors.find((descriptor: any) => descriptor.method === method).result.create();
    const overview = { turnMemories: 1, navigationTerms: 2, navigationTriples: 3, navigationCommunities: 4, legacyNodes: 5, legacyEdges: 6, extraction: { pending: 0, succeeded: 1, quarantined: 0 }, turnVectors: 7 };
    expect(codec("overview").parse(overview).turnMemories).toBe(1);
    expect(() => codec("overview").parse({ ...overview, extraction: { pending: "one", succeeded: 1, quarantined: 0 } })).toThrow(/pending/);
    const turn = { id: "turn:a", summary: "done", outcome: "ok", createdAt: 1, updatedAt: 2, sourceAvailable: true, tripleCount: 1 };
    expect(codec("turns").parse([turn])).toHaveLength(1);
    expect(() => codec("turns").parse([{ ...turn, sourceAvailable: "yes" }])).toThrow(/sourceAvailable/);
    const relation = { id: "r", memoryId: "turn:a", subject: "a", predicate: "uses", object: "b", summary: "a uses b", outcome: "ok", createdAt: 1 };
    expect(codec("relations").parse([relation])[0].memoryId).toBe("turn:a");
    expect(() => codec("relations").parse([{ ...relation, memoryId: 42 }])).toThrow(/memoryId/);
    const usageRow = { id: "u", sessionId: "dsh:s", turnIndex: 1, requestKind: "main-agent", provider: "p", model: "m", uncachedInputTokens: 10, outputTokens: 2, totalTokens: 12, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, usageComplete: true, createdAt: 1 };
    expect(codec("usage").parse([usageRow])[0].cacheReadTokens).toBeNull();
    expect(() => codec("usage").parse([{ ...usageRow, cacheReadTokens: "0" }])).toThrow(/cacheReadTokens/);
    expect(() => mounted[0].descriptors.find((descriptor: any) => descriptor.method === "activity").parameters[0].codec.create().parse("")).toThrow(/sessionId/);
    expect(() => codec("relations").parse([{ ...relation, object: 10 }])).toThrow(/object/);
    expect(() => mounted[0].descriptors.find((descriptor: any) => descriptor.method === "turns").parameters[1].codec.create().parse(0)).toThrow(/limit/);
    expect(() => mounted[0].descriptors[0].parameters[0].codec.create().parse({ maxNodes: 1001 }))
      .toThrow(/maxNodes/);
    expect(registered.map(entry => (entry.options as any).name)).toEqual(["sidebar.footer.action", "conversation.session.header.utilities"]);
    expect((registered[0].options as any).inject().loadActivity).toBeUndefined();
    await dispose();
    expect(disposeSlots).toHaveLength(2);
    expect(disposeSlots.every(fn => vi.mocked(fn).mock.calls.length === 1)).toBe(true);
    expect(disposeRemote).toHaveBeenCalledOnce();
  });
  it("checks every Remote failure before exposing data to the panel", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    const plugin = loaded!.factory(() => ({}));
    let props: any;
    const error = { ok: false, error: { message: "remote unavailable" } };
    const ctx: any = {
      remote: { $mount: async () => async () => {}, graphMemoryPro: Object.fromEntries(["snapshot", "detail", "overview", "turns", "relations", "activity", "usage"].map(method => [method, async () => error])) },
      inject: (_names: unknown, apply: (scope: any) => unknown) => { apply(ctx); return Object.assign(Promise.resolve(), { dispose: async () => {} }); },
      slots: { inject: (_name: string, register: () => unknown) => register(), register: (options: any) => { props = options.inject("session"); } },
    };
    await plugin.apply(ctx);
    for (const [method, args] of [["loadDetail", ["turn:a"]], ["loadOverview", []], ["loadTurns", [""]], ["loadRelations", [""]], ["loadActivity", []], ["loadUsage", []]] as const) {
      await expect(props[method](...args)).rejects.toThrow("remote unavailable");
    }
  });
  it("renders overview by default and opens a turn source without requesting a snapshot", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    const state: unknown[] = [];
    let cursor = 0;
    const effects: Array<() => void> = [];
    const react = {
      Fragment: "fragment",
      createElement: (type: any, props: any, ...children: unknown[]): any => type === "fragment"
        ? { type, props, children }
        : typeof type === "function" ? type(props) : { type, props: props ?? {}, children },
      useState: (initial: unknown) => {
        const index = cursor++;
        if (index >= state.length) state[index] = initial;
        return [state[index], (value: unknown) => { state[index] = value; }];
      },
      useEffect: (callback: () => void) => { effects.push(callback); },
    };
    const plugin = loaded!.factory((id) => id === "react" ? react : {});
    let component: any;
    let inject: any;
    const overview = { turnMemories: 1, navigationTerms: 2, navigationTriples: 3, navigationCommunities: 0, legacyNodes: 0, legacyEdges: 0, extraction: { pending: 0, succeeded: 0, quarantined: 0 }, turnVectors: 1 };
    const detail = { id: "turn:a", type: "TURN", name: "answer", description: "answer", status: "active", validatedCount: 0, sourceSessionCount: 1, communityId: null, pagerank: 0, createdAt: 1, updatedAt: 1, content: "Q: why? A: because", contentTruncated: false };
    const remote = { snapshot: vi.fn(), detail: vi.fn(async () => ({ ok: true, value: detail })), overview: vi.fn(async () => ({ ok: true, value: overview })), turns: vi.fn(async () => ({ ok: true, value: [{ id: "turn:a", summary: "answer", outcome: "ok", tripleCount: 1, sourceAvailable: true }] })), relations: vi.fn(async () => ({ ok: true, value: [{ id: "r", memoryId: "turn:a", subject: "a", predicate: "uses", object: "b", summary: "answer", outcome: "completed", createdAt: 1 }] })), activity: vi.fn(async () => ({ ok: true, value: [] })), usage: vi.fn(async () => ({ ok: true, value: [] })) };
    const ctx: any = {
      remote: { $mount: async () => async () => {}, graphMemoryPro: remote },
      inject: (_services: unknown, callback: (ctx: any) => unknown) => { callback(ctx); return Object.assign(Promise.resolve(), { dispose: async () => {} }); },
      slots: { inject: (_name: string, callback: () => unknown) => callback(), register: (options: any, entry: any) => { inject = options.inject("session"); component = entry; } },
    };
    await plugin.apply(ctx);
    const render = () => { cursor = 0; effects.length = 0; return component({ wide: true, ...inject }); };
    const nodes = (tree: any): any[] => tree && typeof tree === "object" ? [tree, ...(tree.children ?? []).flatMap(nodes)] : [];
    let tree = render();
    nodes(tree).find(node => node.props?.["aria-label"] === "打开 Graph Memory Pro")!.props.onClick();
    tree = render();
    for (const effect of effects.splice(0)) effect();
    await new Promise(resolve => setTimeout(resolve, 0));
    tree = render();
    expect(remote.snapshot).not.toHaveBeenCalled();
    expect(remote.activity).toHaveBeenCalledWith("dsh:session", 30);
    expect(remote.usage).toHaveBeenCalledWith("dsh:session", 30);
    expect(nodes(tree).some(node => node.type === "strong" && node.children.includes(1))).toBe(true);
    nodes(tree).find(node => node.type === "button" && node.children.includes("轮次记忆"))!.props.onClick();
    tree = render();
    for (const effect of effects.splice(0)) effect();
    await new Promise(resolve => setTimeout(resolve, 0));
    tree = render();
    expect(nodes(tree).some(node => node.type === "h3" && node.children.includes("answer"))).toBe(true);
    nodes(tree).find(node => node.type === "button" && node.children.includes("查看来源问答"))!.props.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    tree = render();
    expect(remote.detail).toHaveBeenCalledWith("turn:a");
    expect(nodes(tree).some(node => node.type === "pre" && node.children.includes(detail.content))).toBe(true);
    nodes(tree).find(node => node.type === "button" && node.children.includes("SPO 关系"))!.props.onClick();
    tree = render();
    for (const effect of effects.splice(0)) effect();
    await new Promise(resolve => setTimeout(resolve, 0));
    tree = render();
    expect(nodes(tree).some(node => node.type === "strong" && node.children.includes("a → uses → b"))).toBe(true);
    const before = remote.detail.mock.calls.length;
    nodes(tree).find(node => node.type === "article")!.children.find((node: any) => node.type === "button" && node.children.includes("查看来源问答"))!.props.onClick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(remote.detail.mock.calls.length).toBe(before + 1);
    expect(remote.detail).toHaveBeenLastCalledWith("turn:a");
  });
  it("does not render legacy snapshot cards or request unfiltered activity", () => {
    const source = readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8");
    expect(source).not.toContain("loadSnapshot(nextQuery)");
    expect(source).toContain("loadActivity()");
    expect(source).toContain("graphMemoryPro.activity(`dsh:${sessionId}`");
    expect(source).not.toContain("导航快照");
    expect(source).toContain("查看来源问答");
    expect(source).toContain("本会话活动");
  });
});
