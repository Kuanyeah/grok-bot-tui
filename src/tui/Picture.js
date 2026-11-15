import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import Image from "ink-picture";
import { IMAGE_CELL_COLS, IMAGE_CELL_ROWS, imagePlaceholder, localImagePath } from "./images.js";
/**
 * Kitty when the reserved block is fully on-screen (Ghostty). Half-block if
 * ink-picture reports the placement as partial. Never dumps APC from <Text>.
 */
export function Picture({ row, inner }) {
    const src = row.image ? localImagePath(row.image) : undefined;
    const cols = Math.max(8, Math.min(IMAGE_CELL_COLS, inner));
    const alt = row.image?.alt?.trim() || "image";
    return (_jsx(Box, { width: inner, height: IMAGE_CELL_ROWS, justifyContent: row.align === "end" ? "flex-end" : "flex-start", overflow: "hidden", children: src ? (_jsx(Image, { src: src, width: cols, height: IMAGE_CELL_ROWS, alt: alt, objectFit: "contain", protocol: { full: "kitty" } })) : (_jsx(Text, { dimColor: true, color: "yellow", wrap: "truncate", children: row.text || imagePlaceholder(row.image ?? {}) })) }));
}
