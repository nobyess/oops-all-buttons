import assert from 'node:assert/strict';
import {installDialogKeyboard} from '../static/dialog-keyboard.js';
let handler,confirmed=0,cancelled=0;
const root={addEventListener:(name,fn)=>handler=fn,removeEventListener(){}};
const modal={querySelectorAll:()=>[cancel,save],dispatchEvent(){cancelled++;return false;}};
const cancel={textContent:'Cancel',type:'button',closest:()=>modal,click(){throw Error('Enter must not cancel');}};
const save={textContent:'Save & Continue',type:'button',dataset:{},closest:()=>modal,click(){confirmed++;}};cancel.dataset={};
installDialogKeyboard(root);
function key(key,extra={}){const event={key,target:{tagName:'INPUT',closest:()=>modal},preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};handler(event);return event;}
assert(key('Enter').defaultPrevented);assert.equal(confirmed,1);
key('Escape');assert.equal(cancelled,1);
key('Enter',{isComposing:true});key('Enter',{repeat:true});assert.equal(confirmed,1);
key('Enter',{shiftKey:true,target:{tagName:'TEXTAREA',closest:()=>modal}});assert.equal(confirmed,1);
key('Enter',{target:{tagName:'TEXTAREA',closest:()=>modal}});assert.equal(confirmed,2);
save.disabled=true;key('Enter');assert.equal(confirmed,2);
console.log('Dialog Enter/Escape behavior and multiline exception verified.');
