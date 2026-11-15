import {test} from 'node:test';
import assert from 'node:assert/strict';
import {turnsToRows} from '../src/tui/layout.js';
import {editShortcut,stringWidth} from '../src/tui/input-editing.js';
import {layoutCompose} from '../src/tui/compose.js';
import {avatarPng} from '../src/tui/Avatar.js';
import {MockHostClient} from '../src/client/mock.js';
test('reactions sit unframed below the original message at its right edge',()=>{
 const rows=turnsToRows([{id:'one',role:'user',speaker:'you',text:'Looks good',reactions:[{emoji:'👍'}]}],70,'Ada');
 const reactions=rows.filter(r=>r.kind==='reaction');
 assert.equal(reactions.length,1);assert.equal(reactions[0].text.trim(),'👍');assert.equal(stringWidth(reactions[0].text),70);assert.equal(rows.filter(r=>r.text.includes('╭')).length,1);
});
test('Unicode input wraps by cells and deletes complete graphemes',()=>{
 const text='\u4f60\u597d👨‍👩‍👧';assert.equal(editShortcut('',{backspace:true},{text,caret:text.length}).text,'\u4f60\u597d');
 assert(layoutCompose('\u4f60\u597d\u4e16\u754c😀',6,6).lines.every(line=>stringWidth(line)<=6));
});
test('avatar animation frames differ and are cached',()=>{
 const still=avatarPng('heart','#FFFFFF');assert.equal(still,avatarPng('heart','#FFFFFF'));assert(!still.equals(avatarPng('heart','#FFFFFF',2)));
});
test('offline gallery includes multiple English bots',async()=>{
 const bots=await new MockHostClient().listAgents();assert(bots.length>=10);assert(bots.every(bot=>!/[\u4e00-\u9fff]/.test(bot.name)));
});
