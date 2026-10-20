import {parseInlineToken,inlineToken} from './inline-format.js';
// Page parameters are symbolic tag references, resolved separately for each live instance.
export const PARAMETER_SOURCE='@parameters';
export const isParameter=id=>typeof id==='string' && id.startsWith('parameter:');
export function parameterTags(page){return (page?.parameters || []).map(p=>({id:p.id,name:p.name,description:p.description || '',source:PARAMETER_SOURCE,source_name:'Parameters'}));}
export function renameParameterText(page,previous){
  const oldByPath=new Map(previous.map(p=>['Parameters\\'+p.name,p.id]));
  const names=new Map((page.parameters || []).map(p=>[p.id,'Parameters\\'+p.name]));
  for(const control of [page,...page.controls || [],...page.groups || []])for(const [owner,field,refsKey] of [[control,'text','textRefs'],...(control.events || []).filter(e=>e.action==='set_content').map(e=>[e,'content','contentRefs'])]){
    const refs=owner[refsKey] || {},nextRefs={...refs};
    owner[field]=String(owner[field] ?? '').replace(/@\{([^{}\r\n]+)\}/g,(token,path)=>{
      const parsed=parseInlineToken(path),id=refs[path] || refs[parsed.path] || oldByPath.get(parsed.path),next=names.get(id);
      if(!next)return token;
      const replacement=inlineToken(next,parsed.format || {});delete nextRefs[path];nextRefs[replacement.slice(2,-1)]=id;return replacement;
    });
    if(Object.keys(nextRefs).length)owner[refsKey]=nextRefs;
  }
}
export function instantiatePage(template,connections={}){
  const page=structuredClone(template);page.accessBindings={...connections};
  const resolve=id=>isParameter(id)?(connections[id] && !isParameter(connections[id])?connections[id]:''):id;
  const params=parameterTags(template),paths=new Map(params.map(p=>['Parameters\\'+p.name,p.id]));
  for(const control of [page,...page.controls || [],...page.groups || []]){
    if(control.binding)control.binding.tag=resolve(control.binding.tag);
    if(control.type==='trend')for(const series of control.series || [])series.tag=resolve(series.tag);
    for(const action of control.actions || []){
      action._access={page:template.id,control:control===page?'@page':control.id,action:action.id,bindings:{...connections}};
      action.tag=resolve(action.tag);
      if(action.parameters)action.parameters=Object.fromEntries(Object.entries(action.parameters).map(([key,value])=>[key,resolve(value)]));
    }
    for(const event of control.events || []){
      event.tag=resolve(event.tag);event.target=resolve(event.target);
      for(const operand of [event.operand,event.end_operand])if(operand?.kind==='tag')operand.tag=resolve(operand.tag);
    }
    for(const [owner,field,refsKey] of [[control,'text','textRefs'],...(control.events || []).filter(e=>e.action==='set_content').map(e=>[e,'content','contentRefs'])]){
      const refs={...owner[refsKey]};
      for(const match of String(owner[field] ?? '').matchAll(/@\{([^{}\r\n]+)\}/g))if(paths.has(parseInlineToken(match[1]).path) && !refs[match[1]])refs[match[1]]=paths.get(parseInlineToken(match[1]).path);
      owner[refsKey]=Object.fromEntries(Object.entries(refs).map(([path,id])=>[path,resolve(id)]));
    }
  }
  return page;
}
