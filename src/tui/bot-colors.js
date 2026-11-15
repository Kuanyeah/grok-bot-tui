import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export const colors = ['white','brown','red','orange','yellow','green','cyan','blue','violet','magenta','gray'];
const inkColors = {white:'#FFFFFF',black:'#FFFFFF',brown:'#B98956',red:'#FF5670',orange:'#FF914D',yellow:'#FFBE3C',green:'#39D98A',cyan:'#35CFCA',blue:'#669FFF',violet:'#AA86FF',magenta:'#FF69BA',gray:'#A6A6A6'};
export const shapes = ['circle','blob','square','star','flower','heart','clover','egg','capsule','triangle','gem','sun','hex'];
const icons = ['●','☁','■','✦','✿','♥','♣','⬤','▰','▲','◆','✹','⬢'];
const dir = process.env.GROK_TUI_PROFILE_DIR || join(homedir(), '.config/grokbot-tui');
const file = join(dir,'appearance.json');
let preferences = {};
try { preferences = JSON.parse(readFileSync(file,'utf8')); } catch (error) { if(error.code !== 'ENOENT') throw new Error('Cannot read TUI appearance settings: '+error.message); }
const demoProfiles={
 '11111111-1111-4111-8111-111111111111':{color:'white',shape:'circle'},
 '22222222-2222-4222-8222-222222222222':{color:'brown',shape:'egg'},
 '33333333-3333-4333-8333-333333333333':{color:'cyan',shape:'triangle'},
 '44444444-4444-4444-8444-444444444444':{color:'violet',shape:'gem'},
 '55555555-5555-4555-8555-555555555555':{color:'cyan',shape:'hex'},
 'demo-atlas':{color:'magenta',shape:'capsule'},
 'demo-nova':{color:'yellow',shape:'star'},
 'demo-pixel':{color:'blue',shape:'square'},
 'demo-scout':{color:'green',shape:'clover'},
 'demo-echo':{color:'violet',shape:'flower'},
 'demo-sage':{color:'orange',shape:'heart'},
};
export function appearance(agent) {
    const id = typeof agent === 'string' ? agent : agent.id;
    const saved = preferences[id];
    const index = createHash('sha256').update(id).digest()[0];
    return saved || demoProfiles[id] || {color:colors[2 + index % (colors.length-2)],shape:'circle'};
}
export function botColor(agent) { return inkColors[appearance(agent).color] || '#35CFCA'; }
export function shapeIcon(shape) { const index=shapes.indexOf(shape); return icons[index < 0 ? 0 : index] + ' ˙˙'; }
export function avatar(agent) { return shapeIcon(appearance(agent).shape); }
export function colorValue(name) { return inkColors[name] || '#FFFFFF'; }
export function saveAppearance(id, value) {
    if(!colors.includes(value.color)||!shapes.includes(value.shape)) throw new Error('Invalid appearance');
    const next={...preferences,[id]:value};
    mkdirSync(dir,{recursive:true,mode:0o700});
    const temp=file+'.'+process.pid+'.tmp';
    writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    renameSync(temp,file); preferences=next;
}
