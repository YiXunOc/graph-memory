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
          }();
        } });
        await namespace;
        return async () => { await namespace?.dispose(); };
      }
    }
    new Remote();
    let entry: any;
    class Slots extends Service {
      constructor() { super(root, "slots"); }
      inject(_name: string, register: () => unknown) { register(); return () => { entry = undefined; }; }
      register(options: unknown, component: unknown) { entry = { options, component }; return () => {}; }
    }
    new Slots();
    try {
      const fiber = root.plugin(plugin);
      await fiber;
      expect(entry.options.id).toBe("graph-memory-pro");
      await expect(entry.options.inject().loadSnapshot("")).resolves.toEqual({ nodes: [] });
      await fiber.dispose();
      expect(entry).toBeUndefined();
      expect(root.get("remote.graphMemoryPro")).toBeUndefined();
    } finally {
      await root.fiber.dispose();
    }
  });
  it("withdraws the Remote if sidebar registration fails", async () => {
    let loaded: LoadedClient | undefined;
    runInNewContext(readFileSync(new URL("../dsh-pro/client.js", import.meta.url), "utf8"), {
      window: { __ModuleLoader__: { load: (entry: LoadedClient) => { loaded = entry; } } },
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
    const disposeSlot = vi.fn();
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
          expect(name).toBe("sidebar.footer.action");
          setup();
          return disposeSlot;
        },
        register: (options: unknown, component: unknown) => {
          registered.push({ options, component });
          return () => {};
        },
      },
    };

    const dispose = await plugin.apply(ctx);
    expect(plugin.inject).toEqual(["slots", "remote"]);
    expect(mounted[0].descriptors.map((descriptor: any) => descriptor.method)).toEqual(["snapshot", "detail"]);
    expect(() => mounted[0].descriptors[0].parameters[0].codec.create().parse({ maxNodes: 1001 }))
      .toThrow(/maxNodes/);
    expect(registered[0].options).toMatchObject({
      name: "sidebar.footer.action",
      id: "graph-memory-pro",
    });
    await dispose();
    expect(disposeSlot).toHaveBeenCalledOnce();
    expect(disposeRemote).toHaveBeenCalledOnce();
  });
});
