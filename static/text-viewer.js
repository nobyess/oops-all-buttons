const states=new WeakMap();
const active=new Set();
function node(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent.append(el);return el;}
export function markdownInline(parent,text){
 const pattern=/!\[([^\]]*)\]\(([^\s)]+)\)|\[([^\]]*)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
 let offset=0;
 for(const match of text.matchAll(pattern)){
  parent.append(document.createTextNode(text.slice(offset,match.index)));
  if(match[1]!==undefined){
   if(/^\/api\/images\/[a-f0-9]{64}(?:\?v=\d+)?$/.test(match[2])){const img=node('img',undefined,parent);img.src=match[2];img.alt=match[1];img.loading='lazy';}
   else parent.append(document.createTextNode(match[0]));
  }else if(match[3]!==undefined){
   if(/^#runtime\/[\w%.-]+$/.test(match[4])){const link=node('a',match[3],parent);link.href=match[4];}
   else parent.append(document.createTextNode(match[0]));
  }else node(match[5]!==undefined?'strong':match[6]!==undefined?'em':'code',match[5]??match[6]??match[7],parent);
  offset=match.index+match[0].length;
 }
 parent.append(document.createTextNode(text.slice(offset)));
}
export function renderMarkdown(parent,text){
 parent.replaceChildren();let code=null;
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
  if(line.startsWith('```')){code=code?null:node('code','',node('pre',undefined,parent));continue;}
  if(code){code.textContent+=line+'\n';continue;}
  if(/^\s*---+\s*$/.test(line)){node('hr',undefined,parent);continue;}
  const heading=line.match(/^(#{1,3}) (.*)$/),quote=line.startsWith('> ');
  const block=node(heading?'h'+heading[1].length:quote?'blockquote':'p',undefined,parent);
  markdownInline(block,heading?heading[2]:quote?line.slice(2):line||'\u00a0');
 }
}
export function disposeTextViewers(){for(const state of active)state.abort.abort();active.clear();}
function update(el,c,ctx){
 const previous=states.get(el),url=c.image||'';
 if(previous?.url===url)return;
 previous?.abort.abort();if(previous)active.delete(previous);
 const state={url,abort:new AbortController()};states.set(el,state);
 el.replaceChildren();const body=node('article',undefined,el);body.className='text-viewer-document';
 if(!url){body.textContent=ctx.editing?'Choose text asset':'';return;}
 if(!/^\/api\/assets\/[a-f0-9]{64}\/content(?:\?v=\d+)?$/.test(url)){body.textContent='Choose a text asset from Asset Center.';return;}
 body.textContent='Loading text…';active.add(state);
 fetch(url,{signal:state.abort.signal}).then(response=>{if(!response.ok)throw Error('Unable to load text asset.');return response.text();}).then(text=>{
  if(states.get(el)!==state||!el.isConnected||state.abort.signal.aborted)return;
  if(c.textMarkdown)renderMarkdown(body,text);else {body.textContent=text;body.classList.add('text-viewer-plain');}
 }).catch(error=>{if(error.name!=='AbortError'&&el.isConnected&&states.get(el)===state)body.textContent=error.message;}).finally(()=>active.delete(state));
}
export function textViewerDefinition(common){return {
 label:'Text Viewer',
 props:{textAsset:{label:'Text',type:'textAsset'},...Object.fromEntries(Object.entries(common).filter(([key])=>!['text','textHorizontalAlignment','textVerticalAlignment'].includes(key)))},
 defaults:{width:420,height:280,image:'',imageName:'',textMarkdown:false},
 render:update,update
};}
