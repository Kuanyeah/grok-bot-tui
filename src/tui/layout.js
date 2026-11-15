import stringWidth from 'string-width';
import { userBubble, wrapCells } from './bubbles.js';
import { MIN_COMPOSE_INNER } from "./compose.js";
import { IMAGE_CELL_ROWS, IMAGE_CELL_COLS, imagePlaceholder, imagesFromText, localImagePath, mergeImages, pictureKey } from "./images.js";
export function turnAlign(role) {
    return role === "user" ? "end" : "start";
}
/** Both user and assistant wrap to this fraction of the transcript pane. */
export const MESSAGE_WRAP_RATIO = 0.9;
/** Wrap width = 90% of the pane. User turns are then shifted as a block (see alignBlockEnd). */
export function wrapWidth(paneWidth) {
    return Math.max(1, Math.floor(Math.max(0, paneWidth) * MESSAGE_WRAP_RATIO));
}
/**
 * iMessage-style user block: every line keeps its own left edge, and the
 * block as a whole is shifted so the longest line meets `width`.
 */
export function alignBlockEnd(lines, width) {
    if (width < 1 || lines.length === 0)
        return lines;
    let longest = 0;
    for (const line of lines) {
        if (line.length > longest)
            longest = line.length;
    }
    const pad = Math.max(0, width - longest);
    if (pad === 0)
        return lines;
    const prefix = " ".repeat(pad);
    return lines.map((line) => prefix + line);
}
/** Word-wrap a single paragraph; hard-break tokens longer than width. */
export function wrapLine(line, width) { return wrapCells(line, width); }
export function wrapText(text, width) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const paragraphs = normalized.split("\n");
    const lines = [];
    for (const paragraph of paragraphs) {
        lines.push(...wrapLine(paragraph, width));
    }
    return lines.length > 0 ? lines : [""];
}
function normalizeSpeaker(speaker) {
    return speaker.trim().toLowerCase().replace(/_/g, "-");
}
function isChatDeliverySpeaker(speaker) {
    const n = normalizeSpeaker(speaker);
    return n === "send-message" || n === "sendmessage";
}
/** Tool rows such as `thinking` — not the visible SendMessage chat. */
function isNonChatToolSpeaker(speaker) {
    const n = normalizeSpeaker(speaker);
    if (!n || isChatDeliverySpeaker(speaker))
        return false;
    if (n === "user" || n === "you" || n === "assistant" || n === "bot" || n === "system" || n === "agent") {
        return false;
    }
    return n === "thinking" || n.includes("-");
}
export function isVisibleChatTurn(turn) {
    if ((turn.images?.length ?? 0) > 0)
        return true;
    if (turn.role === "user")
        return true;
    if (isNonChatToolSpeaker(turn.speaker) && turn.text.trim().length === 0)
        return false;
    return true;
}
function asSpeakerContext(agentNameOrCtx) {
    return typeof agentNameOrCtx === "string" ? { agentName: agentNameOrCtx } : agentNameOrCtx;
}
function lookupMemberName(idOrName, ctx) {
    const needle = idOrName.trim().toLowerCase();
    if (!needle)
        return undefined;
    const pools = [...(ctx.members ?? []), ...(ctx.roster ?? [])];
    const byId = pools.find((row) => row.id.toLowerCase() === needle);
    if (byId?.name.trim())
        return byId.name.trim();
    const byName = pools.find((row) => row.name.trim().toLowerCase() === needle);
    if (byName?.name.trim())
        return byName.name.trim();
    return undefined;
}
/** 1:1 chats use the selected bot name. Rooms use the member who spoke, never the room title. */
export function speakerLabel(turn, agentNameOrCtx) {
    if (turn.role === "user")
        return "you";
    const ctx = asSpeakerContext(agentNameOrCtx);
    if (ctx.isGroup) {
        const fromId = turn.speakerId ? lookupMemberName(turn.speakerId, ctx) : undefined;
        if (fromId)
            return fromId;
        const fromSpeaker = lookupMemberName(turn.speaker, ctx);
        if (fromSpeaker)
            return fromSpeaker;
        if (isChatDeliverySpeaker(turn.speaker) || turn.speaker === "assistant" || turn.speaker === "unknown") {
            return "bot";
        }
        const leftover = turn.speaker.trim();
        return leftover.length > 0 ? leftover : "bot";
    }
    const name = ctx.agentName.trim();
    return name.length > 0 ? name : "bot";
}
/** Named Ink colors for channel speaker headers. Skips cyan (your messages), white (body), yellow (images), and gray (too dim for names). */
export const SPEAKER_COLORS = [
    "green",
    "magenta",
    "blue",
    "red",
    "greenBright",
    "magentaBright",
    "blueBright",
    "redBright",
];
/** Stable color per display name so the same member stays the same hue in a channel. */
export function speakerColor(name) {
    const n = name.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
        hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
    }
    return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
}
/**
 * Blank rows after a turn, before the next visible turn.
 * 1:1 user↔assistant is two; rooms opposite-side is one; consecutive
 * assistant is one; consecutive user is none. Last turn has no trailing empty.
 */
export function gapAfterTurn(current, next, isGroup) {
    if (next == null)
        return 0;
    if (next === current)
        return current === "assistant" ? 1 : 0;
    return isGroup ? 1 : 2;
}
export function turnsToRows(turns, width, agentNameOrCtx) {
    const paneWidth = Math.max(1, width);
    const bodyWidth = wrapWidth(paneWidth);
    const ctx = asSpeakerContext(agentNameOrCtx);
    const visible = turns.filter(isVisibleChatTurn);
    const rows = [];
    for (let i = 0; i < visible.length; i++) {
        const turn = visible[i];
        const align = turnAlign(turn.role);
        const pending = [];
        if (ctx.isGroup === true && turn.role !== "user") {
            pending.push({
                kind: "speaker",
                text: speakerLabel(turn, ctx),
                role: turn.role,
                align,
            });
        }
        const extracted = imagesFromText(turn.text);
        const images = mergeImages(turn.images ?? [], extracted.images);
        const bodyText = images.length ? extracted.text.replace(/\[Image #\d+\]/g, '').trim() : extracted.text;
        const perStrip = Math.max(1, Math.floor((paneWidth + 1) / (IMAGE_CELL_COLS + 1)));
        for (let index = 0; index < images.length; index += perStrip) {
            const strip = images.slice(index, index + perStrip);
            for (let slot = 0; slot < IMAGE_CELL_ROWS; slot++) {
                pending.push({kind:'picture', text:strip.map((_,i)=>`Image #${index+i+1}`).join('  '),
                    role:turn.role, align, images:strip, image:strip[0],
                    imageIndex:index, pictureId:pictureKey(turn.id,index), pictureSlot:slot});
            }
        }
        if (bodyText.trim().length > 0) {
            for (const line of (turn.role === "user" ? userBubble(bodyText, paneWidth) : wrapText(bodyText, bodyWidth))) {
                pending.push({
                    kind: "body",
                    text: line,
                    role: turn.role,
                    align,
                });
            }
        }
        if (align === "end" && !bodyText.trim()) {
            const padded = alignBlockEnd(pending.map((row) => row.text), paneWidth);
            for (let j = 0; j < pending.length; j++) {
                const row = pending[j];
                const text = padded[j];
                if (row && text != null)
                    pending[j] = { ...row, text };
            }
        }
        if (turn.reactions?.length) {
            const reactionText = [...new Set(turn.reactions.map(r => r.emoji))].join(' ');
            const inset = align === 'end' ? Math.max(0, paneWidth - stringWidth(reactionText)) : 0;
            pending.push({kind:'reaction', text:' '.repeat(inset) + reactionText, role:'assistant', align});
        }
        rows.push(...pending);
        const next = visible[i + 1];
        const gap = gapAfterTurn(turn.role, next?.role, ctx.isGroup === true);
        for (let g = 0; g < gap; g++) {
            rows.push({ kind: "empty", text: "", role: turn.role, align });
        }
    }
    return rows;
}
export function maxScrollOffset(rowCount, budget) {
    return Math.max(0, rowCount - Math.max(1, budget));
}
export function clampScrollOffset(offset, rowCount, budget) {
    const max = maxScrollOffset(rowCount, budget);
    if (!Number.isFinite(offset) || offset <= 0)
        return 0;
    return Math.min(Math.floor(offset), max);
}
/** Shift offset by `delta` lines (positive = older / up). Clamped to 0..max. */
export function applyScrollDelta(offset, delta, rowCount, budget) {
    return clampScrollOffset(offset + delta, rowCount, budget);
}
/**
 * Offset is lines from the bottom. 0 means pinned to latest.
 * When new rows append and the user is scrolled up, grow the offset so the
 * same history stays on screen (idle poll must not yank to the bottom).
 */
export function adjustScrollOffset(input) {
    if (input.offset <= 0)
        return 0;
    const grown = Math.max(0, input.nextRowCount - input.prevRowCount);
    return clampScrollOffset(input.offset + grown, input.nextRowCount, input.budget);
}
/** Clip to a wrapped-line budget. offset is how many rows above the bottom to shift. */
export function visibleTranscript(rows, budget, offsetFromBottom = 0) {
    if (budget <= 0) {
        return { rows: [], clipped: rows.length > 0, moreBelow: false, offset: 0, maxOffset: 0, pinned: true };
    }
    if (rows.length <= budget) {
        return { rows, clipped: false, moreBelow: false, offset: 0, maxOffset: 0, pinned: true };
    }
    const maxOffset = maxScrollOffset(rows.length, budget);
    const offset = clampScrollOffset(offsetFromBottom, rows.length, budget);
    const end = rows.length - offset;
    const moreBelow = end < rows.length;
    const moreAbove = end - budget > 0;
    let take = budget;
    if (moreAbove)
        take -= 1;
    if (moreBelow && take > 1)
        take -= 1;
    const start = Math.max(0, end - take);
    return {
        rows: rows.slice(start, end),
        clipped: start > 0,
        moreBelow,
        offset,
        maxOffset,
        pinned: offset === 0,
    };
}
export function shortIdPrefix(id) {
    const compact = id.replace(/-/g, "");
    return compact.slice(0, 6);
}
export function agentLabel(agent, roster) {
    const name = agent.name.trim() || "agent";
    const dup = roster.filter((row) => row.name.trim().toLowerCase() === name.toLowerCase()).length > 1;
    if (!dup)
        return name;
    return `${name} · ${shortIdPrefix(agent.id)}`;
}
/** True when `start` is a complete reserved picture block (safe for Kitty). */
export function isFullPictureRun(rows, start, height = IMAGE_CELL_ROWS) {
    const lead = rows[start];
    if (lead?.kind !== "picture" || lead.pictureSlot !== 0 || !lead.pictureId)
        return false;
    if (start + height > rows.length)
        return false;
    for (let i = 0; i < height; i++) {
        const row = rows[start + i];
        if (row?.kind !== "picture" || row.pictureId !== lead.pictureId || row.pictureSlot !== i) {
            return false;
        }
    }
    return true;
}
/** Blank row inside the transcript frame, above the bottom border. */
export const TRANSCRIPT_PAD_BOTTOM = 1;
/** Pin transcript children to the bottom of the fixed-height pane. */
export const TRANSCRIPT_JUSTIFY = "flex-end";
/** No pad under a visible answering line so it sits on the transcript border. */
export function transcriptPadBottom(answering) {
    return answering ? 0 : TRANSCRIPT_PAD_BOTTOM;
}
export function chromeRows(composeInner = MIN_COMPOSE_INNER) {
    const inner = Math.max(MIN_COMPOSE_INNER, composeInner);
    // header box (3) + compose box (border 2 + inner lines) + footer (1)
    return 3 + (2 + inner) + 1;
}
export function transcriptInnerHeight(terminalRows, composeInner = MIN_COMPOSE_INNER, padBottom = TRANSCRIPT_PAD_BOTTOM) {
    const outer = Math.max(4, terminalRows - chromeRows(composeInner));
    return Math.max(1, outer - 2 - Math.max(0, padBottom));
}
export function innerWidth(terminalColumns, paddingX = 1) {
    return Math.max(8, terminalColumns - 2 - paddingX * 2);
}
