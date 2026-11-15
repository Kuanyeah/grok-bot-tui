import React,{useEffect,useState} from 'react';
import {Box,Text,useApp,useInput,useWindowSize} from 'ink';
import {Avatar} from './Avatar.js';
import {botColor} from './bot-colors.js';
import {recentFirst,rememberReplies} from './activity.js';
const h=React.createElement;
export function Picker({agents,client,refreshing=false,onSelect,onRefresh,onAppearance}){
 const {exit}=useApp(),{columns=80,rows=24}=useWindowSize();
 const [selectedId,setSelectedId]=useState(null),[,refresh]=useState(0);
 const items=recentFirst(agents),index=Math.max(0,items.findIndex(a=>a.id===selectedId));
 const selected=items[index],capacity=Math.max(1,Math.floor((rows-4)/4));
 const start=Math.max(0,index-capacity+1),visible=items.slice(start,start+capacity);
 useEffect(()=>{
  let stopped=false,timer;
  async function poll(){
   for(let i=0;i<agents.length&&!stopped;i+=2){
    await Promise.allSettled(agents.slice(i,i+2).map(async agent=>{
     const turns=await client?.getTranscript(agent.id,20,{hydrate:false});
     if(!stopped&&turns&&rememberReplies(agent.id,turns))refresh(n=>n+1);
    }));
   }
   if(!stopped)timer=setTimeout(poll,8000);
  }
  if(client)void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[client,agents]);
 useInput((input,key)=>{
  if((key.ctrl&&input==='c')||input==='q'||key.escape){exit();return;}
  if(input==='r'){onRefresh();return;}
  if(!items.length)return;
  if(key.upArrow||input==='k')setSelectedId(items[(index-1+items.length)%items.length].id);
  else if(key.downArrow||input==='j')setSelectedId(items[(index+1)%items.length].id);
  else if(input==='a')onAppearance?.(selected);
  else if(key.return||key.rightArrow)onSelect(selected);
 });
 return h(Box,{flexDirection:'column',width:columns,height:rows-1,paddingTop:1},
  h(Box,{flexDirection:'column',flexGrow:1,paddingX:2,overflow:'hidden'},
   ...visible.map((agent,rowIndex)=>h(Box,{key:agent.id+":"+(start+rowIndex),height:4,flexShrink:0,paddingBottom:1},
    h(Box,{width:3,height:3,justifyContent:'center',flexDirection:'column'},h(Text,{color:botColor(agent)},agent.id===selected?.id?'›':' ')),
    h(Avatar,{agent,width:6,height:3,active:agent.id===selected?.id}),
    h(Box,{height:3,paddingLeft:2,flexDirection:'column',justifyContent:'center'},h(Text,{bold:agent.id===selected?.id,color:botColor(agent)},agent.name||'Bot')))),
   !items.length?h(Text,{dimColor:true},'No bots yet'):null),
  h(Box,{height:2,paddingX:2},h(Text,{dimColor:true},refreshing?'Refreshing…':'↑↓ select  ·  → open  ·  a appearance  ·  r refresh  ·  q quit')));
}
