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
// Footer arrow navigation must not turn a deliberately chosen Cancel into OK.
let arrowHandler,focus=null;const clicks=[];
const arrowRoot={addEventListener:(name,fn)=>arrowHandler=fn,removeEventListener(){}};
const footer={querySelectorAll:()=>actions};
const arrowModal={querySelectorAll:()=>actions,dispatchEvent:()=>false};
function action(text,extra={}){const button={textContent:text,type:'button',dataset:{},disabled:false,hidden:false,
 closest(selector){return selector==='button'?button:selector==='.dialog-footer'?footer:arrowModal;},
 getClientRects(){return button.invisible?[]:[{}];},focus(){focus=button;},click(){clicks.push(text);},...extra};return button;}
const actions=[action('Cancel'),action('Unavailable',{disabled:true}),action('Hidden',{hidden:true}),action('Invisible',{invisible:true}),action('OK')];
installDialogKeyboard(arrowRoot);
function arrowKey(key,target=focus,extra={}){const event={key,target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};arrowHandler(event);return event;}
focus=actions[0];arrowKey('Enter');assert.deepEqual(clicks,['OK'],'Initial Enter retains the default confirmation');
assert(arrowKey('ArrowRight').defaultPrevented);assert.equal(focus,actions[4]);
arrowKey('ArrowRight');assert.equal(focus,actions[0],'Right wraps and skips unavailable buttons');
arrowKey('Enter');assert.deepEqual(clicks,['OK','Cancel']);
arrowKey('ArrowLeft');assert.equal(focus,actions[4]);arrowKey('Enter');assert.deepEqual(clicks,['OK','Cancel','OK']);
for(const tagName of ['INPUT','TEXTAREA','SELECT']){
 const field={tagName,closest:selector=>selector==='dialog[open]'?arrowModal:null};
 assert(!arrowKey('ArrowLeft',field).defaultPrevented);assert(!arrowKey('ArrowRight',field).defaultPrevented);
}
assert(!arrowKey('ArrowRight',focus,{shiftKey:true}).defaultPrevented);
const priorFocus=focus;arrowKey('ArrowRight',focus,{defaultPrevented:true});assert.equal(focus,priorFocus);
console.log('Dialog arrows wrap, skip hidden/disabled actions, confirm the chosen button and preserve field navigation.');
