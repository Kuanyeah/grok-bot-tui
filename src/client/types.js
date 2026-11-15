export const DEFAULT_TRANSCRIPT_LIMIT = 500;
/** Poll only needs the recent tail for sync; keep gateway payloads small. */
export const POLL_TRANSCRIPT_LIMIT = 100;
export class HostClientError extends Error {
    kind;
    status;
    constructor(kind, message, options) {
        super(message);
        this.name = "HostClientError";
        this.kind = kind;
        if (options?.status != null)
            this.status = options.status;
    }
}
