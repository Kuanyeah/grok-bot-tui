import { config as loadDotenv } from "dotenv";
import { DEFAULT_WAIT_TIMEOUT_MS, parsePollMs, parseWaitTimeoutMs } from "./timing.js";
/** Canonical gateway env names. Only these are read. */
export const GATEWAY_URL_KEY = "GROKBOT_GATEWAY_URL";
export const GATEWAY_TOKEN_KEY = "GROKBOT_GATEWAY_TOKEN";
export const GATEWAY_PORT_KEY = "GROKBOT_GATEWAY_PORT";
export function loadDotEnvFile() {
    loadDotenv({ quiet: true });
}
export function readConfig(env = process.env) {
    const gatewayUrl = env[GATEWAY_URL_KEY]?.trim() || undefined;
    const defaultAgent = env.GROK_TUI_DEFAULT_AGENT?.trim() || undefined;
    const mock = env.GROK_TUI_MOCK === "1" ||
        env.GROK_TUI_MOCK === "true" ||
        env.GROK_TUI_MOCK === "yes";
    const waitTimeoutMs = parseWaitTimeoutMs(env.GROK_TUI_WAIT_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS);
    return {
        ...(gatewayUrl ? { gatewayUrl } : {}),
        ...(defaultAgent ? { defaultAgent } : {}),
        mock,
        ...(waitTimeoutMs != null ? { waitTimeoutMs } : {}),
        pollIntervalMs: parsePollMs(env.GROK_TUI_POLL_MS),
    };
}
/** Token stays in-process. Callers must not log the return value. */
export function readToken(env = process.env) {
    const token = env[GATEWAY_TOKEN_KEY]?.trim();
    return token || undefined;
}
export function defaultLocalGatewayUrl(env = process.env) {
    const port = env[GATEWAY_PORT_KEY]?.trim() || "1340";
    return `http://127.0.0.1:${port}`;
}
