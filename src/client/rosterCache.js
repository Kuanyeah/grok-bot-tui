/**
 * Disk cache of the last successful listAgents roster so the lobby can open
 * before the slow gateway round-trip finishes. Never stores tokens.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { trimGatewayUrl } from "./http.js";
const VERSION = 1;
function isRecord(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}
function asCachedAgent(row) {
    if (!isRecord(row))
        return undefined;
    if (typeof row.id !== "string" || !row.id.trim())
        return undefined;
    if (typeof row.name !== "string")
        return undefined;
    const agent = {
        id: row.id.trim(),
        name: row.name.trim() || row.id.trim(),
        isGroup: row.isGroup === true,
    };
    if (typeof row.title === "string" && row.title.trim())
        agent.title = row.title.trim();
    if (Array.isArray(row.memberIds)) {
        const ids = row.memberIds.filter((id) => typeof id === "string" && id.trim().length > 0);
        if (ids.length)
            agent.memberIds = ids;
    }
    if (Array.isArray(row.members)) {
        const members = [];
        for (const m of row.members) {
            if (!isRecord(m))
                continue;
            if (typeof m.id !== "string" || !m.id.trim())
                continue;
            if (typeof m.name !== "string")
                continue;
            members.push({ id: m.id.trim(), name: m.name.trim() || m.id.trim() });
        }
        if (members.length)
            agent.members = members;
    }
    return agent;
}
/**
 * Stable key for a gateway session. Uses URL plus an opaque credential id (e.g.
 * a hash of the token) so account switches against the same URL do not collide.
 */
export function rosterCacheKey(gatewayUrl, credentialId) {
    const trimmed = trimGatewayUrl(gatewayUrl.trim());
    const material = credentialId ? `${trimmed}\0${credentialId}` : trimmed;
    return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
export function rosterCacheDir(io = {}) {
    if (io.cacheDir)
        return io.cacheDir;
    const home = io.home ?? homedir();
    const xdg = process.env.XDG_CACHE_HOME?.trim();
    if (xdg)
        return join(xdg, "grok-tui");
    return join(home, ".cache", "grok-tui");
}
export function rosterCachePath(key, io = {}) {
    return join(rosterCacheDir(io), `roster-${key}.json`);
}
/**
 * Last successful roster for this gateway key.
 * `undefined` = miss/corrupt. Empty array = host had no agents (clears stale cache).
 */
export function readRosterCache(key, io = {}) {
    const path = rosterCachePath(key, io);
    const exists = io.existsSync ?? existsSync;
    if (!exists(path))
        return undefined;
    try {
        const read = io.readFileSync ?? readFileSync;
        const raw = JSON.parse(read(path, "utf8"));
        if (!isRecord(raw) || raw.version !== VERSION || !Array.isArray(raw.agents))
            return undefined;
        const agents = [];
        for (const row of raw.agents) {
            const agent = asCachedAgent(row);
            if (agent)
                agents.push(agent);
        }
        // Legit empty host roster is a cache hit; rows that all fail validation is a miss.
        if (agents.length === 0 && raw.agents.length > 0)
            return undefined;
        return agents;
    }
    catch {
        return undefined;
    }
}
/**
 * Persist a roster (including empty). Never throws — disk failures must not
 * look like a gateway error to the caller.
 */
export function writeRosterCache(key, agents, io = {}) {
    try {
        const dir = rosterCacheDir(io);
        const exists = io.existsSync ?? existsSync;
        const lstat = io.lstatSync ?? lstatSync;
        const mkdir = io.mkdirSync ?? mkdirSync;
        const unlink = io.unlinkSync ?? unlinkSync;
        const rename = io.renameSync ?? renameSync;
        if (exists(dir)) {
            const dirStat = lstat(dir);
            if (!dirStat.isDirectory() && !dirStat.isSymbolicLink())
                return false;
        }
        mkdir(dir, { recursive: true, mode: 0o700 });
        const payload = {
            version: VERSION,
            savedAtMs: Date.now(),
            agents: agents.map((agent) => ({
                id: agent.id,
                name: agent.name,
                isGroup: agent.isGroup,
                ...(agent.title ? { title: agent.title } : {}),
                ...(agent.memberIds?.length ? { memberIds: agent.memberIds } : {}),
                ...(agent.members?.length ? { members: agent.members } : {}),
            })),
        };
        const path = rosterCachePath(key, io);
        if (exists(path) && lstat(path).isSymbolicLink())
            unlink(path);
        const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
        if (exists(tmp))
            unlink(tmp);
        const write = io.writeFileSync ?? writeFileSync;
        write(tmp, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
        rename(tmp, path);
        return true;
    }
    catch {
        return false;
    }
}
/** Optional cleanup helper for tests. */
export function clearRosterCache(key, io = {}) {
    const path = rosterCachePath(key, io);
    try {
        const unlink = io.unlinkSync ?? unlinkSync;
        unlink(path);
    }
    catch {
        // ignore
    }
}
