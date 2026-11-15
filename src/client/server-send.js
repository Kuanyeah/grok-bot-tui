import { loadGrokBotAppCredentials, grokBotActiveAccountKey } from './vendor/gbot/app-session.js';
import { ensureSandboxHeaders } from './vendor/gbot/headers.js';
import { assertAllowedCredentialUrl } from './vendor/gbot/url-policy.js';

export function isServerBotRefusal(error) {
    return error?.status === 409 && /This Bot runs on the server/.test(error.message);
}

export function decodeSendReceipt(data) {
    const delivery = data?.delivery;
    if ([1, 2, 3, 'ACCEPTED_BOX', 'ACCEPTED_TEMPORAL', 'DUPLICATE',
        'GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_BOX', 'GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_TEMPORAL',
        'GROK_BOT_USER_MESSAGE_DELIVERY_DUPLICATE'].includes(delivery)) return { accepted: true };
    if (delivery === 4 || String(delivery).endsWith('REFUSED')) {
        throw new Error('Server bot rejected the message: ' + (data.refusal?.failureCode || 'refused'));
    }
    throw new Error('Delivery unknown; check the desktop conversation before resending.');
}

export async function sendServerPrompt(body, signal) {
    if (signal?.aborted) throw new Error('Send cancelled before transmission');
    const credentials = loadGrokBotAppCredentials();
    if (!credentials || grokBotActiveAccountKey() !== credentials.accountKey) {
        throw new Error('No matching active Grok Bot account for server send');
    }
    const base = assertAllowedCredentialUrl(process.env.CURSOR_API_BASE_URL || 'https://api2.cursor.sh', { kind: 'backend' });
    const headers = ensureSandboxHeaders(credentials.accessToken);
    if (credentials.teamId !== undefined) headers['x-cursor-team-id'] = credentials.teamId;
    if (signal?.aborted) throw new Error('Send cancelled before transmission');
    // Preserve the nonce from the explicitly rejected gateway submission.
    // Never automatically retry this request or treat an ambiguous receipt as success.
    const response = await fetch(base.replace(/\/$/, '') + '/aiserver.v1.GrokBotService/SendGrokBotUserMessage', {
        method: 'POST', redirect: 'error', headers, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ agentId: body.agentId, messageId: body.clientNonce,
            text: body.prompt, sentAtMs: String(Date.now()),
            ...(body.attachmentPaths?.length ? {attachmentPaths:body.attachmentPaths,attachmentNames:body.attachmentNames} : {}),
            ...(body.replyToId ? { replyToId: body.replyToId } : {}) }),
    });
    if (!response.ok) throw new Error(`Server bot send failed: HTTP ${response.status}; check conversation before resending.`);
    return decodeSendReceipt(await response.json());
}

export async function backendCall(method, body, signal) {
    const credentials = loadGrokBotAppCredentials();
    if (!credentials || grokBotActiveAccountKey() !== credentials.accountKey) throw new Error('Active account unavailable');
    const base = assertAllowedCredentialUrl(process.env.CURSOR_API_BASE_URL || 'https://api2.cursor.sh', {kind:'backend'});
    const headers = ensureSandboxHeaders(credentials.accessToken);
    if (credentials.teamId !== undefined) headers['x-cursor-team-id'] = credentials.teamId;
    const response = await fetch(base.replace(/\/$/,'')+'/aiserver.v1.GrokBotService/'+method, {
        method:'POST',redirect:'error',headers,body:JSON.stringify(body),
        signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    });
    if(!response.ok) throw new Error(method+' failed: HTTP '+response.status);
    return response.json();
}
