/**
 * Owned POST to `{gatewayUrl}/api/{method}`.
 * Keeps the URL path; only a trailing slash is trimmed. Never logs tokens or headers.
 */
export class GatewayHttpError extends Error {
    status;
    method;
    constructor(message, options) {
        super(message);
        this.name = "GatewayHttpError";
        if (options?.status != null)
            this.status = options.status;
        if (options?.method)
            this.method = options.method;
    }
}
export function trimGatewayUrl(url) {
    return url.replace(/\/$/, "");
}
function isRecord(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}
async function readJson(res) {
    const text = await res.text();
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text };
    }
}
function errorDetail(data, fallback) {
    if (typeof data === "string" && data.length > 0)
        return data;
    if (isRecord(data)) {
        if (typeof data.message === "string" && data.message.length > 0)
            return data.message;
        if (typeof data.error === "string" && data.error.length > 0)
            return data.error;
        if (typeof data.raw === "string" && data.raw.length > 0)
            return data.raw;
    }
    return fallback;
}
export async function gatewayPost(session, method, body = {}, fetchImpl = globalThis.fetch, signal) {
    const url = `${trimGatewayUrl(session.gatewayUrl)}/api/${method}`;
    const headers = {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
        ...(session.headers ?? {}),
    };
    const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
        ...(signal ? { signal } : {}),
    });
    const data = await readJson(res);
    if (!res.ok) {
        const detail = errorDetail(data, res.statusText);
        throw new GatewayHttpError(`${method} failed: ${res.status} ${String(detail).slice(0, 300)}`, {
            status: res.status,
            method,
        });
    }
    return data;
}
