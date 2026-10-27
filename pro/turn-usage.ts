import type { GraphMemoryUsageRow } from "./types.ts";

type Event = { type?: string; seq?: number; data?: any };
type Sample = { input: number; output: number; total: number; read: number | null; write: number | null; reasoning: number | null; provider: string | null; model: string | null };
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function streamUsage(stream: unknown): unknown {
  if (!Array.isArray(stream)) return undefined;
  for (let i = stream.length - 1; i >= 0; i -= 1) {
    if (stream[i]?.type === "chunk" && stream[i]?.chunk?.type === "usage") return stream[i].chunk.usage;
  }
  return undefined;
}

function sample(usage: any, source?: any): Sample | null {
  if (!count(usage?.inputTokens) || !count(usage?.outputTokens)) return null;
  for (const key of ["cacheReadTokens", "cacheWriteTokens", "reasoningTokens"]) {
    if (usage[key] !== undefined && !count(usage[key])) return null;
  }
  const read = usage.cacheReadTokens ?? null;
  const write = usage.cacheWriteTokens ?? null;
  const reasoning = usage.reasoningTokens ?? null;
  const knownPrompt = usage.inputTokens + (read ?? 0) + (write ?? 0);
  if (!Number.isSafeInteger(knownPrompt) || (reasoning !== null && reasoning > usage.outputTokens)) return null;
  const total = usage.totalTokens ?? (read !== null && write !== null ? knownPrompt + usage.outputTokens : undefined);
  if (!count(total) || total < knownPrompt + usage.outputTokens) return null;
  if (read !== null && write !== null && total !== knownPrompt + usage.outputTokens) return null;
  return { input: usage.inputTokens, output: usage.outputTokens, total, read, write, reasoning,
    provider: typeof source?.provider === "string" && source.provider ? source.provider : null,
    model: typeof source?.model === "string" && source.model ? source.model : null };
}

/** Fold only completed durable attempts; missing lifecycle or usage fails closed. */
export function projectMainTurnUsage(events: Event[], sessionId: string): Omit<GraphMemoryUsageRow, "createdAt"> | null {
  if (!sessionId || events.length < 4 || events[0]?.type !== "turn/start" || events.at(-1)?.type !== "turn/end") return null;
  const turn = events[0].data?.turn;
  const end = events.at(-1)!;
  if (!Number.isInteger(turn) || turn < 1 || end.data?.turn !== turn || !Number.isInteger(end.seq)) return null;
  const attempts: Sample[] = [];
  let step: number | null = null;
  let state: "idle" | "open" | "finishClosed" | "settledMessage" | "settledRetry" = "idle";
  let pending: unknown;
  for (const event of events.slice(1, -1)) {
    const data = event.data;
    switch (event.type) {
      case "step/start":
        if (state !== "idle" || data?.turn !== turn || !Number.isInteger(data?.step)) return null;
        step = data.step; state = "open"; pending = undefined; break;
      case "assistant/attempt": {
        if (state !== "open" || data?.turn !== turn || data?.step !== step) return null;
        pending = streamUsage(data.stream) ?? pending;
        const billed = sample(pending);
        if (!billed) return null;
        attempts.push(billed); state = "finishClosed"; pending = undefined; break;
      }
      case "assistant/message": {
        if (state !== "open" || data?.turn !== turn || data?.step !== step) return null;
        const billed = sample(data.usage ?? streamUsage(data.stream) ?? pending, data.message?.source);
        if (!billed) return null;
        attempts.push(billed); state = "settledMessage"; pending = undefined; break;
      }
      case "llm/retry": {
        if (state === "idle" || data?.turn !== turn || data?.step !== step || state === "settledMessage") return null;
        if (state === "open") {
          const billed = sample(pending);
          if (!billed) return null;
          attempts.push(billed);
        }
        state = "settledRetry"; pending = undefined; break;
      }
      case "llm/retry-started":
        if (state !== "settledRetry" || data?.turn !== turn || data?.step !== step) return null;
        state = "open"; pending = undefined; break;
      case "step/end":
        if (state === "idle" || data?.turn !== turn || data?.step !== step) return null;
        if (state === "open") {
          const billed = sample(pending);
          if (!billed) return null;
          attempts.push(billed);
        }
        state = "idle"; step = null; pending = undefined; break;
      default: break;
    }
  }
  if (state !== "idle" || !attempts.length) return null;
  const sum = (key: "input" | "output" | "total") => attempts.reduce((n, a) => n + a[key], 0);
  const optional = (key: "read" | "write" | "reasoning") => attempts.every(a => a[key] !== null)
    ? attempts.reduce((n, a) => n + (a[key] ?? 0), 0) : null;
  const uncachedInputTokens = sum("input");
  const outputTokens = sum("output");
  const totalTokens = sum("total");
  const cacheReadTokens = optional("read");
  const cacheWriteTokens = optional("write");
  const reasoningTokens = optional("reasoning");
  if (![uncachedInputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens]
    .every(value => value === null || count(value))) return null;
  const routes = new Set(attempts.map(a => a.provider && a.model ? `${a.provider}\0${a.model}` : ""));
  return { id: `${sessionId}:${end.seq}`, sessionId, turnIndex: turn, requestKind: "main-agent",
    provider: routes.size === 1 && !routes.has("") ? attempts[0].provider : null,
    model: routes.size === 1 && !routes.has("") ? attempts[0].model : null,
    uncachedInputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens,
    reasoningTokens, usageComplete: true };
}
