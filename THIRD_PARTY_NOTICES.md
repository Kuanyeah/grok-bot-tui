# Upstream projects and licenses

This is an independent community project, not an official xAI client.

## smarzban/grokbot-tui

- Repository: https://github.com/smarzban/grokbot-tui
- Base: npm package `grokbot-tui@0.2.0` (published JavaScript sources)
- License: MIT — Copyright (c) 2026 grokbot-tui contributors
- Full notice: [licenses/grokbot-tui-MIT.txt](licenses/grokbot-tui-MIT.txt)

The application structure, Ink UI, host client, transcript parser, mock client,
keyboard handling and image helpers derive from this project. This fork modifies
layout, input/IME behavior, reactions, avatars, attachments, polling and packaging.
The JavaScript under `src/` is the editable application source; no build is needed.

## ScriptedAlchemy/grok-bot-cli

- Repository: https://github.com/ScriptedAlchemy/grok-bot-cli
- Commit: `96079dbcb3cc9bc3a6154fe404d0f0def1d4c910`
- License: MIT — Copyright (c) 2026 ScriptedAlchemy
- Full notice: [licenses/grok-bot-cli-MIT.txt](licenses/grok-bot-cli-MIT.txt)

`src/client/vendor/gbot/` contains its desktop session and gateway transport.
`app-session.js`, `headers.js` and `url-policy.js` are retained; `gateway.js`
contains the transport section with unused management imports removed and
`gatewayCall` exported. No plugin, relay, or management service is installed.

## ink-picture

The pinned `ink-picture@2.1.0` dependency is MIT licensed. The local postinstall
patch changes Kitty placement from relative cursor movement to absolute screen
coordinates, because this application owns an alternate screen and uses a real
input cursor. The dependency's own license is retained by npm.

UI interaction conventions are inspired by Claude Code. No Claude Code or Codex
source code, binaries, branding assets, or dependencies are included.

## Terminal avatars

The terminal avatar artwork is independently drawn, inspired by
the Grok Bot visual identity (https://x.ai/bot). They are not extracted official assets.
Grok Bot and xAI names/marks belong to their respective owners; this project is unaffiliated.
