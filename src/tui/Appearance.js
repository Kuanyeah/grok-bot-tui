import React,{useState} from 'react';
import {Box,Text,useInput,useWindowSize} from 'ink';
import {Avatar} from './Avatar.js';
import {appearance,colors,shapes,colorValue,saveAppearance} from './bot-colors.js';
const h=React.createElement;
const title=s=>s[0].toUpperCase()+s.slice(1);
export function Appearance({agent,onClose}) {
 const [choice,setChoice]=useState(()=>appearance(agent)),[field,setField]=useState(0),[error,setError]=useState('');
 const {columns=80,rows=24}=useWindowSize();
 useInput((input,key)=>{
  if(key.escape||(key.ctrl&&input==="c")){onClose();return;}
  if(key.upArrow||key.downArrow||key.tab){setField(x=>1-x);return;}
  if(key.leftArrow||key.rightArrow){const name=field===0?'color':'shape',list=field===0?colors:shapes;setChoice(old=>({...old,[name]:list[(list.indexOf(old[name])+(key.rightArrow?1:-1)+list.length)%list.length]}));}
  if(key.return){try{saveAppearance(agent.id,choice);onClose();}catch(e){setError(e.message);}}
 });
 const color=colorValue(choice.color),colorName=choice.color==='white'?'Pure white':title(choice.color);
 return h(Box,{flexDirection:'column',width:columns,height:rows-1,paddingX:2,paddingTop:1},
  h(Text,{bold:true},'Appearance'),h(Text,{dimColor:true},agent.name+'  ·  Saved on this device'),
  h(Box,{height:8,alignItems:'center'},h(Avatar,{choice,width:12,height:6}),h(Box,{paddingLeft:3,flexDirection:'column'},h(Text,{bold:true,color},agent.name),h(Text,{dimColor:true},colorName+' / '+title(choice.shape)))),
  h(Box,{height:2},h(Text,{color:field===0?color:'gray'},field===0?'› Color   ':'  Color   '),h(Text,{bold:field===0,color},'‹ '+colorName+' ›')),
  h(Box,{height:2,paddingLeft:2},...colors.map(name=>h(Text,{key:name,color:colorValue(name)},name===choice.color?'[●] ':' ●  '))),
  h(Box,{height:2},h(Text,{color:field===1?color:'gray'},field===1?'› Shape   ':'  Shape   '),h(Text,{bold:field===1,color},'‹ '+title(choice.shape)+' ›')),
  h(Text,{dimColor:true},'↑↓ choose field   ←→ change   Enter save   Esc cancel'),error?h(Text,{color:'red'},error):null);
}
