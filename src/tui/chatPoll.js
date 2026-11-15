import { POLL_TRANSCRIPT_LIMIT } from "../client/types.js";
import { shouldPollTranscript } from "./poll.js";
/** True when this poll did not race with a local transcript update. */
export function shouldApplyPollTranscript(input) {
    return (input.snapshot.transcriptFetched &&
        input.snapshot.history != null &&
        input.transcriptRevisionAtStart === input.transcriptRevisionNow &&
        shouldPollTranscript(input.statusAtStart) &&
        shouldPollTranscript(input.statusNow));
}
/** Fetch the recent transcript tail for sync. Skips image hydrate. */
export async function pollTranscriptSnapshot(input) {
    if (!shouldPollTranscript(input.statusKind)) {
        return { transcriptFetched: false };
    }
    try {
        const fetched = await input.client.getTranscript(input.agentId, POLL_TRANSCRIPT_LIMIT, {
            hydrate: false,
        });
        if (!shouldPollTranscript(input.statusKind)) {
            return { transcriptFetched: false };
        }
        return { history: fetched, transcriptFetched: true };
    }
    catch {
        return { transcriptFetched: false };
    }
}
/** Fetch roster for isRunning / answering indicator. Slow on the gateway — call sparingly. */
export async function pollRosterSnapshot(input) {
    try {
        const roster = await input.client.listAgents();
        return { roster, rosterFetched: true };
    }
    catch {
        return { rosterFetched: false };
    }
}
/** One combined poll cycle (tests only — Chat uses separate cadences). */
export async function pollChatSnapshot(input) {
    const transcript = await pollTranscriptSnapshot(input);
    const roster = await pollRosterSnapshot({ client: input.client });
    return { ...transcript, ...roster };
}
