window.__ModuleLoader__.load({
  id: "graph-memory-pro-dsh",
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");

    function invalid(subject) {
      throw new TypeError(`graph-memory-pro: invalid ${subject}`);
    }

    function plain(value, subject) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(subject);
      return value;
    }

    function exact(value, keys, subject) {
      const record = plain(value, subject);
      for (const key of Object.keys(record)) if (!keys.includes(key)) invalid(`${subject}.${key}`);
      return record;
    }

    function string(value, subject) {
      if (typeof value !== "string") invalid(subject);
      return value;
    }

    function finite(value, subject) {
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(subject);
      return value;
    }

    function boolean(value, subject) {
      if (typeof value !== "boolean") invalid(subject);
      return value;
    }

    function nodeType(value, subject) {
      const type = string(value, subject);
      if (!["TASK", "SKILL", "EVENT", "TURN", "TERM"].includes(type)) invalid(subject);
      return type;
    }

    const requestSchema = {
      parse(value) {
        const source = exact(value, ["query", "nodeTypes", "maxNodes"], "snapshot request");
        const result = {};
        if (source.query !== undefined) result.query = string(source.query, "snapshot request.query");
        if (source.nodeTypes !== undefined) {
          if (!Array.isArray(source.nodeTypes)) invalid("snapshot request.nodeTypes");
          result.nodeTypes = source.nodeTypes.map((value, index) => nodeType(value, `snapshot request.nodeTypes[${index}]`));
        }
        if (source.maxNodes !== undefined) {
          const maxNodes = finite(source.maxNodes, "snapshot request.maxNodes");
          if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1000) invalid("snapshot request.maxNodes");
          result.maxNodes = maxNodes;
        }
        return result;
      },
    };

    function parseNode(value, subject, extraKeys = []) {
      const node = exact(value, [
        "id", "type", "name", "description", "status", "validatedCount",
        "sourceSessionCount", "communityId", "pagerank", "createdAt", "updatedAt",
        ...extraKeys,
      ], subject);
      const status = string(node.status, `${subject}.status`);
      if (status !== "active" && status !== "deprecated") invalid(`${subject}.status`);
      return {
        id: string(node.id, `${subject}.id`),
        type: nodeType(node.type, `${subject}.type`),
        name: string(node.name, `${subject}.name`),
        description: string(node.description, `${subject}.description`),
        status,
        validatedCount: finite(node.validatedCount, `${subject}.validatedCount`),
        sourceSessionCount: finite(node.sourceSessionCount, `${subject}.sourceSessionCount`),
        communityId: node.communityId === null ? null : string(node.communityId, `${subject}.communityId`),
        pagerank: finite(node.pagerank, `${subject}.pagerank`),
        createdAt: finite(node.createdAt, `${subject}.createdAt`),
        updatedAt: finite(node.updatedAt, `${subject}.updatedAt`),
      };
    }

    function parseEdge(value, subject) {
      const edge = exact(value, ["id", "fromId", "toId", "type", "instruction", "condition", "createdAt"], subject);
      const type = string(edge.type, `${subject}.type`);
      if (!["RELATES", "SUPERSEDES", "USED_SKILL", "SOLVED_BY", "REQUIRES", "PATCHES", "CONFLICTS_WITH", "NAVIGATES"].includes(type)) invalid(`${subject}.type`);
      const parsed = {
        id: string(edge.id, `${subject}.id`),
        fromId: string(edge.fromId, `${subject}.fromId`),
        toId: string(edge.toId, `${subject}.toId`),
        type,
        instruction: string(edge.instruction, `${subject}.instruction`),
        createdAt: finite(edge.createdAt, `${subject}.createdAt`),
      };
      if (edge.condition !== undefined) parsed.condition = string(edge.condition, `${subject}.condition`);
      return parsed;
    }

    const snapshotSchema = {
      parse(value) {
        const snapshot = exact(value, ["generatedAt", "nodes", "edges", "totals", "truncated"], "snapshot result");
        if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) invalid("snapshot result collections");
        const totals = exact(snapshot.totals, ["nodes", "edges"], "snapshot result.totals");
        const truncated = exact(snapshot.truncated, ["nodes", "edges"], "snapshot result.truncated");
        return {
          generatedAt: finite(snapshot.generatedAt, "snapshot result.generatedAt"),
          nodes: snapshot.nodes.map((node, index) => parseNode(node, `snapshot result.nodes[${index}]`)),
          edges: snapshot.edges.map((edge, index) => parseEdge(edge, `snapshot result.edges[${index}]`)),
          totals: {
            nodes: finite(totals.nodes, "snapshot result.totals.nodes"),
            edges: finite(totals.edges, "snapshot result.totals.edges"),
          },
          truncated: {
            nodes: boolean(truncated.nodes, "snapshot result.truncated.nodes"),
            edges: boolean(truncated.edges, "snapshot result.truncated.edges"),
          },
        };
      },
    };

    const detailRequestSchema = { parse: (value) => string(value, "node id") };
    const detailSchema = {
      parse(value) {
        if (value === null) return null;
        const detail = exact(value, [
          "id", "type", "name", "description", "status", "validatedCount",
          "sourceSessionCount", "communityId", "pagerank", "createdAt", "updatedAt",
          "content", "contentTruncated",
        ], "node detail");
        return {
          ...parseNode(detail, "node detail", ["content", "contentTruncated"]),
          content: string(detail.content, "node detail.content"),
          contentTruncated: boolean(detail.contentTruncated, "node detail.contentTruncated"),
        };
      },
    };

    function positiveLimit(value, subject) {
      if (value === undefined) return undefined;
      const limit = finite(value, subject);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) invalid(subject);
      return limit;
    }

    const activitySchema = {
      parse(value) {
        if (!Array.isArray(value)) invalid("activity result");
        return value.map((item, index) => {
          const subject = `activity[${index}]`;
          const row = exact(item, ["id", "sessionId", "turnIndex", "kind", "status", "message", "details", "createdAt"], subject);
          if (!["archive", "projection", "recall", "extraction", "embedding"].includes(row.kind)) invalid(`${subject}.kind`);
          if (!["started", "completed", "failed"].includes(row.status)) invalid(`${subject}.status`);
          const result = { id: string(row.id, `${subject}.id`), sessionId: string(row.sessionId, `${subject}.sessionId`), kind: row.kind, status: row.status, message: string(row.message, `${subject}.message`), createdAt: finite(row.createdAt, `${subject}.createdAt`) };
          if (row.turnIndex !== undefined) result.turnIndex = finite(row.turnIndex, `${subject}.turnIndex`);
          if (row.details !== undefined) {
            const details = plain(row.details, `${subject}.details`);
            for (const [key, entry] of Object.entries(details)) {
              if (typeof entry !== "string" && typeof entry !== "boolean" && !(typeof entry === "number" && Number.isFinite(entry))) invalid(`${subject}.details.${key}`);
            }
            result.details = details;
          }
          return result;
        });
      },
    };

    const overviewSchema = {
      parse(value) {
        const row = exact(value, ["turnMemories", "navigationTerms", "navigationTriples", "navigationCommunities", "legacyNodes", "legacyEdges", "extraction", "turnVectors"], "overview");
        const extraction = exact(row.extraction, ["pending", "succeeded", "quarantined"], "overview.extraction");
        return {
          turnMemories: finite(row.turnMemories, "overview.turnMemories"), navigationTerms: finite(row.navigationTerms, "overview.navigationTerms"),
          navigationTriples: finite(row.navigationTriples, "overview.navigationTriples"), navigationCommunities: finite(row.navigationCommunities, "overview.navigationCommunities"),
          legacyNodes: finite(row.legacyNodes, "overview.legacyNodes"), legacyEdges: finite(row.legacyEdges, "overview.legacyEdges"),
          extraction: { pending: finite(extraction.pending, "overview.extraction.pending"), succeeded: finite(extraction.succeeded, "overview.extraction.succeeded"), quarantined: finite(extraction.quarantined, "overview.extraction.quarantined") },
          turnVectors: finite(row.turnVectors, "overview.turnVectors"),
        };
      },
    };

    const turnSchema = { parse(value) {
      if (!Array.isArray(value)) invalid("turn result");
      return value.map((item, index) => {
        const subject = `turn[${index}]`;
        const row = exact(item, ["id", "summary", "outcome", "createdAt", "updatedAt", "sourceAvailable", "tripleCount"], subject);
        return { id: string(row.id, `${subject}.id`), summary: string(row.summary, `${subject}.summary`), outcome: string(row.outcome, `${subject}.outcome`), createdAt: finite(row.createdAt, `${subject}.createdAt`), updatedAt: finite(row.updatedAt, `${subject}.updatedAt`), sourceAvailable: boolean(row.sourceAvailable, `${subject}.sourceAvailable`), tripleCount: finite(row.tripleCount, `${subject}.tripleCount`) };
      });
    } };
    const relationSchema = { parse(value) {
      if (!Array.isArray(value)) invalid("relation result");
      return value.map((item, index) => {
        const subject = `relation[${index}]`;
        const row = exact(item, ["id", "memoryId", "subject", "predicate", "object", "summary", "outcome", "createdAt"], subject);
        return { id: string(row.id, `${subject}.id`), memoryId: string(row.memoryId, `${subject}.memoryId`), subject: string(row.subject, `${subject}.subject`), predicate: string(row.predicate, `${subject}.predicate`), object: string(row.object, `${subject}.object`), summary: string(row.summary, `${subject}.summary`), outcome: string(row.outcome, `${subject}.outcome`), createdAt: finite(row.createdAt, `${subject}.createdAt`) };
      });
    } };

    const usageSchema = { parse(value) {
      if (!Array.isArray(value)) invalid("usage result");
      return value.map((item, index) => {
        const subject = `usage[${index}]`;
        const row = exact(item, ["id", "sessionId", "turnIndex", "requestKind", "provider", "model", "uncachedInputTokens", "outputTokens", "totalTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "usageComplete", "createdAt"], subject);
        if (!["main-agent", "graph-extraction", "embedding"].includes(row.requestKind)) invalid(`${subject}.requestKind`);
        const optionalNumber = (key) => row[key] === null ? null : finite(row[key], `${subject}.${key}`);
        return {
          id: string(row.id, `${subject}.id`), sessionId: string(row.sessionId, `${subject}.sessionId`),
          turnIndex: finite(row.turnIndex, `${subject}.turnIndex`), requestKind: row.requestKind,
          provider: row.provider === null ? null : string(row.provider, `${subject}.provider`),
          model: row.model === null ? null : string(row.model, `${subject}.model`),
          uncachedInputTokens: optionalNumber("uncachedInputTokens"), outputTokens: optionalNumber("outputTokens"),
          totalTokens: optionalNumber("totalTokens"), cacheReadTokens: optionalNumber("cacheReadTokens"),
          cacheWriteTokens: optionalNumber("cacheWriteTokens"), reasoningTokens: optionalNumber("reasoningTokens"),
          usageComplete: boolean(row.usageComplete, `${subject}.usageComplete`), createdAt: finite(row.createdAt, `${subject}.createdAt`),
        };
      });
    } };

    const strict = (typeSymbol, schema) => ({ mode: "strict", typeSymbol, create: () => schema });
    const remoteContribution = {
      package: "graph-memory-pro-dsh",
      descriptors: [
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/snapshot",
          service: "graphMemoryPro",
          namespace: "graphMemoryPro",
          method: "snapshot",
          invocation: { kind: "direct" },
          parameters: [{
            name: "request",
            wire: "request",
            source: "json",
            codec: strict("graph-memory/pro#GraphSnapshotRequest", requestSchema),
          }],
          result: strict("graph-memory/pro#GraphSnapshot", snapshotSchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/detail",
          service: "graphMemoryPro",
          namespace: "graphMemoryPro",
          method: "detail",
          invocation: { kind: "direct" },
          parameters: [{
            name: "id",
            wire: "id",
            source: "json",
            codec: strict("graph-memory/pro#GraphNodeId", detailRequestSchema),
          }],
          result: strict("graph-memory/pro#GraphNodeDetail|null", detailSchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/overview",
          service: "graphMemoryPro", namespace: "graphMemoryPro", method: "overview", invocation: { kind: "direct" }, parameters: [], result: strict("graph-memory/pro#GraphMemoryOverview", overviewSchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/turns",
          service: "graphMemoryPro", namespace: "graphMemoryPro", method: "turns", invocation: { kind: "direct" }, parameters: [{ name: "query", wire: "query", source: "json", codec: strict("graph-memory/pro#Query?", { parse: (value) => value === undefined ? undefined : string(value, "query") }) }, { name: "limit", wire: "limit", source: "json", codec: strict("graph-memory/pro#Limit?", { parse: (value) => value === undefined ? undefined : positiveLimit(value, "limit") }) }], result: strict("graph-memory/pro#GraphMemoryTurnRow[]", turnSchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/relations",
          service: "graphMemoryPro", namespace: "graphMemoryPro", method: "relations", invocation: { kind: "direct" }, parameters: [{ name: "query", wire: "query", source: "json", codec: strict("graph-memory/pro#Query?", { parse: (value) => value === undefined ? undefined : string(value, "query") }) }, { name: "limit", wire: "limit", source: "json", codec: strict("graph-memory/pro#Limit?", { parse: (value) => value === undefined ? undefined : positiveLimit(value, "limit") }) }], result: strict("graph-memory/pro#GraphMemoryRelationRow[]", relationSchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/activity",
          service: "graphMemoryPro", namespace: "graphMemoryPro", method: "activity", invocation: { kind: "direct" },
          parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: strict("graph-memory/pro#ActivitySessionId", { parse: (value) => { const id = string(value, "sessionId"); if (!id) invalid("sessionId"); return id; } }) }, { name: "limit", wire: "limit", source: "json", codec: strict("graph-memory/pro#ActivityLimit?", { parse: (value) => { const limit = positiveLimit(value, "limit"); if (limit !== undefined && limit > 100) invalid("limit"); return limit; } }) }],
          result: strict("graph-memory/pro#GraphMemoryActivity[]", activitySchema),
        },
        {
          id: "graph-memory-pro-dsh#graphMemoryPro/usage",
          service: "graphMemoryPro", namespace: "graphMemoryPro", method: "usage", invocation: { kind: "direct" },
          parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: strict("graph-memory/pro#UsageSessionId", { parse: (value) => { const id = string(value, "sessionId"); if (!id) invalid("sessionId"); return id; } }) }, { name: "limit", wire: "limit", source: "json", codec: strict("graph-memory/pro#UsageLimit?", { parse: (value) => { const limit = positiveLimit(value, "limit"); if (limit !== undefined && limit > 100) invalid("limit"); return limit; } }) }],
          result: strict("graph-memory/pro#GraphMemoryUsageRow[]", usageSchema),
        },
      ],
    };

    function GraphMemoryPanel({ close, loadDetail, loadOverview, loadTurns, loadRelations, loadActivity, loadUsage }) {
      const [activity, setActivity] = React.useState([]);
      const [usage, setUsage] = React.useState([]);
      const [telemetryError, setTelemetryError] = React.useState("");
      const [view, setView] = React.useState("overview");
      const [overview, setOverview] = React.useState(null);
      const [turns, setTurns] = React.useState([]);
      const [relations, setRelations] = React.useState([]);
      const [detail, setDetail] = React.useState(null);
      const [query, setQuery] = React.useState("");
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState("");

      React.useEffect(() => {
        let alive = true;
        void loadOverview().then((value) => { if (alive) setOverview(value); }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
      }, []);
      React.useEffect(() => {
        if (view !== "turns" && view !== "relations") return;
        let alive = true;
        setLoading(true);
        setError("");
        const load = view === "turns" ? loadTurns : loadRelations;
        void load(query).then((rows) => { if (alive) (view === "turns" ? setTurns : setRelations)(rows); }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
      }, [view, query]);
      React.useEffect(() => {
        if (!loadActivity || !loadUsage) return;
        let alive = true;
        const update = async () => {
          try {
            const [nextActivity, nextUsage] = await Promise.all([loadActivity(), loadUsage()]);
            if (alive) { setActivity(nextActivity); setUsage(nextUsage); setTelemetryError(""); }
          } catch (cause) { if (alive) setTelemetryError(cause instanceof Error ? cause.message : String(cause)); }
        };
        void update();
        const timer = setInterval(() => { void update(); }, 5000);
        return () => { alive = false; clearInterval(timer); };
      }, [loadActivity, loadUsage]);
      const openDetail = async (id) => {
        try { setError(""); setDetail(await loadDetail(id)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      };
      return React.createElement("div", {
        role: "dialog",
        "aria-modal": true,
        "aria-label": "Graph Memory Pro",
        style: {
          position: "fixed", inset: "24px", zIndex: 1000, display: "flex", flexDirection: "column",
          border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "18px",
          background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)",
          boxShadow: "0 24px 80px rgba(0,0,0,.28)", overflow: "hidden",
        },
      },
      React.createElement("header", {
        style: { display: "flex", alignItems: "center", gap: "12px", padding: "18px 20px", borderBottom: "1px solid var(--dsw-alias-border-l2)" },
      },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("strong", { style: { fontSize: "17px" } }, "Graph Memory Pro"),
        React.createElement("div", { style: { marginTop: "3px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } }, "只读轮次记忆与 SPO 导航 · SQLite")),
      view === "turns" || view === "relations" ? React.createElement("input", {
        value: query,
        "aria-label": "搜索当前列表",
        placeholder: "搜索轮次摘要或 SPO 关系",
        onChange: (event) => setQuery(event.target.value),
        style: { width: "260px", height: "34px", borderRadius: "9px", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", color: "inherit", padding: "0 12px" },
      }) : null,
      React.createElement("button", { type: "button", onClick: () => { setDetail(null); setView("overview"); }, style: buttonStyle }, "概览"),
      React.createElement("button", { type: "button", onClick: () => { setDetail(null); setView("turns"); }, style: buttonStyle }, "轮次记忆"),
      React.createElement("button", { type: "button", onClick: () => { setDetail(null); setView("relations"); }, style: buttonStyle }, "SPO 关系"),
      loadUsage ? React.createElement("button", { type: "button", onClick: () => { setDetail(null); setView("usage"); }, style: buttonStyle }, "Usage / 缓存") : null,
      React.createElement("button", { type: "button", onClick: close, "aria-label": "关闭", style: iconButtonStyle }, "×")),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "240px minmax(0,1fr)", minHeight: 0, flex: 1 } },
        React.createElement("aside", { style: { padding: "18px", borderRight: "1px solid var(--dsw-alias-border-l2)", overflow: "auto" } },
          React.createElement("div", { style: metricStyle }, React.createElement("span", null, "轮次记忆"), React.createElement("strong", null, overview?.turnMemories ?? "—")),
          React.createElement("div", { style: metricStyle }, React.createElement("span", null, "SPO 关系"), React.createElement("strong", null, overview?.navigationTriples ?? "—")),
          loadActivity ? React.createElement("section", { "aria-label": "Graph Memory 活动", style: { marginTop: "20px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } },
            React.createElement("strong", null, "本会话活动"),
            ...(telemetryError ? [React.createElement("p", { key: "error", role: "alert" }, `活动读取失败：${telemetryError}`)] : activity.length ? activity.slice(0, 8).map((item) => React.createElement("p", { key: item.id }, `${item.kind} · ${item.status} · ${item.message}`)) : [React.createElement("p", { key: "empty" }, "暂无活动")])) : null,
          React.createElement("p", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: 1.7 } }, "只读视图由 DSH Host 通过受控 Remote 提供，浏览器不接触数据库凭据。")),
        React.createElement("main", { style: { padding: "18px", overflow: "auto" } },
          loading ? React.createElement("p", null, "正在读取记忆…") : null,
          error ? React.createElement("p", { role: "alert", style: { color: "var(--dsw-alias-label-error)" } }, error) : null,
          detail ? React.createElement("section", { style: cardStyle },
            React.createElement("button", { type: "button", onClick: () => setDetail(null), style: buttonStyle }, "关闭详情"),
            React.createElement("h3", null, detail.name),
            React.createElement("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, detail.contentTruncated ? `${detail.content}\n（来源已截断）` : detail.content)) : null,
          !loading && !error && view === "overview" && overview ? React.createElement("section", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" } },
            ...[["轮次记忆", overview.turnMemories], ["导航词", overview.navigationTerms], ["SPO 关系", overview.navigationTriples], ["导航社区", overview.navigationCommunities], ["旧版节点", overview.legacyNodes], ["旧版关系", overview.legacyEdges], ["待处理", overview.extraction.pending], ["已完成", overview.extraction.succeeded], ["已隔离", overview.extraction.quarantined], ["轮次向量", overview.turnVectors]].map(([label, value]) => React.createElement("div", { key: label, style: cardStyle }, React.createElement("small", null, label), React.createElement("strong", { style: { display: "block", fontSize: "22px", marginTop: "6px" } }, value)))) : null,
          view === "turns" ? React.createElement("div", null, ...turns.map((item) => React.createElement("article", { key: item.id, style: cardStyle },
            React.createElement("small", null, item.outcome), React.createElement("h3", null, item.summary),
            React.createElement("p", null, `SPO ${item.tripleCount} · 来源问答${item.sourceAvailable ? "可用" : "不可用"}`),
            item.sourceAvailable ? React.createElement("button", { type: "button", onClick: () => { void openDetail(item.id); }, style: buttonStyle }, "查看来源问答") : null))) : null,
          view === "relations" ? React.createElement("div", null, ...relations.map((item) => React.createElement("article", { key: item.id, style: cardStyle },
            React.createElement("strong", null, `${item.subject} → ${item.predicate} → ${item.object}`), React.createElement("p", null, item.summary),
            React.createElement("small", null, item.outcome),
            React.createElement("button", { type: "button", onClick: () => { void openDetail(item.memoryId); }, style: buttonStyle }, "查看来源问答")))) : null,
          view === "usage" ? React.createElement("div", null,
            ...(telemetryError ? [React.createElement("p", { key: "error", role: "alert" }, `Usage 读取失败：${telemetryError}`)] : usage.length ? usage.filter((item) => item.requestKind === "main-agent").map((item) => {
              const canRate = item.usageComplete && item.cacheReadTokens !== null && item.uncachedInputTokens !== null && item.cacheWriteTokens !== null;
              const denominator = canRate ? item.cacheReadTokens + item.uncachedInputTokens + item.cacheWriteTokens : 0;
              const rate = canRate && denominator > 0 ? `${((item.cacheReadTokens / denominator) * 100).toFixed(1)}%` : "不可用";
              return React.createElement("article", { key: item.id, style: cardStyle },
                React.createElement("strong", null, `轮次 ${item.turnIndex} · ${item.provider ?? "未知"}/${item.model ?? "未知"}`),
                React.createElement("p", null, `未缓存输入 ${item.uncachedInputTokens ?? "不可用"} · 输出 ${item.outputTokens ?? "不可用"}`),
                React.createElement("p", null, `缓存读取 ${item.cacheReadTokens ?? "不可用"} · 缓存写入 ${item.cacheWriteTokens ?? "不可用"} · 命中率 ${rate}`));
            }) : [React.createElement("p", { key: "empty" }, "本会话暂无完整 usage 数据")])) : null)));
    }

    const cardStyle = { padding: "14px", marginBottom: "10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "10px" };
    const buttonStyle = {
      height: "34px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "9px",
      background: "var(--dsw-alias-button-elevated-fill)", color: "inherit", cursor: "pointer", padding: "0 13px",
    };
    const iconButtonStyle = { ...buttonStyle, width: "34px", padding: 0, fontSize: "20px" };
    const metricStyle = { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" };

    function GraphMemoryEntry({ wide, loadDetail, loadOverview, loadTurns, loadRelations, loadActivity, loadUsage }) {
      const [open, setOpen] = React.useState(false);
      return React.createElement(React.Fragment, null,
        React.createElement("button", {
          type: "button",
          title: "Graph Memory Pro",
          "aria-label": "打开 Graph Memory Pro",
          onClick: () => setOpen(true),
          style: {
            width: wide ? "100%" : "36px", height: "36px", display: "flex", alignItems: "center",
            justifyContent: wide ? "flex-start" : "center", gap: "9px", padding: wide ? "0 10px" : 0,
            border: 0, borderRadius: "9px", background: "transparent", color: "var(--dsw-alias-label-secondary)", cursor: "pointer",
          },
        }, React.createElement("span", { "aria-hidden": true, style: { fontSize: "17px" } }, "◎"), wide ? React.createElement("span", null, "Graph Memory") : null),
        open ? React.createElement(GraphMemoryPanel, { close: () => setOpen(false), loadDetail, loadOverview, loadTurns, loadRelations, loadActivity, loadUsage }) : null);
    }

    const inject = ["slots", "remote"];
    async function apply(ctx) {
      const disposeRemote = await ctx.remote.$mount(remoteContribution);
      const ui = ctx.inject(["remote.graphMemoryPro", "slots"], (uiCtx) => {
        const shared = {
          loadDetail: async (id) => {
            const result = await uiCtx.remote.graphMemoryPro.detail(id);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
          },
          loadOverview: async () => {
            const result = await uiCtx.remote.graphMemoryPro.overview();
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
          },
          loadTurns: async (query = "") => {
            const result = await uiCtx.remote.graphMemoryPro.turns(query, 50);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
          },
          loadRelations: async (query = "") => {
            const result = await uiCtx.remote.graphMemoryPro.relations(query, 100);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
          },
        };
        const globalSlot = uiCtx.slots.inject("sidebar.footer.action", () => uiCtx.slots.register({
          name: "sidebar.footer.action", id: "graph-memory-pro-global", order: -10,
          inject: () => shared,
        }, GraphMemoryEntry));
        try {
          const sessionSlot = uiCtx.slots.inject("conversation.session.header.utilities", () => uiCtx.slots.register({
            name: "conversation.session.header.utilities", id: "graph-memory-pro", order: -10,
            inject: (sessionId) => ({
              ...shared,
              loadActivity: async (limit = 30) => {
                const result = await uiCtx.remote.graphMemoryPro.activity(`dsh:${sessionId}`, limit);
                if (!result.ok) throw new Error(result.error.message);
                return result.value;
              },
              loadUsage: async (limit = 30) => {
                const result = await uiCtx.remote.graphMemoryPro.usage(`dsh:${sessionId}`, limit);
                if (!result.ok) throw new Error(result.error.message);
                return result.value;
              },
            }),
          }, GraphMemoryEntry));
          return () => { sessionSlot(); globalSlot(); };
        } catch (error) { globalSlot(); throw error; }
      });
      try { await ui; } catch (error) { await ui.dispose(); await disposeRemote(); throw error; }
      return async () => {
        await ui.dispose();
        await disposeRemote();
      };
    }

    module.exports.apply = apply;
    module.exports.inject = inject;
    return module.exports;
  },
});
