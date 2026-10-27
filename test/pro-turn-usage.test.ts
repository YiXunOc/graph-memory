import { expect, it } from "vitest";
import { projectMainTurnUsage } from "../pro/turn-usage.ts";

it("accepts one complete DSH turn and preserves absent cache buckets", () => {
  const events = [
    { type: "turn/start", data: { turn: 1 }, seq: 1 },
    { type: "step/start", data: { turn: 1, step: 1 }, seq: 2 },
    { type: "assistant/message", data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 }, message: { source: { provider: "p", model: "m" } } }, seq: 3 },
    { type: "step/end", data: { turn: 1, step: 1 }, seq: 4 },
    { type: "turn/end", data: { turn: 1 }, seq: 5 },
  ];
  expect(projectMainTurnUsage(events as any, "dsh:s")).toMatchObject({
    id: "dsh:s:5", turnIndex: 1, uncachedInputTokens: 10, cacheReadTokens: null,
    cacheWriteTokens: null, usageComplete: true, provider: "p", model: "m",
  });
  expect(projectMainTurnUsage(events.slice(1) as any, "dsh:s")).toBeNull();
});

it("fails closed on retry attempts or incomplete usage", () => {
  const events = [
    { type: "turn/start", data: { turn: 1 }, seq: 1 },
    { type: "step/start", data: { turn: 1, step: 1 }, seq: 2 },
    { type: "llm/retry", data: { turn: 1, step: 1 }, seq: 3 },
    { type: "assistant/message", data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 1 }, message: { source: { provider: "p", model: "m" } } }, seq: 4 },
    { type: "step/end", data: { turn: 1, step: 1 }, seq: 5 },
    { type: "turn/end", data: { turn: 1 }, seq: 6 },
  ];
  expect(projectMainTurnUsage(events as any, "dsh:s")).toBeNull();
  expect(projectMainTurnUsage(events.filter(event => event.type !== "llm/retry") as any, "dsh:s")).toBeNull();
});

it("counts a completed failed attempt and a retry exactly once", () => {
  const usage = (inputTokens: number, cacheReadTokens: number) => ({
    inputTokens, outputTokens: 2, totalTokens: inputTokens + cacheReadTokens + 2, cacheReadTokens,
  });
  const events = [
    { type: "turn/start", data: { turn: 1 }, seq: 1 },
    { type: "step/start", data: { turn: 1, step: 1 }, seq: 2 },
    { type: "assistant/attempt", data: { turn: 1, step: 1, stream: [{ type: "chunk", chunk: { type: "usage", usage: usage(10, 3) } }] }, seq: 3 },
    { type: "llm/retry", data: { turn: 1, step: 1 }, seq: 4 },
    { type: "llm/retry-started", data: { turn: 1, step: 1 }, seq: 5 },
    { type: "assistant/message", data: { turn: 1, step: 1, usage: usage(5, 2), message: { source: { provider: "p", model: "m" } } }, seq: 6 },
    { type: "step/end", data: { turn: 1, step: 1 }, seq: 7 },
    { type: "turn/end", data: { turn: 1 }, seq: 8 },
  ];
  expect(projectMainTurnUsage(events as any, "dsh:s")).toMatchObject({
    id: "dsh:s:8", uncachedInputTokens: 15, outputTokens: 4, cacheReadTokens: 5, totalTokens: 24,
  });
});