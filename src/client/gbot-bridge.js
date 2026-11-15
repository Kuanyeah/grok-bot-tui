import { connectGateway, gatewayCall } from './vendor/gbot/gateway.js';
import { isServerBotRefusal, sendServerPrompt } from './server-send.js';
import { uploadImages } from './upload-images.js';

// Keep the original TUI's transcript, polling, send and interrupt behavior.
// Delegate gateway transport and route recovery to the pinned gbot client.
export function createBridgeFetch(session, call = gatewayCall, serverSend = sendServerPrompt) {
    const prefix = session.gatewayUrl.replace(/\/$/, '') + '/api/';
    return async (input, init = {}) => {
        const url = String(input);
        if (!url.startsWith(prefix) || init.method !== 'POST') {
            throw new Error('Unexpected request outside the Grok gateway API');
        }
        const method = url.slice(prefix.length);
        if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(method)) {
            throw new Error('Invalid Grok gateway method');
        }
        const body = JSON.parse(init.body || '{}');
        let data;
        try {
            data = await call(session, method, body, { signal: init.signal });
        } catch (error) {
            if (method !== 'sendPrompt' || !isServerBotRefusal(error)) throw error;
            data = await serverSend(body, init.signal);
        }
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };
}

export async function openGbotHostClient() {
    const { HttpHostClient } = await import('./host.js');
    const session = await connectGateway();
    const client = new HttpHostClient({
        gatewayUrl: session.gatewayUrl,
        token: session.gatewayToken,
        headers: session.gatewayHeaders,
        source: 'desktop',
        fetch: createBridgeFetch(session),
    });
    const send = client.sendPrompt.bind(client);
    client.sendPrompt = async input => {
        const attachments = input.images?.length ? await uploadImages(input.agentId,input.images,input.signal) : {};
        return send({...input,...attachments});
    };
    return client;
}
