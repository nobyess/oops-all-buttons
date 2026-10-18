import {displayValue} from './value-format.js';
const tokens=text=>[...String(text ?? '').matchAll(/@\{([^{}\r\n]+)\}/g)];
function identity(path,refs,tags) {
  if(Object.hasOwn(refs || {},path))return refs[path] || undefined;
  return tags.find(tag=>`${tag.source_name || tag.source}\\${tag.folder?tag.folder+'\\':''}${tag.name || tag.address || tag.id}`.toLowerCase()===path.toLowerCase())?.id;
}
export function inlineTagIds(text,refs={},tags=[]) {
  return [...new Set(tokens(text).map(match=>identity(match[1],refs,tags)).filter(Boolean))];
}
export function controlInlineTagIds(control,tags=[]) {
  if(['square','circle','triangle','polyline','numeric','level'].includes(control.type))return [];
  return [...new Set([...inlineTagIds(control.text,control.textRefs,tags),
    ...(control.events || []).flatMap(event=>event.action==='set_content'?inlineTagIds(event.content,event.contentRefs,tags):[])])];
}
export function renderInlineText(text,refs={},tags=[],values={}) {
  return String(text ?? '').replace(/@\{([^{}\r\n]+)\}/g,(_,path)=>{
    const sample=values[identity(path,refs,tags)];
    return sample?.quality==='good'?displayValue(sample.value):'—';
  });
}
