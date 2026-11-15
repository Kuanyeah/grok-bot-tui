import React, {useEffect,useState} from 'react';
import Image from 'ink-picture';
import {deflateSync} from 'node:zlib';
import {appearance,colorValue} from './bot-colors.js';
const cache=new Map();
// Independently drawn 2D faces, tuned per silhouette against the desktop UI.
const eyeProfiles={
 circle:[[47,29,53,39],[64,22,70,32],4.1],
 blob:[[41,31,47,41],[59,28,65,38],3.8],
 capsule:[[39,29,46,40],[59,25,66,36],3.8],
 square:[[40,38,44,46],[57,33,61,41],3.6],
 star:[[40,39,43,46],[54,35,57,42],3.2],
 flower:[[41,38,45,46],[55,34,59,42],3.3],
 clover:[[40,42,44,50],[57,38,61,46],3.5],
 heart:[[42,37,47,47],[58,33,63,43],3.4],
 egg:[[43,35,47,44],[58,31,62,40],3.6],
 triangle:[[39,50,46,56],[53,46,60,52],3.0],
 gem:[[41,39,45,47],[57,35,61,43],3.5],
 sun:[[41,39,44,46],[55,35,58,42],3.0],
 hex:[[40,37,44,46],[58,32,62,41],3.7],
};
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,sum]);}
export function avatarPng(shape,color,frame=0){
 const key=shape+color+frame;if(cache.has(key))return cache.get(key);
 const n=128,raw=Buffer.alloc(n*(1+n*4));const rgb=color.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16));
 function body(x,y){
 const X=(x-48)/40,Y=(y-48)/40,r=Math.hypot(X,Y),a=Math.atan2(Y,X);
 if(shape==='logo')return Math.abs(X)**2.7+Math.abs(Y)**2.7<.95;
 if(shape==='heart') {const yy=-Y;return (X*X+yy*yy-0.65)**3-X*X*yy**3<0;}
 if(shape==='square'){const u=X*.966-Y*.259,v=X*.259+Y*.966;return Math.hypot(Math.max(0,Math.abs(u)-.58),Math.max(0,Math.abs(v)-.58))<.22;}
 if(shape==='gem')return Math.abs(X)**1.25+Math.abs(Y)**1.25<1.12;
 if(shape==='triangle')return Y>-.95&&Y<.9&&Math.abs(X)<(Y+.95)*.55;
 if(shape==='capsule'||shape==='blob') {
  const u=X*.94-Y*.342,v=X*.342+Y*.94;
  return (Math.max(0,Math.abs(u)-.30))**2+v*v<.54;
 }
 if(shape==='egg')return X*X/(.7+.15*Y)**2+Y*Y<1;
 if(shape==='hex')return r<.9/(Math.cos((a+Math.PI*2)%(Math.PI/3)-Math.PI/6));
 if(['star','flower','clover','sun'].includes(shape)){const points={star:4,flower:5,clover:4,sun:8}[shape];return r<.79+.19*Math.cos(points*a);}
 return r<1;
 }
 const original=eyeProfiles[shape]||eyeProfiles.circle;
 let face=original.map(v=>Array.isArray(v)?[...v]:v);
 const fits=profile=>profile.slice(0,2).every(e=>[0,.25,.5,.75,1].every(t=>Array.from({length:16},(_,k)=>k*Math.PI/8).every(a=>body(e[0]+(e[2]-e[0])*t+Math.cos(a)*(profile[2]+1),e[1]+(e[3]-e[1])*t+Math.sin(a)*(profile[2]+1)))));
 for(let step=0;step<24&&!fits(face);step++) {
  for(const eye of face.slice(0,2)){eye[0]+=(48-eye[0])*.035;eye[2]+=(48-eye[2])*.035;eye[1]+=1;eye[3]+=1;}
 }
 function capsule(x,y,ax,ay,bx,by,radius=4.1){const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy)<radius;}
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let alpha=0,eyes=0;
  for(const oy of [.25,.75])for(const ox of [.25,.75]){
   const bounce=[0,2,4,5,3][frame]||0;
   const angle=([0,-2,-4,2,0][frame]||0)*Math.PI/180;
   const dx=(x+ox)*96/n-48,dy=(y+oy)*96/n-48+bounce;
   const px=48+dx*Math.cos(angle)+dy*Math.sin(angle),py=48-dx*Math.sin(angle)+dy*Math.cos(angle);
   if(body(px,py)){
    alpha++;
    const profile=face;
    const left=[...profile[0]],right=[...profile[1]],radius=profile[2];
    if(frame===4){left[1]=left[3]=(left[1]+left[3])/2;right[1]=right[3]=(right[1]+right[3])/2;}
    if(capsule(px,py,...left,radius)||capsule(px,py,...right,radius))eyes++;
   }
  }
  const i=y*(1+n*4)+1+x*4,blend=alpha?eyes/alpha:0;
  for(let c=0;c<3;c++)raw[i+c]=Math.round(rgb[c]*(1-blend)+28*blend);
  raw[i+3]=Math.round(alpha*255/4);
 }
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(n);hdr.writeUInt32BE(n,4);hdr[8]=8;hdr[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);if(cache.size>=96)cache.delete(cache.keys().next().value);cache.set(key,png);return png;
}
export const Avatar = React.memo(function Avatar({agent,choice,width=4,height=2,active=false}) {
 const value=choice||appearance(agent);
 const [frame,setFrame]=useState(0);
 useEffect(()=>{
  setFrame(0);
  if(!active || process.env.GROK_TUI_REDUCED_MOTION==='1')return;
  // A short greeting on selection, never a permanent animation loop.
  const sequence=[1,2,3,4,3,2,1,0];let index=0;
  const timer=setInterval(()=>{setFrame(sequence[index++]);if(index===sequence.length)clearInterval(timer);},100);
  return()=>clearInterval(timer);
 },[active,agent?.id,value.shape,value.color]);
 return React.createElement(Image,{src:avatarPng(value.shape,colorValue(value.color),active?frame:0),width,height,objectFit:'contain',alt:' ',protocol:{full:'kitty'}});
});
