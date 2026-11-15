import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeFetch } from '../src/client/gbot-bridge.js';

test('forwards API payload and cancellation while retaining a refreshed session', async () => {
    const session = { gatewayUrl: 'https://fixture.cursorvm.com/route', gatewayToken: 'fixture' };
    const controller = new AbortController();
    const calls = [];
    const fetch = createBridgeFetch(session, async (...args) => {
        calls.push(args);
        session.gatewayUrl = 'https://fresh.cursorvm.com/route';
        return { agents: [{ id: 'fixture', name: 'Fixture' }] };
    });
    const response = await fetch('https://fixture.cursorvm.com/route/api/listAgents', {
        method: 'POST', body: '{}', signal: controller.signal,
    });
    assert.equal((await response.json()).agents[0].name, 'Fixture');
    assert.equal(calls[0][0], session);
    assert.equal(calls[0][1], 'listAgents');
    assert.equal(calls[0][3].signal, controller.signal);
    await fetch('https://fixture.cursorvm.com/route/api/getAgentTranscriptTail', {
        method: 'POST', body: '{"id":"fixture","limit":10}',
    });
    assert.equal(calls[1][0].gatewayUrl, 'https://fresh.cursorvm.com/route');
    assert.deepEqual(calls[1][2], { id: 'fixture', limit: 10 });
});

test('rejects unrelated destinations and does not retry uncertain sends', async () => {
    let calls = 0;
    const fetch = createBridgeFetch({ gatewayUrl: 'https://fixture.cursorvm.com' }, async () => {
        calls++;
        throw new Error('receipt unknown');
    });
    await assert.rejects(fetch('https://other.example/api/sendPrompt', { method: 'POST' }));
    assert.equal(calls, 0);
    await assert.rejects(fetch('https://fixture.cursorvm.com/api/sendPrompt', {
        method: 'POST', body: '{"prompt":"fixture"}',
    }), /receipt unknown/);
    assert.equal(calls, 1);
});

test('only explicit server-bot rejection uses backend and preserves nonce', async () => {
    const body = {agentId:'fixture',prompt:'fixture',clientNonce:'unique-fixture'};
    let sends = 0;
    const fetch = createBridgeFetch({gatewayUrl:'https://fixture.cursorvm.com'}, async () => {
        throw Object.assign(new Error('This Bot runs on the server'), {status:409});
    }, async (received) => {
        sends++;
        assert.deepEqual(received, body);
        return {accepted:true};
    });
    const response = await fetch('https://fixture.cursorvm.com/api/sendPrompt', {method:'POST',body:JSON.stringify(body)});
    assert.equal((await response.json()).accepted,true);
    assert.equal(sends,1);
});
