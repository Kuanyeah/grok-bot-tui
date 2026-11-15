import React from 'react';
import {Box, Text} from 'ink';
import Image from 'ink-picture';
import {IMAGE_CELL_COLS, IMAGE_CELL_ROWS, localImagePath} from './images.js';

export function Picture({row, inner}) {
    const images = row.images ?? [row.image];
    const cols = Math.max(1, Math.min(IMAGE_CELL_COLS, inner));
    return React.createElement(Box, {
        width:inner, height:IMAGE_CELL_ROWS, flexShrink:0, gap:1,
        justifyContent:row.align === 'end' ? 'flex-end' : 'flex-start', overflow:'hidden',
    }, images.map((image, index) => {
        const src = image && localImagePath(image);
        return React.createElement(Box, {key:src ?? index, width:cols, height:IMAGE_CELL_ROWS, flexShrink:0,
            alignItems:'center', justifyContent:'center'}, src
            ? React.createElement(Image, {src, width:cols, height:IMAGE_CELL_ROWS,
                alt:' ', objectFit:'cover', protocol:{full:'kitty'}})
            : React.createElement(Text, {dimColor:true}, `Image #${(row.imageIndex ?? 0)+index+1}`));
    }));
}
