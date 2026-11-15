import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const dir=process.env.GROK_TUI_PROFILE_DIR||join(homedir(),'.config/grokbot-tui');
const file=join(dir,'activity.json');let times={};
try{times=JSON.parse(readFileSync(file,'utf8'));}catch{}
export function rememberReplies(id,turns){
 const newest=Math.max(0,...turns.filter(t=>t.role==='assistant').map(t=>Number(t.timestampMs)||0));
 if(newest<=(times[id]||0))return false;
 times[id]=newest;try {mkdirSync(dir,{recursive:true,mode:0o700});
 const tmp=file+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(times),{mode:0o600});renameSync(tmp,file);} catch {} return true;
}
export function recentFirst(agents){return [...agents].sort((a,b)=>(times[b.id]||0)-(times[a.id]||0));}
