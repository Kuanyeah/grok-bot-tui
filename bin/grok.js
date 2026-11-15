#!/usr/bin/env node
const command=process.argv[2];
if(command==='bot') {process.title='grok';if(process.stdout.isTTY)process.stdout.write('\x1b]2;grok\x07');process.argv.splice(2,1);await import('../src/cli.js');}
else {console.log('Usage: grok bot [--mock] [--agent NAME]');if(command&&!['--help','-h'].includes(command))process.exitCode=2;}
