import assert from 'node:assert/strict';
import {confirmMessage,showMessage} from '../static/message-dialog.js';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.isConnected=true;}
 append(child){child.parent=this;this.children.push(child);}
 setAttribute(key,value){this[key]=value;}
 showModal(){this.open=true;}
 close(){this.open=false;this.onclose?.();}
 remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(n=>n!==this);}
 focus(){document.activeElement=this;}
}
globalThis.document={body:new Element('body'),activeElement:new Element('button'),createElement:tag=>new Element(tag)};
const original=document.activeElement;
let result=confirmMessage('Delete this item?',{title:'Delete?',confirmText:'Delete'});
let modal=document.body.children[0];assert.equal(modal.className,'designer-dialog message-dialog');assert.equal(document.activeElement.textContent,'Cancel');
assert.equal(await confirmMessage('Duplicate request'),false);
modal.children[2].children[0].onclick();assert.equal(await result,false);assert.equal(document.activeElement,original);
result=confirmMessage('Discard draft');modal=document.body.children[0];modal.children[2].children[1].onclick();assert.equal(await result,true);assert.equal(document.body.children.length,0);
result=confirmMessage('Cancel with Escape');modal=document.body.children[0];modal.oncancel({preventDefault(){}});assert.equal(await result,false);
result=confirmMessage('Session ends');document.body.children[0].close();assert.equal(await result,false);
result=showMessage('Connection failed');modal=document.body.children[0];modal.children[2].children[0].onclick();await result;assert.equal(document.body.children.length,0);
console.log('Custom dialogs confirm, cancel, dismiss and restore focus.');
