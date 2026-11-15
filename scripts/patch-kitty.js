// ink-picture 2.1.0 assumes the cursor is below the output. This application
// uses Ink useCursor inside an alternate screen, so use absolute placement.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const file=join(dirname(require.resolve('ink-picture')),'components/image/Kitty.js');
let source=readFileSync(file,'utf8');
if(!source.includes('// grok-tui absolute placement')) {
 const start=source.indexOf('        stdout.write(cursorUp(');
 const end=source.indexOf('        stdout.write(makeKittyPlacement',start);
 if(start<0||end<0)throw new Error('Unsupported ink-picture version: expected placement code not found');
 source=source.slice(0,start)+'        // grok-tui absolute placement\n        stdout.write(`\\x1b[${componentPosition.row + 1};${componentPosition.col + 1}H`);\n'+source.slice(end);
 writeFileSync(file,source);
}
