import stringWidth from 'string-width';
const segmenter = new Intl.Segmenter(undefined,{granularity:'grapheme'});
const units = text => [...segmenter.segment(text)];
const previous = (text,c) => units(text).filter(x=>x.index<c).at(-1)?.index ?? 0;
const next = (text,c) => units(text).find(x=>x.index>c)?.index ?? text.length;
export function editShortcut(input,key,draft) {
    const {text,caret:c}=draft;
    const set = (value,caret) => ({text:value,caret});
    const ctrl = letter => key.ctrl && (input.toLowerCase()===letter || input.charCodeAt(0)===letter.charCodeAt(0)-96);
    if ((key.super && (key.backspace||key.delete)) || ctrl('u')) return set('',0);
    if (key.home && !key.ctrl) return set(text,text.lastIndexOf('\n',Math.max(0,c-1))+1);
    if (key.end && !key.ctrl) {const end=text.indexOf('\n',c);return set(text,end<0?text.length:end);}
    if (ctrl('a')) return set(text,0);
    if (ctrl('e')) return set(text,text.length);
    if (ctrl('k')) return set(text.slice(0,c),c);
    const wordBack = () => {const match=text.slice(0,c).match(/\s*\S+\s*$/u);return match ? c-match[0].length:0;};
    const wordNext = () => {const match=text.slice(c).match(/^\s*\S+\s*/u);return match?c+match[0].length:text.length;};
    if (ctrl('w') || (key.meta && key.backspace)) {const p=wordBack();return set(text.slice(0,p)+text.slice(c),p);}
    if (key.meta && key.leftArrow) return set(text,wordBack());
    if (key.meta && key.rightArrow) return set(text,wordNext());
    if (!key.super && !key.ctrl && !key.meta) {
        if(key.leftArrow) return set(text,previous(text,c));
        if(key.rightArrow) return set(text,next(text,c));
        if(key.backspace) {const p=previous(text,c);return set(text.slice(0,p)+text.slice(c),p);}
        if(key.delete) return set(text.slice(0,c)+text.slice(next(text,c)),c);
    }
    return null;
}
export function wrapInput(para,start,width) {
    const rows=[];let line='',offset=start,cells=0;
    for(const {segment,index} of units(para)) {
        const size=stringWidth(segment);
        if(cells+size>width && line) {rows.push({text:line,start:offset});line='';offset=start+index;cells=0;}
        line+=segment;cells+=size;
    }
    rows.push({text:line,start:offset});
    return rows;
}
export {stringWidth};
