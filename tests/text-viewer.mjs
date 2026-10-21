import assert from 'node:assert/strict';
import {controls} from '../static/controls.js';
import {renderMarkdown,disposeTextViewers} from '../static/text-viewer.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.isConnected=true;this.classList={add(){}};}
 append(child){this.children.push(child);}replaceChildren(){this.children=[];this.textContent='';}
}
globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
const root=new Element('div'),all=el=>[el,...(el.children||[]).flatMap(all)];
renderMarkdown(root,'# Title\n## Two\n### Three\n**bold** *italic* `code`\n> quote\n---\n[Page](#runtime/main)\n![Photo](/api/images/'+ 'a'.repeat(64)+')\n<script>alert(1)</script>\n[Bad](javascript:alert)\n![Remote](https://example.com/image.png)');
const nodes=all(root);for(const tag of ['h1','h2','h3','strong','em','code','blockquote','hr','a','img'])assert(nodes.some(el=>el.tagName===tag),tag);
assert(!nodes.some(el=>el.tagName==='script'));assert.equal(nodes.filter(el=>el.tagName==='img').length,1);assert.equal(nodes.filter(el=>el.tagName==='a').length,1);
assert.equal(controls.textviewer.props.text,undefined,'No editable content / Set Content event');assert.equal(controls.textviewer.props.textAsset.type,'textAsset');
let reads=0;globalThis.fetch=async()=>{reads++;return {ok:true,text:async()=> '# Loaded'};};
const el=new Element('div'),control={image:'/api/assets/'+'b'.repeat(64)+'/content?v=1',textMarkdown:true};
controls.textviewer.render(el,control,{});await new Promise(resolve=>setImmediate(resolve));
assert(all(el).some(el=>el.tagName==='h1'));controls.textviewer.update(el,control,{});assert.equal(reads,1,'Live updates do not refetch unchanged documents');
controls.textviewer.update(el,{image:''},{editing:true});assert.equal(el.children[0].textContent,'Choose text asset');
let signal;globalThis.fetch=(_,options)=>{signal=options.signal;return new Promise(()=>{});};
controls.textviewer.update(el,control,{});disposeTextViewers();assert(signal.aborted,'Navigation cancels outstanding document reads');
console.log('Text Viewer formatting, safe content, one-time loading, clearing and cleanup passed');
