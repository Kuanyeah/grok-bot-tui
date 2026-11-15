import { ensureSandboxHeaders, headersFromEnsureSandbox, headersFromEnv, mergeGatewayHeaders, normalizeHeaderMap, requestHeaders } from "./headers.js";
import { grokBotActiveAccountKey, hasGrokBotAppCredentials, hasGrokBotGatewaySession, loadGrokBotAppCredentials, loadGrokBotGatewaySession } from "./app-session.js";
import { assertAllowedCredentialUrl, redactSecrets } from "./url-policy.js";

class GatewayError extends Error {
  constructor(message, { status, method } = {}) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.method = method;
  }
}

// ponytail: fixed 30 s deadline and buffered byte cap; upgrade path is per-method budgets plus streaming reads.
const GATEWAY_TIMEOUT_MS = 30000;
export const GATEWAY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const READ_ONLY_METHODS = new Set(["listAgents", "getAgentWorkflows", "getAgentTranscriptTail", "getAgentThread"]);
const reconnectStates = new WeakMap();

function assertGatewayActive(signal) {
  if (signal?.aborted) {
    const error = new GatewayError("Gateway submission cancelled before transmission");
    error.delivery = "rejected";
    error.reason = "cancelled";
    throw error;
  }
}

function gatewayDeadline(signal) {
  const timeout = AbortSignal.timeout(GATEWAY_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function backendBase() {
  return (
    process.env.CURSOR_API_BASE_URL ||
    "https://api2.cursor.sh"
  ).replace(/\/$/, "");
}

function accessTokenFromEnv() {
  return (process.env.CURSOR_ACCESS_TOKEN || "").trim();
}

function gatewayTokenFromEnv() {
  return (process.env.GROK_BOT_GATEWAY_TOKEN || "").trim();
}

function gatewayOverride() {
  const token = gatewayTokenFromEnv();
  const url = (process.env.GROK_BOT_GATEWAY_URL || "").trim();
  if (url && token) {
    return {
      gatewayUrl: assertAllowedCredentialUrl(url.replace(/\/$/, ""), { kind: "gateway" }),
      gatewayToken: token,
      gatewayHeaders: headersFromEnv(),
    };
  }
  return null;
}

function sessionFromApp(options) {
  let loaded;
  try {
    loaded = loadGrokBotGatewaySession(options);
  } catch (error) {
    // Descriptor present but unusable (e.g. Windows Local State missing). Fall
    // through to CURSOR_ACCESS_TOKEN → EnsureSandBox when that token is set.
    if (accessTokenFromEnv()) return null;
    throw error instanceof Error ? new GatewayError(error.message) : error;
  }
  if (!loaded) return null;
  return {
    gatewayUrl: assertAllowedCredentialUrl(loaded.gatewayUrl, { kind: "gateway" }),
    gatewayToken: loaded.gatewayToken,
    gatewayHeaders: mergeGatewayHeaders(normalizeHeaderMap(loaded.headers), headersFromEnv()),
  };
}

export function hasGatewayAuth() {
  return Boolean(gatewayOverride() || accessTokenFromEnv() || hasGrokBotGatewaySession() || hasGrokBotAppCredentials());
}

async function readTextCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new GatewayError("Gateway response too large (over " + maxBytes + " bytes)");
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength ?? value.length;
    if (bytes > maxBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      throw new GatewayError("Gateway response too large (over " + maxBytes + " bytes)");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer ?? c, c.byteOffset ?? 0, c.byteLength ?? c.length))).toString("utf8");
}

async function readJson(res) {
  const text = await readTextCapped(res, GATEWAY_MAX_RESPONSE_BYTES);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") return obj[key];
  }
  return undefined;
}

async function ensureSandbox(accessToken, { signal, teamId } = {}) {
  assertGatewayActive(signal);
  const url = assertAllowedCredentialUrl(backendBase(), { kind: "backend" }) + "/aiserver.v1.GrokBotService/EnsureSandBox";
  let res, body;
  try {
    res = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: gatewayDeadline(signal),
      headers: { ...ensureSandboxHeaders(accessToken), ...(teamId === undefined ? {} : { "x-cursor-team-id": teamId }) },
      body: "{}",
    });
    body = await readJson(res);
  } catch (error) {
    assertGatewayActive(signal);
    throw error;
  }
  assertGatewayActive(signal);
  if (!res.ok) {
    const detail = body.message || body.error || body.raw || res.statusText;
    throw new GatewayError("EnsureSandBox failed: " + res.status + " " + redactSecrets(detail), { status: res.status, method: "EnsureSandBox" });
  }
  const gatewayUrl = pick(body, "gatewayUrl", "gateway_url");
  const gatewayToken = pick(body, "gatewayToken", "gateway_token");
  if (!gatewayUrl || !gatewayToken) {
    throw new GatewayError("EnsureSandBox returned no gatewayUrl/gatewayToken. Auth may be a dashboard API key (those do not work).");
  }
  return { gatewayUrl: assertAllowedCredentialUrl(String(gatewayUrl).replace(/\/$/, ""), { kind: "gateway" }), gatewayToken: String(gatewayToken), gatewayHeaders: mergeGatewayHeaders(headersFromEnsureSandbox(body), headersFromEnv()) };
}

export async function connectGateway({ signal, appSessionOptions } = {}) {
  assertGatewayActive(signal);
  const override = gatewayOverride();
  if (override) return override;
  const fromApp = sessionFromApp(appSessionOptions);
  if (fromApp) {
    // Malformed account metadata disables reconnect, not the cached session.
    let accountKey = null;
    try { accountKey = grokBotActiveAccountKey(appSessionOptions); } catch { /* no safe reconnect identity */ }
    if (accountKey) reconnectStates.set(fromApp, { accountKey, appSessionOptions, generation: 0, pending: null });
    return fromApp;
  }
  const token = accessTokenFromEnv();
  if (!token) {
    const credentials = loadGrokBotAppCredentials(appSessionOptions);
    if (credentials) {
      const session = await ensureSandbox(credentials.accessToken, { signal, teamId: credentials.teamId });
      if (grokBotActiveAccountKey(appSessionOptions) !== credentials.accountKey) {
        throw new GatewayError("Grok Bot active account changed during reconnect; refreshed route discarded.");
      }
      assertGatewayActive(signal);
      reconnectStates.set(session, { accountKey: credentials.accountKey, appSessionOptions, generation: 0, pending: null });
      return session;
    }
    throw new GatewayError("Set CURSOR_ACCESS_TOKEN, or GROK_BOT_GATEWAY_URL + GROK_BOT_GATEWAY_TOKEN. Do not use a Cursor dashboard API key.");
  }
  const session = await ensureSandbox(token, { signal });
  reconnectStates.set(session, { accessToken: token, generation: 0, pending: null });
  return session;
}

async function refreshGateway(session, state, failedGeneration, signal) {
  assertGatewayActive(signal);
  if (state.generation !== failedGeneration) return;
  if (!state.pending) {
    const refresh = async () => {
      const credentials = state.accountKey
        ? loadGrokBotAppCredentials({ ...state.appSessionOptions, expectedAccountKey: state.accountKey })
        : { accessToken: state.accessToken };
      if (!credentials?.accessToken) {
        throw new GatewayError("No matching credentials available to reconnect the hibernated gateway.");
      }
      const fresh = await ensureSandbox(credentials.accessToken, { signal, teamId: credentials.teamId });
      if (state.accountKey && grokBotActiveAccountKey(state.appSessionOptions) !== state.accountKey) {
        throw new GatewayError("Grok Bot active account changed during reconnect; refreshed route discarded.");
      }
      assertGatewayActive(signal);
      Object.assign(session, fresh);
      state.generation++;
    };
    state.pending = refresh().finally(() => { state.pending = null; });
  }
  await state.pending;
  assertGatewayActive(signal);
}

export async function gatewayCall(session, method, body = {}, { signal, reconnected = false } = {}) {
  assertGatewayActive(signal);
  const base = assertAllowedCredentialUrl(session.gatewayUrl, { kind: "gateway" });
  const url = base + "/api/" + method;
  // Cancellation can abort read/auth preflights. Once a prompt request starts,
  // observe its actual receipt (or timeout) instead of losing certainty on stop.
  const prompt = method === "sendPrompt";
  const reconnectState = reconnectStates.get(session);
  const generation = reconnectState?.generation;
  const options = {
    method: "POST",
    redirect: "error",
    signal: gatewayDeadline(prompt ? undefined : signal),
    headers: requestHeaders(session),
    body: JSON.stringify(body),
  };
  assertGatewayActive(signal); // Final synchronous boundary before transmission.
  let res, data;
  try {
    res = await fetch(url, options);
    data = await readJson(res);
  } catch (error) {
    if (!prompt) assertGatewayActive(signal);
    throw error;
  }
  if (!prompt) assertGatewayActive(signal);
  if (!res.ok) {
    if (
      !reconnected && READ_ONLY_METHODS.has(method) && reconnectState &&
      res.status === 417 &&
      res.headers.get("x-anyrun-error-source") === "anyrun-proxy" &&
      res.headers.get("x-anyrun-failure-reason") === "pod_hibernated"
    ) {
      await refreshGateway(session, reconnectState, generation, signal);
      return gatewayCall(session, method, body, { signal, reconnected: true });
    }
    const detail = data.message || data.error || data.raw || res.statusText;
    throw new GatewayError(method + " failed: " + res.status + " " + redactSecrets(String(detail).slice(0, 300)), { status: res.status, method });
  }
  return data;
}
