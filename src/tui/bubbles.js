import stringWidth from 'string-width';

export function userBubble(text, paneWidth) {
    const width = Math.max(1, Math.floor(paneWidth * 0.9) - 6);
    const lines = wrapCells(text, width);
    const longest = Math.max(...lines.map(stringWidth));
    const pad = ' '.repeat(Math.max(0, paneWidth - longest - 6));
    return [pad + '╭' + '─'.repeat(longest + 4) + '╮',
        ...lines.map(line => pad + '│  ' + line + ' '.repeat(longest - stringWidth(line)) + '  │'),
        pad + '╰' + '─'.repeat(longest + 4) + '╯'];
}

export function leftReturnsToLobby(key, draft) {
    return key.leftArrow && !key.ctrl && !key.meta && !key.super && !key.shift && draft.text.length === 0;
}

export function wrapCells(text, width) {
    const lines = [];
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
        let line = '';
        for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(paragraph)) {
            if (line && stringWidth(line + segment) > width) {
                lines.push(line);
                line = '';
            }
            line += segment;
        }
        lines.push(line);
    }
    return lines;
}
