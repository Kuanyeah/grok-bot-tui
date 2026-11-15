import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { isCtrlKey } from "./keys.js";
export function errorTitle(kind) {
    switch (kind) {
        case "missing-auth":
            return "Missing gateway token";
        case "unauthorized":
            return "Gateway rejected the token";
        case "host-down":
            return "Grok Bot host is down";
        default:
            return "Something went wrong";
    }
}
export function errorHint(kind) {
    switch (kind) {
        case "missing-auth":
            return "Copy .env.example to .env, set GROKBOT_GATEWAY_TOKEN, or open the Grok Bot desktop app and retry.";
        case "unauthorized":
            return "The token in GROKBOT_GATEWAY_TOKEN or the desktop session is wrong or expired. Do not paste it here.";
        case "host-down":
            return "Start the host, check GROKBOT_GATEWAY_URL (Tailscale or SSH tunnel), or run npm start -- --mock.";
        default:
            return "See README for how to connect. Esc/q quits.";
    }
}
export function ErrorScreen({ kind, message, onRetry }) {
    const { exit } = useApp();
    const { columns, rows } = useWindowSize();
    const width = Math.max(40, columns || 80);
    const height = Math.max(12, rows || 24);
    useInput((input, key) => {
        if (isCtrlKey(input, key, "c")) {
            exit();
            return;
        }
        if (input === "q" || key.escape) {
            exit();
            return;
        }
        if (input === "r") {
            onRetry();
        }
    });
    return (_jsxs(Box, { flexDirection: "column", width: width, height: height, overflow: "hidden", children: [_jsx(Box, { borderStyle: "round", borderColor: "red", paddingX: 1, height: 3, overflow: "hidden", children: _jsx(Text, { color: "red", bold: true, children: errorTitle(kind) }) }), _jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "gray", paddingX: 1, flexGrow: 1, overflow: "hidden", children: [_jsx(Text, { children: message }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: errorHint(kind) }) })] }), _jsx(Box, { borderStyle: "round", borderColor: "gray", paddingX: 1, height: 3, overflow: "hidden", children: _jsx(Text, { dimColor: true, children: "r retry  \u00B7  q quit" }) })] }));
}
