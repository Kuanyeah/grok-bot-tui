import { openGbotHostClient } from './gbot-bridge.js';
import { defaultLocalGatewayUrl } from "../config.js";
import { MISSING_AUTH_MESSAGE } from "./errors.js";
import { HttpHostClient } from "./host.js";
import { MockHostClient } from "./mock.js";
import { loadDesktopSession } from "./session.js";
import { HostClientError } from "./types.js";
/**
 * Prefer env token (optional URL, else localhost). Else the macOS Grok Bot
 * desktop session. A URL without a token does not block desktop fallback.
 * Mock stays `--mock`.
 */
export async function openHostClient(options) {
    if (options.mock || options.config.mock) {
        return new MockHostClient(options.mockOptions);
    }
    const env = options.env ?? process.env;
    const token = options.token;
    const gatewayUrl = options.config.gatewayUrl;
    if (token) {
        return new HttpHostClient({
            gatewayUrl: gatewayUrl ?? defaultLocalGatewayUrl(env),
            token,
            source: "gateway",
            fetch: options.fetch,
        });
    }
    return openGbotHostClient();
}
