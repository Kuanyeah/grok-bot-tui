import {Avatar} from './Avatar.js';
import { Appearance } from './Appearance.js';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useWindowSize, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { openHostClient } from "../client/factory.js";
import { readRosterCache, writeRosterCache } from "../client/rosterCache.js";
import { HostClientError } from "../client/types.js";
import { errorMessage } from "../redact.js";
import { Chat } from "./Chat.js";
import { ErrorScreen } from "./ErrorScreen.js";
import { Picker } from "./Picker.js";
function pickDefault(agents, wanted) {
    if (!wanted)
        return undefined;
    const needle = wanted.trim().toLowerCase();
    return agents.find((agent) => agent.id.toLowerCase() === needle || agent.name.toLowerCase() === needle);
}
function openScreenForRoster(roster, defaultAgent, setAgents, setScreen) {
    setAgents(roster);
    const fallback = pickDefault(roster, defaultAgent);
    if (fallback) {
        setScreen({ name: "chat", agent: fallback });
    }
    else {
        setScreen({ name: "picker" });
    }
}
function BootScreen({ note }) {
    const {exit}=useApp();
    useInput((input,key)=>{if(key.ctrl&&input==="c")exit();});
    const {columns,rows}=useWindowSize();
    return _jsxs(Box,{width:columns||80,height:Math.max(11,(rows||24)-1),flexDirection:"column",paddingX:2,children:[
        _jsxs(Box,{height:5,alignItems:"center",children:[
            _jsx(Avatar,{choice:{shape:"circle",color:"white"},width:6,height:3}),
            _jsx(Box,{paddingLeft:2,children:_jsx(Text,{bold:true,children:"Grok Bot"})})
        ]}),
        _jsx(Box,{paddingTop:1,paddingLeft:1,children:_jsx(Text,{dimColor:true,children:note})})
    ]});
}
export function App({ config, token, mock }) {
    const [screen, setScreen] = useState({ name: "boot" });
    const [client, setClient] = useState(null);
    const [agents, setAgents] = useState([]);
    const [bootNote, setBootNote] = useState("Connecting…");
    const [rosterRefreshing, setRosterRefreshing] = useState(false);
    /** Monotonic generation so overlapping listAgents calls discard stale results. */
    const rosterGenRef = useRef(0);
    const fetchRoster = useCallback(async (host, options) => {
        const gen = ++rosterGenRef.current;
        if (options.showRefreshing)
            setRosterRefreshing(true);
        try {
            const roster = await host.listAgents();
            if (gen !== rosterGenRef.current)
                return;
            if (host.rosterCacheKey)
                writeRosterCache(host.rosterCacheKey, roster);
            if (options.openScreen) {
                openScreenForRoster(roster, config.defaultAgent, setAgents, setScreen);
            }
            else {
                setAgents(roster);
            }
        }
        catch (err) {
            if (gen !== rosterGenRef.current)
                return;
            if (!options.silent) {
                const kind = err instanceof HostClientError ? err.kind : "unknown";
                setScreen({
                    name: "error",
                    kind,
                    message: err instanceof HostClientError ? err.message : errorMessage(err, token),
                });
            }
        }
        finally {
            if (options.showRefreshing && gen === rosterGenRef.current) {
                setRosterRefreshing(false);
            }
        }
    }, [config.defaultAgent, token]);
    const boot = useCallback(async () => {
        rosterGenRef.current += 1;
        setScreen({ name: "boot" });
        setBootNote("Connecting…");
        setRosterRefreshing(false);
        try {
            const next = await openHostClient({ config, token, mock });
            setClient(next);
            const wantsDefault = Boolean(config.defaultAgent?.trim());
            const cacheKey = next.rosterCacheKey;
            const cached = !mock && cacheKey ? readRosterCache(cacheKey) : undefined;
            // Warm lobby only: never open chat from cache; default agent waits on the gateway.
            if (!wantsDefault && cached !== undefined) {
                setAgents(cached);
                setScreen({ name: "picker" });
                void fetchRoster(next, { silent: true, openScreen: false, showRefreshing: true });
                return;
            }
            setBootNote("Loading your bots…");
            await fetchRoster(next, { silent: false, openScreen: true, showRefreshing: false });
        }
        catch (err) {
            const kind = err instanceof HostClientError ? err.kind : "unknown";
            setScreen({
                name: "error",
                kind,
                message: err instanceof HostClientError ? err.message : errorMessage(err, token),
            });
        }
    }, [config, fetchRoster, mock, token]);
    useEffect(() => {
        void boot();
    }, [boot]);
    const refreshRoster = useCallback(async () => {
        if (!client) {
            await boot();
            return;
        }
        await fetchRoster(client, { silent: false, openScreen: false, showRefreshing: true });
    }, [boot, client, fetchRoster]);
    if (screen.name === "boot") {
        return _jsx(BootScreen, { note: bootNote });
    }
    if (screen.name === "error") {
        return _jsx(ErrorScreen, { kind: screen.kind, message: screen.message, onRetry: () => void boot() });
    }
    if (!client) {
        return _jsx(BootScreen, { note: "Client was not created." });
    }
    if (screen.name === "appearance") return _jsx(Appearance, {agent:screen.agent,onClose:()=>setScreen({name:"picker"})});
    if (screen.name === "picker") {
        return (_jsx(Picker, { agents: agents, client: client, onAppearance: (agent) => setScreen({name:"appearance",agent}), refreshing: rosterRefreshing, onSelect: (agent) => setScreen({ name: "chat", agent }), onRefresh: () => void refreshRoster() }));
    }
    return (_jsx(Chat, { client: client, agent: screen.agent, roster: agents, timeoutMs: config.waitTimeoutMs, pollMs: config.pollIntervalMs, onRoster: setAgents, onSwitch: () => setScreen({ name: "picker" }) }));
}
