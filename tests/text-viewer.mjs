import assert from 'node:assert/strict';
import {controls} from '../static/controls.js';
import {renderMarkdown,disposeTextViewers,textViewerAppearance} from '../static/text-viewer.js';
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
controls.textviewer.update(el,{image:''},{editing:true});assert.equal(el.children[0].textContent,'Set text content');
let signal;globalThis.fetch=(_,options)=>{signal=options.signal;return new Promise(()=>{});};
controls.textviewer.update(el,control,{});disposeTextViewers();assert(signal.aborted,'Navigation cancels outstanding document reads');
console.log('Text Viewer formatting, safe content, one-time loading, clearing and cleanup passed');

const inline={textSource:'inline',markdownText:'# Own text',image:'',textMarkdown:true};
controls.textviewer.update(el,inline,{});assert(all(el).some(el=>el.tagName==='h1'));const count=reads;
controls.textviewer.update(el,inline,{});assert.equal(reads,count,'Inline Markdown never fetches a text asset');
controls.textviewer.update(el,{...inline,markdownText:'## Changed'},{});assert(all(el).some(el=>el.tagName==='h2'));
assert.equal(controls.textviewer.defaults.textSource,'inline');

assert.equal(controls.textviewer.props.showBorder.label,'Show Border');
assert.equal(controls.textviewer.props.showBackground.default,true);
assert.equal(textViewerAppearance({showBorder:true,showBackground:false}).border,'1px solid #cbd5e1');
assert.equal(textViewerAppearance({showBorder:true,showBackground:false}).background,'transparent');
assert.equal(textViewerAppearance({showBorder:false,backColor:'#123456'}).border,'none');
assert.equal(textViewerAppearance({showBorder:false,backColor:'#123456'}).background,'#123456');
assert.equal(textViewerAppearance({}).border,'','Legacy viewers keep their existing border behavior');

assert.equal(controls.textviewer.props.bold,undefined);
assert.equal(controls.textviewer.props.italic,undefined);
assert.equal(textViewerAppearance({bold:true,italic:true}).fontWeight,'400');
assert.equal(textViewerAppearance({bold:true,italic:true}).fontStyle,'normal');
