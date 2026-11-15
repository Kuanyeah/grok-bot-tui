import {rememberReplies} from './activity.js';
import {Avatar} from './Avatar.js';
import {editShortcut,stringWidth} from './input-editing.js';
import { leftReturnsToLobby } from './bubbles.js';
import { botColor, avatar } from './bot-colors.js';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useApp, useInput, useStdout, useWindowSize, useCursor, useBoxMetrics } from "ink";
import { setTimeout as delay } from "node:timers/promises";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HostClientError } from "../client/types.js";
import { errorMessage } from "../redact.js";
import { DEFAULT_ROSTER_POLL_MS } from "../timing.js";
import { composeInnerHeight, FOOTER_HINT, handleComposeKey, insertAt, layoutCompose, splitLineAtCaret, visibleComposeWindow, } from "./compose.js";
import { adjustScrollOffset, applyScrollDelta, chromeRows, innerWidth, isFullPictureRun, TRANSCRIPT_JUSTIFY, transcriptInnerHeight, transcriptPadBottom, turnsToRows, visibleTranscript, speakerColor, } from "./layout.js";
import { IMAGE_CELL_ROWS, imagePlaceholder, imagesFromText } from "./images.js";
import { Picture } from "./Picture.js";
import { consumeMouseInput, DISABLE_MOUSE, ENABLE_MOUSE, scrollDeltaForButton, WHEEL_LINE_DELTA, } from "./mouse.js";
import { completeMention, filterMentions, MAX_VISIBLE_MENTIONS, mentionMenuOpen, mentionNames, mentionQuery, visibleMentions, wrapMentionIndex, } from "./mentions.js";
import { isCtrlKey } from "./keys.js";
import { answeringIndicator, answeringMemberNames, busyNamesSignature, memberListLabel } from "./roster.js";
import { DEFAULT_POLL_MS, imageHydrateKey, mergeImagePathsFrom, mergePolledTranscript, transcriptNeedsImageHydrate, } from "./poll.js";
import { pollRosterSnapshot, pollTranscriptSnapshot, shouldApplyPollTranscript } from "./chatPoll.js";
const EMPTY_DRAFT = { text: "", caret: 0 };
/** Ink 7 has no TextInput that can share alt-screen + a mention overlay; own the caret. */
function printableChunk(input) {
    let out = "";
    for (const ch of input) {
        if (ch === "\n" || ch >= " ")
            out += ch;
    }
    return out;
}
function headerStatus(status, isGroup = false, answering = false) {
    switch (status.kind) {
        case "loading":
            return "loading";
        case "sending":
            return isGroup ? "sent" : "waiting";
        case "error":
            return "error";
        default:
            return answering ? "answering" : "idle";
    }
}
function termSize(columns, rows) {
    return {
        width: Math.max(40, columns || 80),
        height: Math.max(11, (rows || 24) - 1),
    };
}
function clippedPictureLabel(row, firstVisible) {
    if (!firstVisible)
        return " ";
    const text = row.text.trim();
    if (text)
        return row.text;
    return imagePlaceholder(row.image ?? {});
}
function renderTranscriptRows(rows, inner, themeColor) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row)
            continue;
        if (row.kind === "picture" && isFullPictureRun(rows, i)) {
            out.push(_jsx(Picture, { row: row, inner: inner }, row.pictureId ?? `pic-${i}`));
            i += IMAGE_CELL_ROWS - 1;
            continue;
        }
        if (row.kind === "picture") {
            const firstVisible = i === 0 || rows[i - 1]?.pictureId !== row.pictureId;
            out.push(_jsx(Text, { dimColor: true, color: "yellow", wrap: "truncate", children: clippedPictureLabel(row, firstVisible) }, `p-${row.pictureId ?? i}-${i}`));
            continue;
        }
        if (row.kind === "empty") {
            out.push(_jsx(Text, { children: " " }, `e-${i}`));
            continue;
        }
        const isUser = row.align === "end";
        const color = isUser
            ? themeColor
            : row.kind === "speaker"
                ? speakerColor(row.text)
                : row.kind === "image"
                    ? "yellow"
                    : "white";
        out.push(_jsx(Text, { bold: row.kind === "speaker", dimColor: row.kind === "image", color: color, wrap: "truncate", children: row.text }, `row-${i}`));
    }
    return out;
}
export function Chat({ client, agent, roster = [], timeoutMs, pollMs = DEFAULT_POLL_MS, onRoster, onSwitch, }) {
    const { exit } = useApp();
    const {setCursorPosition} = useCursor();
    const composeBoxRef = useRef(null);
    const composeBox = useBoxMetrics(composeBoxRef);
    const { stdout } = useStdout();
    const { columns, rows } = useWindowSize();
    const [turns, setTurns] = useState([]);
    const [attachments,setAttachments] = useState([]);
    const attachmentsRef=useRef(attachments);
    attachmentsRef.current=attachments;
    useEffect(()=>{if(turns.length)rememberReplies(agent.id,turns);},[agent.id,turns]);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [status, setStatus] = useState({ kind: "loading" });
    const [scrollOffset, setScrollOffset] = useState(0);
    const [liveRoster, setLiveRoster] = useState(roster);
    const [answeringLine, setAnsweringLine] = useState(() => answeringIndicator(answeringMemberNames(agent, roster, [])));
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionDismissed, setMentionDismissed] = useState(false);
    const [pollReady, setPollReady] = useState(false);
    const abortRef = useRef(null);
    const transcriptRevisionRef = useRef(0);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const statusRef = useRef(status);
    statusRef.current = status;
    const agentRef = useRef(agent);
    agentRef.current = agent;
    const turnsRef = useRef(turns);
    turnsRef.current = turns;
    const historyIndexRef = useRef(-1);
    const historyDraftRef = useRef(null);
    const stashRef = useRef(null);
    const recentSendRef = useRef(0);
    const busySigRef = useRef(busyNamesSignature(answeringMemberNames(agent, roster, [])));
    const agentId = agent.id;
    const themeColor = botColor(agentId);
    const liveAgent = liveRoster.find((row) => row.id === agentId) ?? agent;
    const displayName = liveAgent.name.trim() || "agent";
    const isGroup = liveAgent.isGroup === true;
    const labelCtx = useMemo(() => ({
        agentName: displayName,
        isGroup,
        members: liveAgent.members,
        roster: liveRoster,
    }), [displayName, isGroup, liveAgent.members, liveRoster]);
    const headerMembers = memberListLabel(liveAgent, liveRoster);
    const mentionOptions = useMemo(() => (isGroup ? mentionNames(liveAgent, liveRoster) : []), [isGroup, liveAgent, liveRoster]);
    const mentionQ = isGroup ? mentionQuery(draft.text, draft.caret) : null;
    const mentionMatches = mentionQ ? filterMentions(mentionOptions, mentionQ.prefix) : [];
    const mentionQueryKey = mentionQ ? `${mentionQ.start}:${mentionQ.prefix}` : "";
    const menuOpen = mentionMenuOpen(mentionMatches.length, mentionDismissed);
    const mentionShown = menuOpen ? visibleMentions(mentionMatches, mentionIndex) : [];
    const { width, height } = termSize(columns, rows);
    const inner = innerWidth(width);
    const composeLaid = layoutCompose(draft.text, draft.caret, inner - 2);
    const attachmentRows=0;
    const textInner=composeInnerHeight(composeLaid.lines.length);
    const composeInner = textInner+attachmentRows;
    const composeView = visibleComposeWindow(composeLaid.lines, composeLaid.line, textInner);
    const transcriptH = Math.max(3, height - chromeRows(composeInner) - 2);
    const padBottom = transcriptPadBottom(answeringLine != null);
    const lineBudget = Math.max(1, transcriptInnerHeight(height - 2, composeInner, padBottom) -
        (status.kind === "error" ? 1 : 0) -
        (answeringLine ? 1 : 0) -
        (menuOpen ? Math.min(mentionMatches.length, MAX_VISIBLE_MENTIONS) : 0));
    const allRows = useMemo(() => turnsToRows(turns, inner, labelCtx), [turns, inner, labelCtx]);
    const rowCount = allRows.length;
    const prevRowCountRef = useRef(rowCount);
    const syncAnsweringLine = useCallback((focus, nextRoster, nextTurns) => {
        const names = answeringMemberNames(focus, nextRoster, nextTurns);
        const sig = busyNamesSignature(names);
        if (sig === busySigRef.current)
            return;
        busySigRef.current = sig;
        setAnsweringLine(answeringIndicator(names));
    }, []);
    const hydrateGenRef = useRef(0);
    const hydrateInflightRef = useRef(false);
    const hydrateKeyRef = useRef("");
    const scheduleImageHydrate = useCallback((history) => {
        if (!client.hydrateTranscript || !transcriptNeedsImageHydrate(history)) return;
        const key = imageHydrateKey(history);
        if (hydrateInflightRef.current || hydrateKeyRef.current === key) return;
        hydrateInflightRef.current = true;
        hydrateKeyRef.current = key;
        const generation = hydrateGenRef.current;
        void client.hydrateTranscript(agentId, history).then(hydrated => {
            if (generation === hydrateGenRef.current)
                setTurns(current => mergeImagePathsFrom(hydrated, current));
        }).catch(() => {
            // Keep a stable label if a remote attachment cannot be downloaded.
        }).finally(() => {
            if (generation === hydrateGenRef.current) hydrateInflightRef.current = false;
        });
    }, [client, agentId]);
    useEffect(() => () => { hydrateGenRef.current += 1; }, [client, agentId]);
    const load = useCallback(async () => {
        transcriptRevisionRef.current += 1;
        const revision = transcriptRevisionRef.current;
        setPollReady(false);
        setStatus({ kind: "loading" });
        setScrollOffset(0);
        try {
            const history = await client.getTranscript(agentId, undefined, { hydrate: false });
            if (revision !== transcriptRevisionRef.current)
                return;
            setTurns(history);
            setStatus({ kind: "idle" });
            setPollReady(true);
            scheduleImageHydrate(history);
        }
        catch (err) {
            if (revision !== transcriptRevisionRef.current)
                return;
            const message = err instanceof HostClientError ? err.message : errorMessage(err);
            setStatus({ kind: "error", message });
            setPollReady(true);
        }
    }, [agentId, client, scheduleImageHydrate]);
    useEffect(() => {
        void load();
        return () => {
            abortRef.current?.abort();
        };
    }, [load]);
    useEffect(() => {
        stdout.write(ENABLE_MOUSE);
        return () => {
            stdout.write(DISABLE_MOUSE);
        };
    }, [stdout]);
    useEffect(() => {
        setScrollOffset((offset) => adjustScrollOffset({
            offset,
            prevRowCount: prevRowCountRef.current,
            nextRowCount: rowCount,
            budget: lineBudget,
        }));
        prevRowCountRef.current = rowCount;
    }, [rowCount, lineBudget]);
    useEffect(() => {
        setLiveRoster(roster);
        syncAnsweringLine(agent, roster, turnsRef.current);
    }, [agent, roster, syncAnsweringLine]);
    useEffect(() => {
        syncAnsweringLine(liveAgent, liveRoster, turns);
    }, [liveAgent, liveRoster, syncAnsweringLine, turns]);
    useEffect(() => {
        setMentionDismissed(false);
        setMentionIndex(0);
    }, [mentionQueryKey]);
    useEffect(() => {
        if (!pollReady)
            return;
        let cancelled = false;
        const loop = async () => {
            while (!cancelled) {
                const statusAtStart = statusRef.current.kind;
                const transcriptRevisionAtStart = transcriptRevisionRef.current;
                const snapshot = await pollTranscriptSnapshot({
                    client,
                    agentId,
                    statusKind: statusAtStart,
                });
                if (cancelled)
                    return;
                if (shouldApplyPollTranscript({
                    snapshot,
                    statusAtStart,
                    statusNow: statusRef.current.kind,
                    transcriptRevisionAtStart,
                    transcriptRevisionNow: transcriptRevisionRef.current,
                })) {
                    let merged;
                    setTurns((prev) => {
                        merged = mergePolledTranscript(prev, snapshot.history);
                        return merged;
                    });
                    if (merged)
                        scheduleImageHydrate(merged);
                }
                try {
                    await delay(Date.now() - recentSendRef.current < 60000 || busySigRef.current ? 500 : 2000);
                }
                catch {
                    return;
                }
            }
        };
        void loop();
        return () => {
            cancelled = true;
        };
    }, [agentId, client, pollMs, pollReady, scheduleImageHydrate]);
    useEffect(() => {
        if (!pollReady)
            return;
        let cancelled = false;
        const applyRoster = (nextRoster) => {
            setLiveRoster(previous => JSON.stringify(previous) === JSON.stringify(nextRoster) ? previous : nextRoster);
            syncAnsweringLine(agentRef.current, nextRoster, turnsRef.current);
            onRoster?.(nextRoster);
        };
        const loop = async () => {
            while (!cancelled) {
                const rosterSnap = await pollRosterSnapshot({ client });
                if (cancelled)
                    return;
                if (rosterSnap.rosterFetched && rosterSnap.roster) {
                    applyRoster(rosterSnap.roster);
                }
                try {
                    await delay(DEFAULT_ROSTER_POLL_MS);
                }
                catch {
                    return;
                }
            }
        };
        void loop();
        return () => {
            cancelled = true;
        };
    }, [client, onRoster, pollReady, syncAnsweringLine]);
    const send = useCallback(async (text) => {
        const prompt = text.trim();
        const images=attachmentsRef.current.filter(image=>!image.marker||text.includes(image.marker));
        if ((!prompt && !images.length) || statusRef.current.kind === "sending")
            return;
        transcriptRevisionRef.current += 1;
        const optimistic = {
            id: `local-${Date.now()}`,
            role: "user",
            speaker: "you",
            text: prompt,
            images,
            timestampMs: Date.now(),
        };
        setTurns((current) => [...current, optimistic]);
        setDraft(EMPTY_DRAFT);
        setAttachments([]);
        setScrollOffset(0);
        recentSendRef.current = Date.now();
        setStatus({ kind: "sending" });
        syncAnsweringLine(agentRef.current, liveRoster, [...turnsRef.current, optimistic]);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const result = await client.sendPrompt({
                agentId,
                prompt,
                images,
                wait: false,
                timeoutMs,
                signal: controller.signal,
            });
            if (result.status === "cancelled") {
                setStatus({ kind: "idle" });
                return;
            }
            setStatus({ kind: "idle" });
        }
        catch (err) {
            const message = err instanceof HostClientError ? err.message : errorMessage(err);
            setStatus({ kind: "error", message });
            setDraft({text:prompt,caret:prompt.length});
            setAttachments(images);
        }
        finally {
            abortRef.current = null;
        }
    }, [agent.name, agentId, client, isGroup, liveRoster, syncAnsweringLine, timeoutMs]);
    const page = Math.max(1, Math.floor(lineBudget / 2));
    useInput((input, key) => {
        if (isCtrlKey(input, key, "c")) {
            if(statusRef.current.kind === "sending") {abortRef.current?.abort();return;}
            if(draftRef.current.text || attachmentsRef.current.length) {setDraft(EMPTY_DRAFT);setAttachments([]);return;}
            exit();return;
        }
        if (isCtrlKey(input,key,"s")) {
            if(draftRef.current.text || attachmentsRef.current.length) {
                stashRef.current={draft:draftRef.current,attachments:attachmentsRef.current};
                setDraft(EMPTY_DRAFT);setAttachments([]);
            } else if(stashRef.current) {setDraft(stashRef.current.draft);setAttachments(stashRef.current.attachments);stashRef.current=null;}
            return;
        }
        const current = statusRef.current;
        if (isCtrlKey(input,key,"x")) {
            const last=attachmentsRef.current.at(-1);
            if(last?.marker)setDraft(value=>{const text=value.text.replace(last.marker,'');return {text,caret:Math.min(value.caret,text.length)};});
            setAttachments(items=>items.slice(0,-1));return;
        }

        const { events } = consumeMouseInput(input);
        if (events.length > 0) {
            for (const event of events) {
                if (event.release)
                    continue;
                const delta = scrollDeltaForButton(event.button);
                if (delta == null)
                    continue;
                setScrollOffset((offset) => applyScrollDelta(offset, delta, rowCount, lineBudget));
            }
            return;
        }
        if (menuOpen) {
            if (key.escape) {
                setMentionDismissed(true);
                return;
            }
            if (key.upArrow) {
                setMentionIndex((index) => wrapMentionIndex(index, mentionMatches.length, -1));
                return;
            }
            if (key.downArrow) {
                setMentionIndex((index) => wrapMentionIndex(index, mentionMatches.length, 1));
                return;
            }
            if (key.tab || (key.return && !key.shift)) {
                const pick = mentionMatches.length === 1 ? mentionMatches[0] : mentionMatches[mentionIndex] ?? mentionMatches[0];
                if (pick)
                    setDraft((value) => completeMention(value.text, pick, value.caret));
                return;
            }
        }
        if (key.tab)
            return;
        if (key.escape) {
            if (current.kind === "sending") {
                // Abort cancels the fetch and triggers interruptAgentRun immediately.
                abortRef.current?.abort();
                return;
            }
            onSwitch();
            return;
        }
        if (leftReturnsToLobby(key, draftRef.current) || isCtrlKey(input, key, "b")) {
            if (current.kind === "sending")
                abortRef.current?.abort();
            onSwitch();
            return;
        }
        if (key.pageUp) {
            setScrollOffset((offset) => applyScrollDelta(offset, page, rowCount, lineBudget));
            return;
        }
        if (key.pageDown || isCtrlKey(input, key, "d")) {
            setScrollOffset((offset) => applyScrollDelta(offset, -page, rowCount, lineBudget));
            return;
        }
        if (key.home && key.ctrl) {
            setScrollOffset((offset) => applyScrollDelta(offset, Number.MAX_SAFE_INTEGER, rowCount, lineBudget));
            return;
        }
        if (key.end && key.ctrl) {
            setScrollOffset(0);
            return;
        }
        const edited = editShortcut(input,key,draftRef.current);
        if (edited) {
            if (current.kind !== "sending" && current.kind !== "loading") setDraft(edited);
            return;
        }
        if (!menuOpen && (key.upArrow || key.downArrow || isCtrlKey(input,key,"p") || isCtrlKey(input,key,"n"))) {
            const up=key.upArrow || isCtrlKey(input,key,"p");
            const currentLayout=layoutCompose(draftRef.current.text,draftRef.current.caret,inner-2);
            if(up ? currentLayout.line===0 : currentLayout.line===currentLayout.lines.length-1) {
                const history=turnsRef.current.filter(turn=>turn.role==='user' && turn.text?.trim()).map(turn=>turn.text).reverse();
                if(historyIndexRef.current<0)historyDraftRef.current=draftRef.current;
                const next=Math.max(-1,Math.min(history.length-1,historyIndexRef.current+(up?1:-1)));
                historyIndexRef.current=next;
                const value=next<0 ? historyDraftRef.current || EMPTY_DRAFT : {text:history[next],caret:history[next].length};
                setDraft(value);return;
            }
        }
        const cmd = handleComposeKey(key, draftRef.current, inner - 2, input);
        if (cmd.type === "scrollTranscript") {
            const delta = cmd.dir === "up" ? WHEEL_LINE_DELTA : -WHEEL_LINE_DELTA;
            setScrollOffset((offset) => applyScrollDelta(offset, delta, rowCount, lineBudget));
            return;
        }
        if (cmd.type === "set") {
            const busyEdit = current.kind === "sending" || current.kind === "loading";
            if (busyEdit && cmd.draft.text !== draftRef.current.text)
                return;
            setDraft(cmd.draft);
            return;
        }
        if (cmd.type === "send") {
            if (current.kind === "sending" || current.kind === "loading")
                return;
            void send(draftRef.current.text);
            return;
        }
        if (isCtrlKey(input, key, "a")) {
            setDraft((value) => ({ text: value.text, caret: 0 }));
            return;
        }
        if (isCtrlKey(input, key, "e")) {
            setDraft((value) => ({ text: value.text, caret: value.text.length }));
            return;
        }
        if (current.kind === "sending" || current.kind === "loading") {
            return;
        }
        if (key.ctrl || key.meta || key.super)
            return;
        historyIndexRef.current=-1;
        const chunk = printableChunk(input);
        if (chunk) {
            const parsed=imagesFromText(chunk);
            if(parsed.images.length) {
                const existing=attachmentsRef.current;
                const added=parsed.images.filter(image=>!existing.some(old=>old.path===image.path)).map((image,i)=>({...image,marker:`[Image #${existing.length+i+1}]`}));
                setAttachments([...existing,...added]);
                const insertion=added.map(image=>image.marker).join(' ')+(parsed.text?' '+parsed.text:'')+' ';
                setDraft(value=>insertAt(value.text,value.caret,insertion));
            } else setDraft(value=>insertAt(value.text,value.caret,chunk));
        }
    });
    const view = useMemo(() => visibleTranscript(allRows, lineBudget, scrollOffset), [allRows, lineBudget, scrollOffset]);
    const canType = status.kind !== "sending" && status.kind !== "loading";
    setCursorPosition(canType && composeBox.hasMeasured && composeBox.height === composeInner + 2 ? {x:composeBox.left + 4 + stringWidth((composeView.lines[composeView.line] || '').slice(0,composeLaid.col)),y:composeBox.top + 1 + attachmentRows + composeView.line} : undefined);
    const busy = status.kind === "sending";
    const composePlaceholder = draft.text.length === 0 ? (busy ? "Sending…" : "Message " + displayName) : null;
    return (_jsxs(Box, { flexDirection: "column", width: width, height: height, overflow: "hidden", children: [_jsxs(Box, {height:5,flexShrink:0,paddingX:2,alignItems:"center",children:[_jsx(Avatar,{agent:liveAgent,width:6,height:3}),_jsx(Box,{paddingLeft:2,children:_jsx(Text,{bold:true,color:themeColor,children:displayName})})]}), _jsx(Box, { flexDirection: "column", justifyContent: TRANSCRIPT_JUSTIFY, paddingX: 2, paddingTop: 1, paddingBottom: padBottom + 1, height: transcriptH, overflow: "hidden", children: _jsxs(Box, { flexDirection: "column", flexShrink: 0, children: [status.kind === "error" ? _jsx(Text, { color: "red", children: status.message }) : null, view.rows.length === 0 && status.kind !== "error" ? (_jsx(Text, { dimColor: true, children: status.kind === "loading" ? "Loading…" : "No messages yet. Type below and press Enter." })) : (_jsxs(_Fragment, { children: [view.clipped ? _jsx(Text, { dimColor: true, children: "\u00B7\u00B7\u00B7" }) : null, renderTranscriptRows(view.rows, inner, themeColor), view.moreBelow ? _jsx(Text, { dimColor: true, children: "\u00B7\u00B7\u00B7" }) : null] })), answeringLine ? (_jsx(Text, { color: "yellow", dimColor: true, wrap: "truncate", children: answeringLine })) : null, menuOpen
                            ? mentionShown.map((name) => {
                                const selected = name === mentionMatches[mentionIndex];
                                return (_jsxs(Text, { inverse: selected, color: selected ? undefined : "yellow", wrap: "truncate", children: [selected ? "› @" : "  @", name] }, name));
                            })
                            : null] }) }), _jsx(Box, { flexDirection: "column", borderStyle: "round", borderColor: busy ? "yellow" : "gray", borderLeft:false, borderRight:false, paddingX: 2, ref: composeBoxRef, flexShrink: 0, height: composeInner + 2, overflow: "hidden", children: [false ? _jsx(Box,{height:1,flexShrink:0,children:_jsx(Text,{color:themeColor,wrap:"truncate",children:attachments.map((image,i)=>`Image #${i+1}`).join("  ")+"  (Ctrl+X remove)"})}) : null, ...composeView.lines.map((line, i) => {
                    const onCaret = i === composeView.line;
                    if (!onCaret) {
                        return (_jsx(Text, { wrap: "truncate", children: "  " + (line.length === 0 ? " " : line) }, `c-${i}`));
                    }
                    const cell = splitLineAtCaret(line, composeLaid.col);
                    return (_jsxs(Text, { wrap: "truncate", children: [i === 0 ? "› " : "  ", cell.before, canType ? _jsx(Text, { children: cell.cell }) : _jsx(Text, { dimColor: true, children: cell.cell }), cell.after, composePlaceholder ? _jsx(Text, { dimColor: true, children: composePlaceholder }) : null] }, `c-${i}`));
                })] }), _jsx(Box, { height: 1, flexShrink: 0, overflow: "hidden", paddingX: 1, children: _jsx(Text, { dimColor: true, children: "Enter send  ·  Shift+Enter newline  ·  ← lobby  ·  Ctrl+C quit" }) })] }));
}
