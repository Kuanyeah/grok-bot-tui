import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HOST_DOWN_MESSAGE, MISSING_AUTH_MESSAGE } from "./errors.js";
import { DEFAULT_TRANSCRIPT_LIMIT, HostClientError } from "./types.js";
export const ADA_ID = "11111111-1111-4111-8111-111111111111";
const BEA_ID = "22222222-2222-4222-8222-222222222222";
export const DEV_ID = "33333333-3333-4333-8333-333333333333";
export const CHIEF_ID = "44444444-4444-4444-8444-444444444444";
export const PROJECT_X_ID = "55555555-5555-4555-8555-555555555555";
/** Checked-in PNG so `npm start -- --mock` can draw a real picture in Ghostty. */
export function mockPhotoPath() {
    return fileURLToPath(new URL("../../fixtures/blue-swatch.png", import.meta.url));
}
function defaultTranscripts(agents) {
 const bot=agents.find(a=>a.id===ADA_ID)||agents[0];
 if(!bot)return {};
 return {...Object.fromEntries(agents.filter(a=>a.id!==bot.id).map(a=>[a.id,[{id:'welcome-'+a.id,role:'assistant',speaker:a.name,text:`Hi, I'm ${a.name}. This is an offline demo. Choose a topic and let's explore it together.`,timestampMs:1}]])),[bot.id]:[
  {id:'demo-1',role:'user',speaker:'you',text:"Help me plan a relaxing Sunday afternoon.",timestampMs:1},
  {id:'demo-2',role:'assistant',speaker:bot.name,text:"Let's keep it simple:\n\n1. Take a short walk somewhere green.\n2. Stop for coffee and bring a book.\n3. Leave an hour free, with nothing planned.",timestampMs:2},
  {id:'demo-3',role:'user',speaker:'you',text:"That sounds good. What if it rains?",timestampMs:3},
  {id:'demo-4',role:'assistant',speaker:bot.name,text:"Swap the walk for a small museum or a quiet bookstore. Keep the coffee, the book, and the unplanned hour.\n\nThe goal is to feel rested, not to finish a checklist.",timestampMs:4},
  {id:'demo-5',role:'user',speaker:'you',text:"Perfect. A bookstore and coffee it is.",reactions:[{emoji:'👍',by:'Ada'}],timestampMs:5},
  {id:'demo-6',role:'assistant',speaker:bot.name,text:"Enjoy your slow afternoon! ☕",timestampMs:6}

 ]};
}
const DEFAULT_AGENTS = [
    {id:'demo-atlas',name:'Atlas',isGroup:false},
    {id:'demo-nova',name:'Nova',isGroup:false},
    {id:'demo-pixel',name:'Pixel',isGroup:false},
    {id:'demo-scout',name:'Scout',isGroup:false},
    {id:'demo-echo',name:'Echo',isGroup:false},
    {id:'demo-sage',name:'Sage',isGroup:false},

    { id: ADA_ID, name: "Ada", isGroup: false },
    { id: BEA_ID, name: "Bea", isGroup: false },
    { id: DEV_ID, name: "Dev", isGroup: false },
    { id: CHIEF_ID, name: "Chief of Staff", isGroup: false },
    {
        id: PROJECT_X_ID,
        name: "project X",
        isGroup: true,
        memberIds: [DEV_ID, CHIEF_ID],
        members: [
            { id: DEV_ID, name: "Dev" },
            { id: CHIEF_ID, name: "Chief of Staff" },
        ],
    },
];
function cloneAgent(agent) {
    return {
        ...agent,
        ...(agent.memberIds ? { memberIds: [...agent.memberIds] } : {}),
        ...(agent.members ? { members: agent.members.map((member) => ({ ...member })) } : {}),
    };
}
function cloneTurns(turns) {
    return turns.map((turn) => ({
        ...turn,
        ...(turn.images ? { images: turn.images.map((image) => ({ ...image })) } : {}),
    }));
}
function groupMembers(agent) {
    if (agent.members && agent.members.length > 0)
        return agent.members;
    return (agent.memberIds ?? []).map((id) => ({ id, name: id }));
}
export class MockHostClient {
    source = "mock";
    #agents;
    #transcripts;
    #replyDelayMs;
    #replyFor;
    #missingAuth;
    #hostDown;
    #seq = 0;
    constructor(options = {}) {
        this.#agents = (options.agents ?? DEFAULT_AGENTS).map(cloneAgent);
        this.#transcripts = new Map();
        const seeded = options.transcripts ?? defaultTranscripts(this.#agents);
        for (const agent of this.#agents) {
            this.#transcripts.set(agent.id, cloneTurns(seeded[agent.id] ?? []));
        }
        this.#replyDelayMs = options.replyDelayMs ?? 40;
        this.#replyFor =
            options.replyFor ??
                ((prompt, agent) => `${agent.name} here. I received: ${prompt}`);
        this.#missingAuth = options.missingAuth === true;
        this.#hostDown = options.hostDown === true;
    }
    #guard() {
        if (this.#missingAuth) {
            throw new HostClientError("missing-auth", MISSING_AUTH_MESSAGE);
        }
        if (this.#hostDown) {
            throw new HostClientError("host-down", HOST_DOWN_MESSAGE);
        }
    }
    async listAgents() {
        this.#guard();
        return this.#agents.map(cloneAgent);
    }
    async getTranscript(agentId, limit = DEFAULT_TRANSCRIPT_LIMIT, _options = {}) {
        this.#guard();
        const turns = this.#transcripts.get(agentId) ?? [];
        return cloneTurns(turns.slice(-limit));
    }
    async hydrateTranscript(_agentId, turns) {
        this.#guard();
        return cloneTurns(turns);
    }
    /** Simulate a bot starting or finishing a run from the Grok Bot app. */
    setRunning(agentId, running) {
        this.#guard();
        const agent = this.#agents.find((row) => row.id === agentId || row.name === agentId);
        if (agent)
            agent.isRunning = running;
    }
    appendTurn(agentId, turn) {
        this.#guard();
        const agent = this.#agents.find((row) => row.id === agentId || row.name === agentId);
        const id = agent?.id ?? agentId;
        const existing = this.#transcripts.get(id) ?? [];
        existing.push({ ...turn });
        this.#transcripts.set(id, existing);
    }
    #pushAssistant(agent, speaker, text) {
        const existing = this.#transcripts.get(agent.id) ?? [];
        existing.push({
            id: `mock-bot-${++this.#seq}`,
            role: "assistant",
            speaker: speaker.name,
            speakerId: speaker.id,
            text,
            timestampMs: Date.now(),
        });
        this.#transcripts.set(agent.id, existing);
    }
    #scheduleGroupReplies(agent, prompt) {
        const members = groupMembers(agent);
        for (const member of members) {
            const row = this.#agents.find((item) => item.id === member.id);
            if (row)
                row.isRunning = true;
        }
        void (async () => {
            try {
                await delay(this.#replyDelayMs);
            }
            catch {
                return;
            }
            for (const member of members) {
                const row = this.#agents.find((item) => item.id === member.id);
                if (row)
                    row.isRunning = false;
                this.#pushAssistant(agent, member, `${member.name} here. I received: ${prompt}`);
            }
        })();
    }
    async sendPrompt(input) {
        this.#guard();
        const agent = this.#agents.find((row) => row.id === input.agentId || row.name === input.agentId);
        if (!agent) {
            throw new HostClientError("unknown", `No agent named "${input.agentId}".`);
        }
        const startedAt = Date.now();
        const userTurn = {
            id: `mock-user-${++this.#seq}`,
            role: "user",
            speaker: "you",
            text: input.prompt,
            timestampMs: Date.now(),
        };
        const existing = this.#transcripts.get(agent.id) ?? [];
        existing.push(userTurn);
        this.#transcripts.set(agent.id, existing);
        agent.isRunning = true;
        if (input.wait === false) {
            agent.isRunning = false;
            if (agent.isGroup)
                this.#scheduleGroupReplies(agent, input.prompt);
            return { accepted: true, status: "idle", elapsedMs: Date.now() - startedAt };
        }
        try {
            await delay(this.#replyDelayMs, undefined, { signal: input.signal });
        }
        catch {
            agent.isRunning = false;
            return { accepted: true, status: "cancelled", elapsedMs: Date.now() - startedAt };
        }
        if (agent.isGroup) {
            const members = groupMembers(agent);
            let reply = "";
            for (const member of members) {
                reply = `${member.name} here. I received: ${input.prompt}`;
                this.#pushAssistant(agent, member, reply);
            }
            agent.isRunning = false;
            return {
                accepted: true,
                status: "idle",
                reply,
                elapsedMs: Date.now() - startedAt,
            };
        }
        const reply = this.#replyFor(input.prompt, agent);
        this.#pushAssistant(agent, { id: agent.id, name: agent.name }, reply);
        agent.isRunning = false;
        return {
            accepted: true,
            status: "idle",
            reply,
            elapsedMs: Date.now() - startedAt,
        };
    }
    async interrupt(agentId) {
        this.#guard();
        const agent = this.#agents.find((row) => row.id === agentId || row.name === agentId);
        const had = agent?.isRunning === true;
        if (agent)
            agent.isRunning = false;
        return { hadActiveRun: had };
    }
}
