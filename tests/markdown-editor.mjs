import assert from 'node:assert/strict';
import {markdownEdit,markdownEditor} from '../static/markdown-editor.js';
assert.equal(markdownEdit('hello',0,5,'bold').text,'**hello**');
assert.equal(markdownEdit('**hello**',0,9,'bold').text,'hello');
assert.equal(markdownEdit('**hello**',2,7,'bold').text,'hello');
assert.equal(markdownEdit('one\ntwo',5,6,'heading').text,'one\n# two');
assert.equal(markdownEdit('one\ntwo',0,7,'quote').text,'> one\n> two');
assert.equal(markdownEdit('> one\n> two',0,11,'quote').text,'one\ntwo');
assert.equal(markdownEdit('abc',1,1,'italic').text,'a*bc');
assert.equal(markdownEdit('abc',0,3,'code').text,'`abc`');
assert.equal(markdownEdit('abc',3,3,'rule').text,'abc\n\n---\n\n');
assert.equal(markdownEdit('abc',0,3,'[Home](#runtime/main)').text,'[Home](#runtime/main)');
console.log('Markdown insertion and toggle tests passed');

// Typing after toolbar inserts must append at the caret, never replace the insertion.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.isConnected=true;}
 append(child){this.children.push(child);}setAttribute(){}focus(){this.focused=true;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const host=new Element('section');let changed='';
const editor=markdownEditor(host,{api:async()=>[],onChange:value=>{changed=value;}});
const toolbar=host.children[0].children[0];
for(const title of ['Heading','Bold','Italic','Blockquote','Code','Horizontal rule']){
 editor.input.value='';editor.input.setSelectionRange(0,0);
 await toolbar.children.find(button=>button.title===title).onclick();
 const inserted=editor.input.value;
 assert.equal(editor.input.selectionStart,inserted.length,title+' leaves caret after insertion');
 assert.equal(editor.input.selectionEnd,inserted.length,title+' leaves nothing selected');
 assert.equal(changed,inserted);
 editor.input.value=inserted.slice(0,editor.input.selectionStart)+'continued'+inserted.slice(editor.input.selectionEnd);
 assert.equal(editor.value,inserted+'continued');
}
console.log('Markdown toolbar retains a collapsed caret after inserting syntax');

let headingText='Heading text';
for(const expected of ['# Heading text','## Heading text','### Heading text','Heading text']){
 const result=markdownEdit(headingText,headingText.length,headingText.length,'heading');
 assert.equal(result.text,expected);headingText=result.text;
}
editor.input.value='Title';editor.input.setSelectionRange(5,5);
for(const expected of ['# Title','## Title','### Title','Title']){
 await toolbar.children.find(button=>button.title==='Heading').onclick();
 assert.equal(editor.value,expected);
 assert.equal(editor.input.selectionStart,expected.length);
 assert.equal(editor.input.selectionEnd,expected.length);
}
assert.equal(markdownEdit('one\ntwo',0,7,'heading').text,'# one\n# two');
console.log('Heading button cycles levels 1–3 and plain text without selecting the insertion');
