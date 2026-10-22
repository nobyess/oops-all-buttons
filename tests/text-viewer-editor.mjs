import assert from 'node:assert/strict';
import {openTextViewerEditor} from '../static/text-viewer-editor.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.isConnected=true;this.value='';this.classList={toggle:(name,value)=>{this[name]=value;}};}
 replaceChildren(){this.children=[];}
 append(child){child.parent=this;this.children.push(child);}
 setAttribute(key,value){this.attributes[key]=value;}
 getBoundingClientRect(){return {left:0,top:0,width:600,height:500};}
 showModal(){this.open=true;}
 close(){this.open=false;this.onclose?.();}
 remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(el=>el!==this);}
 focus(){}setSelectionRange(){}
}
const body=new Element('body');
let listeners=0;
globalThis.window={innerWidth:1000,innerHeight:800,addEventListener(){listeners++;},removeEventListener(){listeners--;}};
globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const all=el=>[el,...el.children.flatMap(all)];
const find=text=>all(body).find(el=>el.textContent===text);
const submit=()=>all(body).find(el=>el.tagName==='form').onsubmit({preventDefault(){}});
const input=()=>all(body).find(el=>el.tagName==='textarea');
const original={textSource:'inline',markdownText:'# Original',image:''};
let pending=openTextViewerEditor(original,{api:async()=>[]});
assert(find('Markdown').active);assert(!find('Assets').active);assert.equal(input().value,'# Original');
input().value='# Draft';find('Assets').onclick();submit();assert(find('Select a text asset.'));
find('Markdown').onclick();assert.equal(input().value,'# Draft');submit();
const result=await pending;assert.equal(result.markdownText,'# Draft');assert.equal(result.image,'');assert.equal(original.markdownText,'# Original');assert.equal(listeners,0);
pending=openTextViewerEditor({image:'/api/assets/example/content',imageName:'Existing notes',textMarkdown:false},{api:async()=>[]});
assert(find('Assets').active);submit();assert.equal((await pending).textSource,'asset');
pending=openTextViewerEditor(original,{api:async()=>[]});input().value='Cancelled';find('Cancel').onclick();assert.equal(await pending,null);assert.equal(original.markdownText,'# Original');
pending=openTextViewerEditor(original,{api:async()=>[]});body.children[0].oncancel({preventDefault(){}});assert.equal(await pending,null);assert.equal(listeners,0);
assert.equal(body.children.length,0);
console.log('Text Viewer editor tabs, local drafts, validation, save/cancel, legacy assets and listener cleanup passed.');

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const assets=[{id:'a',kind:'text',name:'Operator notes',category:'General',filename:'notes.md',url:'/api/assets/a/content'},
 {id:'b',kind:'text',name:'Checklist',category:'Operations',filename:'list.txt',url:'/api/assets/b/content'},
 {id:'c',kind:'image',name:'Hidden image',category:'Images',url:'/api/images/c'}];
pending=openTextViewerEditor(original,{api:async()=>assets});await settle();
find('Assets').onclick();assert.equal(body.children.length,1,'Assets are embedded, not a second dialog');
assert(!all(body).some(el=>el.type==='file'));assert(!find('Select Content'));assert(!find('Choose File'));
assert(find('Operator notes'));assert(find('Checklist'));assert(!find('Hidden image'));
const filters=all(body).find(el=>el.type==='search');filters.value='Checklist';filters.oninput();assert(!find('Operator notes'));assert(find('Checklist'));
find('Checklist').parent.onclick();find('Markdown').onclick();assert.equal(input().value,'# Original');find('Assets').onclick();submit();
const selected=await pending;assert.equal(selected.image,'/api/assets/b/content');assert.equal(selected.textMarkdown,false);assert.equal(listeners,0);
let resolveAssets;
pending=openTextViewerEditor(original,{api:()=>new Promise(resolve=>{resolveAssets=resolve;})});find('Cancel').onclick();await pending;resolveAssets(assets);await settle();assert.equal(body.children.length,0,'Closed editor ignores late catalog responses');
