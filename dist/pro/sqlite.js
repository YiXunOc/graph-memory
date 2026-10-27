import { openDb } from "../src/store/db.js";
import { allActiveNodes, allEdges, findById, getStats, extractStoredText, searchNodes, } from "../src/store/store.js";
import { getGraphMemoryUsage } from "./usage.js";
import { getGraphMemoryActivities } from "./activity.js";
export const DEFAULT_SNAPSHOT_NODE_LIMIT = 200;
export const MAX_SNAPSHOT_NODE_LIMIT = 1_000;
export const DEFAULT_SNAPSHOT_EDGE_LIMIT = 2_000;
export const MAX_SNAPSHOT_EDGE_LIMIT = 10_000;
export const DEFAULT_OVERVIEW_TEXT_LIMIT = 1_000;
export const DEFAULT_DETAIL_CONTENT_LIMIT = 20_000;
export const MAX_TEXT_LIMIT = 100_000;
function integerWithin(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be an integer between ${min} and ${max}, received ${value}`);
    }
    return value;
}
function bounded(text, limit) {
    if (text.length <= limit)
        return { text, truncated: false };
    return { text: text.slice(0, limit), truncated: true };
}
function snapshotNode(node, textLimit) {
    return {
        id: node.id,
        type: node.type,
        name: node.name,
        description: bounded(node.description, textLimit).text,
        status: node.status,
        validatedCount: node.validatedCount,
        sourceSessionCount: node.sourceSessions.length,
        communityId: node.communityId,
        pagerank: node.pagerank,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
    };
}
function snapshotEdge(edge, textLimit) {
    return {
        id: edge.id,
        fromId: edge.fromId,
        toId: edge.toId,
        type: edge.type,
        instruction: bounded(edge.instruction, textLimit).text,
        ...(edge.condition ? { condition: bounded(edge.condition, textLimit).text } : {}),
        createdAt: edge.createdAt,
    };
}
function navigationNode(row, type, textLimit) {
    return {
        id: `${type.toLowerCase()}:${row.id}`,
        type,
        name: bounded(row.name, textLimit).text,
        description: type === "TURN" ? "轮次摘要（点击查看来源问答）" : "导航词",
        status: "active",
        validatedCount: 1,
        sourceSessionCount: 0,
        communityId: row.communityId,
        pagerank: 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
/** SQLite-backed implementation shared with the Community memory engine. */
export class SqliteGraphSnapshotStore {
    #db;
    #defaultNodeLimit;
    #maxNodeLimit;
    #maxEdgeLimit;
    #overviewTextLimit;
    #detailContentLimit;
    #closed = false;
    constructor(options) {
        this.#maxNodeLimit = integerWithin("maxNodeLimit", options.maxNodeLimit ?? MAX_SNAPSHOT_NODE_LIMIT, 1, MAX_SNAPSHOT_NODE_LIMIT);
        this.#defaultNodeLimit = integerWithin("defaultNodeLimit", options.defaultNodeLimit ?? Math.min(DEFAULT_SNAPSHOT_NODE_LIMIT, this.#maxNodeLimit), 1, this.#maxNodeLimit);
        this.#maxEdgeLimit = integerWithin("maxEdgeLimit", options.maxEdgeLimit ?? DEFAULT_SNAPSHOT_EDGE_LIMIT, 1, MAX_SNAPSHOT_EDGE_LIMIT);
        this.#overviewTextLimit = integerWithin("overviewTextLimit", options.overviewTextLimit ?? DEFAULT_OVERVIEW_TEXT_LIMIT, 1, MAX_TEXT_LIMIT);
        this.#detailContentLimit = integerWithin("detailContentLimit", options.detailContentLimit ?? DEFAULT_DETAIL_CONTENT_LIMIT, 1, MAX_TEXT_LIMIT);
        this.#db = openDb(options.dbPath);
    }
    getSnapshot(request = {}) {
        this.#assertOpen();
        const maxNodes = integerWithin("maxNodes", request.maxNodes ?? this.#defaultNodeLimit, 1, this.#maxNodeLimit);
        const allowedTypes = this.#nodeTypes(request.nodeTypes);
        const query = request.query?.trim() ?? "";
        const legacy = (query
            ? searchNodes(this.#db, query, this.#maxNodeLimit + 1)
            : allActiveNodes(this.#db)
                .sort((left, right) => right.pagerank - left.pagerank || right.updatedAt - left.updatedAt))
            .map((node) => snapshotNode(node, this.#overviewTextLimit));
        const memories = this.#db.prepare(`
      SELECT id, summary AS name, created_at AS createdAt, updated_at AS updatedAt
      FROM gm_turn_memories
      WHERE instr(lower(summary), lower(?)) > 0
      ORDER BY updated_at DESC, id LIMIT ?
    `).all(query, this.#maxNodeLimit + 1);
        const terms = this.#db.prepare(`
      SELECT id, display_text AS name, community_id AS communityId,
             created_at AS createdAt, updated_at AS updatedAt
      FROM gm_navigation_terms
      WHERE instr(lower(display_text), lower(?)) > 0
      ORDER BY updated_at DESC, id LIMIT ?
    `).all(query, this.#maxNodeLimit + 1);
        const candidates = [
            ...terms.map((row) => navigationNode(row, "TERM", this.#overviewTextLimit)),
            ...memories.map((row) => navigationNode({ ...row, communityId: null }, "TURN", this.#overviewTextLimit)),
            ...legacy,
        ];
        const filtered = candidates.filter((node) => !allowedTypes || allowedTypes.has(node.type));
        const selected = filtered.slice(0, maxNodes);
        const nodeIds = new Set(selected.map((node) => node.id));
        const matchingEdges = allEdges(this.#db)
            .filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId))
            .map((edge) => snapshotEdge(edge, this.#overviewTextLimit));
        const termIds = selected.filter((node) => node.type === "TERM").map((node) => node.id.slice(5));
        if (termIds.length) {
            const placeholders = termIds.map(() => "?").join(",");
            const triples = this.#db.prepare(`
        SELECT id, subject_id AS fromId, object_id AS toId, predicate, created_at AS createdAt
        FROM gm_navigation_triples
        WHERE subject_id IN (${placeholders}) AND object_id IN (${placeholders})
        ORDER BY created_at DESC, id LIMIT ?
      `).all(...termIds, ...termIds, this.#maxEdgeLimit + 1);
            matchingEdges.push(...triples.map((edge) => ({
                id: `navigation:${edge.id}`,
                fromId: `term:${edge.fromId}`,
                toId: `term:${edge.toId}`,
                type: "NAVIGATES",
                instruction: bounded(edge.predicate, this.#overviewTextLimit).text,
                createdAt: edge.createdAt,
            })));
        }
        const stats = getStats(this.#db);
        return {
            generatedAt: Date.now(),
            nodes: selected,
            edges: matchingEdges.slice(0, this.#maxEdgeLimit),
            totals: {
                nodes: stats.totalNodes + stats.turnMemories + stats.navigationTerms,
                edges: stats.totalEdges + stats.navigationTriples,
            },
            truncated: {
                nodes: filtered.length > selected.length,
                edges: matchingEdges.length > this.#maxEdgeLimit,
            },
        };
    }
    getNodeDetail(id) {
        this.#assertOpen();
        const rawId = String(id);
        if (rawId.startsWith("turn:")) {
            const memoryId = rawId.slice(5);
            const row = this.#db.prepare("SELECT * FROM gm_turn_memories WHERE id=?").get(memoryId);
            if (!row)
                return null;
            const sources = this.#db.prepare(`
        SELECT source.turn_index, message.role, message.content
        FROM gm_turn_memory_sources source
        JOIN gm_messages message ON message.id=source.message_id
        WHERE source.memory_id=?
        ORDER BY source.turn_index, source.source_order
      `).all(memoryId);
            const sourceText = sources.map((source) => {
                let text = "";
                try {
                    text = extractStoredText(JSON.parse(source.content));
                }
                catch {
                    text = source.content;
                }
                return `${source.role === "user" ? "用户" : "助手"}：${text}`;
            }).filter(Boolean).join("\n");
            const node = navigationNode({
                id: row.id,
                name: row.summary,
                communityId: null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }, "TURN", this.#overviewTextLimit);
            const content = bounded(`${row.summary}${sourceText ? `\n\n${sourceText}` : ""}`, this.#detailContentLimit);
            return { ...node, content: content.text, contentTruncated: content.truncated };
        }
        if (rawId.startsWith("term:")) {
            const row = this.#db.prepare(`
        SELECT id, display_text AS name, community_id AS communityId,
               created_at AS createdAt, updated_at AS updatedAt
        FROM gm_navigation_terms WHERE id=?
      `).get(rawId.slice(5));
            if (!row)
                return null;
            const node = navigationNode(row, "TERM", this.#overviewTextLimit);
            return { ...node, content: node.name, contentTruncated: false };
        }
        const node = findById(this.#db, rawId);
        if (!node || node.status !== "active")
            return null;
        const content = bounded(node.content, this.#detailContentLimit);
        return {
            ...snapshotNode(node, this.#overviewTextLimit),
            content: content.text,
            contentTruncated: content.truncated,
        };
    }
    getOverview() {
        this.#assertOpen();
        const stats = getStats(this.#db);
        const extraction = this.#db.prepare("SELECT extraction_state AS state, COUNT(*) AS count FROM gm_messages GROUP BY extraction_state").all();
        const queue = { pending: 0, succeeded: 0, quarantined: 0 };
        for (const row of extraction)
            if (row.state in queue)
                queue[row.state] = Number(row.count);
        const turnVectors = Number(this.#db.prepare("SELECT COUNT(*) AS count FROM gm_turn_vectors").get()?.count ?? 0);
        return { turnMemories: stats.turnMemories, navigationTerms: stats.navigationTerms, navigationTriples: stats.navigationTriples, navigationCommunities: stats.navigationCommunities, legacyNodes: stats.totalNodes, legacyEdges: stats.totalEdges, extraction: queue, turnVectors };
    }
    getTurnMemories(query = "", limit = 50) {
        this.#assertOpen();
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new RangeError("turn limit must be 1..100");
        const rows = this.#db.prepare(`SELECT memory.id, memory.summary, memory.outcome, memory.created_at AS createdAt, memory.updated_at AS updatedAt,
      EXISTS(SELECT 1 FROM gm_turn_memory_sources source JOIN gm_messages message ON message.id=source.message_id WHERE source.memory_id=memory.id AND message.role='user')
      AND EXISTS(SELECT 1 FROM gm_turn_memory_sources source JOIN gm_messages message ON message.id=source.message_id WHERE source.memory_id=memory.id AND message.role='assistant') AS sourceAvailable,
      (SELECT COUNT(*) FROM gm_navigation_triples triple WHERE triple.memory_id=memory.id) AS tripleCount
      FROM gm_turn_memories memory WHERE instr(lower(memory.summary), lower(?)) > 0 ORDER BY memory.updated_at DESC, memory.id LIMIT ?`).all(query, limit);
        return rows.map(row => ({ id: `turn:${String(row.id)}`, summary: String(row.summary), outcome: String(row.outcome), createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt), sourceAvailable: Boolean(row.sourceAvailable), tripleCount: Number(row.tripleCount) }));
    }
    getRelations(query = "", limit = 100) {
        this.#assertOpen();
        if (!Number.isInteger(limit) || limit < 1 || limit > 200)
            throw new RangeError("relation limit must be 1..200");
        const rows = this.#db.prepare(`SELECT triple.id, triple.memory_id AS memoryId, subject.display_text AS subject, triple.predicate, object.display_text AS object,
      memory.summary, memory.outcome, triple.created_at AS createdAt
      FROM gm_navigation_triples triple JOIN gm_navigation_terms subject ON subject.id=triple.subject_id
      JOIN gm_navigation_terms object ON object.id=triple.object_id JOIN gm_turn_memories memory ON memory.id=triple.memory_id
      WHERE instr(lower(subject.display_text || ' ' || triple.predicate || ' ' || object.display_text || ' ' || memory.summary), lower(?)) > 0
      ORDER BY triple.created_at DESC, triple.id LIMIT ?`).all(query, limit);
        return rows.map(row => ({ id: String(row.id), memoryId: `turn:${String(row.memoryId)}`, subject: String(row.subject), predicate: String(row.predicate), object: String(row.object), summary: String(row.summary), outcome: String(row.outcome), createdAt: Number(row.createdAt) }));
    }
    getUsage(sessionId, limit) {
        this.#assertOpen();
        return getGraphMemoryUsage(this.#db, sessionId, limit);
    }
    getActivities(sessionId, limit) {
        this.#assertOpen();
        return getGraphMemoryActivities(this.#db, sessionId, limit);
    }
    close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#db.close();
    }
    #nodeTypes(types) {
        if (!types?.length)
            return undefined;
        const allowed = new Set();
        for (const type of types) {
            if (!["TASK", "SKILL", "EVENT", "TURN", "TERM"].includes(type)) {
                throw new TypeError(`nodeTypes contains unsupported value ${JSON.stringify(type)}`);
            }
            allowed.add(type);
        }
        return allowed;
    }
    #assertOpen() {
        if (this.#closed)
            throw new Error("Graph Memory Pro snapshot store is closed");
    }
}
