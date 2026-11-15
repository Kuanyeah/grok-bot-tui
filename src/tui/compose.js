import {wrapInput,stringWidth} from './input-editing.js';
import { isCtrlKey } from "./keys.js";
export const MIN_COMPOSE_INNER = 1;
export const MAX_COMPOSE_INNER = 5;
export const FOOTER_HINT = "Enter send  ·  ← lobby (empty input)  ·  Ctrl+c quit";
export function clampCaret(caret, length) {
    if (!Number.isFinite(caret) || caret <= 0)
        return 0;
    return Math.min(Math.floor(caret), Math.max(0, length));
}
export function insertAt(text, caret, chunk) {
    const c = clampCaret(caret, text.length);
    if (!chunk)
        return { text, caret: c };
    return { text: text.slice(0, c) + chunk + text.slice(c), caret: c + chunk.length };
}
export function deleteBackward(text, caret) {
    const c = clampCaret(caret, text.length);
    if (c <= 0)
        return { text, caret: 0 };
    return { text: text.slice(0, c - 1) + text.slice(c), caret: c - 1 };
}
export function deleteForward(text, caret) {
    const c = clampCaret(caret, text.length);
    if (c >= text.length)
        return { text, caret: c };
    return { text: text.slice(0, c) + text.slice(c + 1), caret: c };
}
export function moveCaret(caret, length, delta) {
    return clampCaret(caret + delta, length);
}
/** Word-wrap one paragraph; hard-break only a token longer than `width`. */
const wrapParagraph = wrapInput;
function visualLines(text, width) {
    const w = Math.max(1, width);
    const out = [];
    let offset = 0;
    const parts = text.split("\n");
    for (let p = 0; p < parts.length; p++) {
        const para = parts[p] ?? "";
        out.push(...wrapParagraph(para, offset, w));
        offset += para.length + (p < parts.length - 1 ? 1 : 0);
    }
    if (out.length === 0)
        out.push({ text: "", start: 0 });
    const last = out[out.length - 1];
    if (last &&
        stringWidth(last.text) === w &&
        text.length > 0 &&
        text[text.length - 1] !== "\n") {
        out.push({ text: "", start: text.length });
    }
    return out;
}
/**
 * Word-wrap `text` to `width` and map `caret` onto a line/column.
 * A caret sitting exactly on a wrap boundary (or a skipped wrap space / newline)
 * is shown at col 0 of the next line so the inverse cell stays inside the box.
 */
export function layoutCompose(text, caret, width) {
    const w = Math.max(1, width);
    const c = clampCaret(caret, text.length);
    const vis = visualLines(text, w);
    const lines = vis.map((row) => row.text);
    const starts = vis.map((row) => row.start);
    let line = vis.length - 1;
    let col = vis[line]?.text.length ?? 0;
    for (let r = 0; r < vis.length; r++) {
        const row = vis[r];
        if (!row)
            continue;
        const lineEnd = row.start + row.text.length;
        if (c < row.start) {
            line = r;
            col = 0;
            break;
        }
        if (c <= lineEnd) {
            line = r;
            col = c - row.start;
            if (stringWidth(row.text.slice(0,col)) === w && r + 1 < vis.length) {
                line = r + 1;
                col = 0;
            }
            break;
        }
    }
    return { lines, starts, line, col };
}
export function caretFromLineCol(layout, line, col, textLength) {
    if (layout.lines.length === 0)
        return 0;
    const r = Math.min(Math.max(0, line), layout.lines.length - 1);
    const row = layout.lines[r] ?? "";
    const start = layout.starts[r] ?? 0;
    const c = start + clampCaret(col, row.length);
    return clampCaret(c, textLength);
}
export function lineStartCaret(layout) {
    return layout.starts[layout.line] ?? 0;
}
export function lineEndCaret(layout, textLength) {
    const row = layout.lines[layout.line] ?? "";
    const start = layout.starts[layout.line] ?? 0;
    return clampCaret(start + row.length, textLength);
}
/**
 * Move the caret up/down among visual/hard compose lines.
 * Returns null when the draft is a single visual line (caller may scroll the transcript).
 */
export function moveCaretVertical(text, caret, width, dir) {
    const laid = layoutCompose(text, caret, width);
    if (laid.lines.length <= 1)
        return null;
    const nextLine = laid.line + dir;
    if (nextLine < 0 || nextLine >= laid.lines.length)
        return caret;
    const nextRow = laid.lines[nextLine] ?? "";
    return caretFromLineCol(laid, nextLine, Math.min(laid.col, nextRow.length), text.length);
}
export function composeInnerHeight(lineCount) {
    return Math.min(MAX_COMPOSE_INNER, Math.max(MIN_COMPOSE_INNER, lineCount));
}
export function visibleComposeWindow(lines, caretLine, inner) {
    const cap = Math.max(1, inner);
    if (lines.length <= cap)
        return { lines, line: caretLine };
    const maxStart = Math.max(0, lines.length - cap);
    const start = Math.min(Math.max(0, caretLine - cap + 1), maxStart);
    return { lines: lines.slice(start, start + cap), line: caretLine - start };
}
/** Split a wrapped compose line so the inverse cell sits on `col`. */
export function splitLineAtCaret(line, col) {
    const i = clampCaret(col, line.length);
    if (i >= line.length)
        return { before: line, cell: " ", after: "" };
    return { before: line.slice(0, i), cell: line.slice(i, i + 1), after: line.slice(i + 1) };
}
function isCommand(key) {
    return key.super === true;
}
/**
 * Compose-box keys. Mention-menu ↑↓/Enter are handled by the caller first.
 * Home/End are not handled here (they still scroll history).
 *
 * `input` is the Ink `useInput` string: needed for Ctrl+J and for terminals
 * that report Shift+Enter as `"\n"` with `key.return` false.
 */
export function handleComposeKey(key, draft, width, input = "") {
    const laid = layoutCompose(draft.text, draft.caret, width);
    if (isCommand(key) && (key.backspace || key.delete)) {
        return { type: "set", draft: { text: "", caret: 0 } };
    }
    if (isCommand(key) && key.leftArrow) {
        return { type: "set", draft: { text: draft.text, caret: lineStartCaret(laid) } };
    }
    if (isCommand(key) && key.rightArrow) {
        return { type: "set", draft: { text: draft.text, caret: lineEndCaret(laid, draft.text.length) } };
    }
    if (key.upArrow && !key.ctrl && !isCommand(key)) {
        const next = moveCaretVertical(draft.text, draft.caret, width, -1);
        if (next == null)
            return { type: "scrollTranscript", dir: "up" };
        return { type: "set", draft: { text: draft.text, caret: next } };
    }
    if (key.downArrow && !key.ctrl && !isCommand(key)) {
        const next = moveCaretVertical(draft.text, draft.caret, width, 1);
        if (next == null)
            return { type: "scrollTranscript", dir: "down" };
        return { type: "set", draft: { text: draft.text, caret: next } };
    }
    if (key.leftArrow && !key.ctrl && !isCommand(key)) {
        return { type: "set", draft: { text: draft.text, caret: moveCaret(draft.caret, draft.text.length, -1) } };
    }
    if (key.rightArrow && !key.ctrl && !isCommand(key)) {
        return { type: "set", draft: { text: draft.text, caret: moveCaret(draft.caret, draft.text.length, 1) } };
    }
    const ctrlJ = isCtrlKey(input, key, "j") || (Boolean(key.ctrl) && input === "\n");
    const lineFeedWithoutReturn = input === "\n" && !key.return;
    if ((key.return && key.shift) || lineFeedWithoutReturn || ctrlJ) {
        return { type: "set", draft: insertAt(draft.text, draft.caret, "\n") };
    }
    if (key.ctrl && !key.shift && !key.leftArrow && !key.rightArrow && !key.upArrow && !key.downArrow) {
        return { type: "unhandled" };
    }
    if (key.return || input === "\r") {
        return { type: "send" };
    }
    if (key.backspace) {
        return { type: "set", draft: deleteBackward(draft.text, draft.caret) };
    }
    if (key.delete) {
        return { type: "set", draft: deleteForward(draft.text, draft.caret) };
    }
    return { type: "unhandled" };
}
