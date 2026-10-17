import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function renderControl('),source.indexOf('function geometry('));
function fixture(selected,modifiers={}){
 const member={id:'member',type:'label',groupId:'group',left:10,top:20,width:100,height:40};
 const page={id:'page',groups:[{id:'group',type:'group'}],controls:[member]};
 let groupSelected=0,groupDrags=0,commits=0,refreshes=0;
 const el={dataset:{},classList:{add(){}},setPointerCapture(){}};
 const canvas={refreshSelection(control){assert.equal(control,member);refreshes++;},selectGroup(event,group){assert.equal(group.id,'group');groupSelected++;return {onpointerdown(){groupDrags++;}};},querySelector(){return null;},querySelectorAll(){return [];}};
 const build=new Function('node','paint','selected','page','editing','markChanged',code+';return renderControl;');
 const render=build(()=>el,()=>{},selected,page,true,()=>commits++);
 render(canvas,member,page,true);
 el.onpointerdown({...modifiers,button:0,target:{dataset:{}},preventDefault(){},stopPropagation(){},pointerId:1});
 return {groupSelected,groupDrags,el,finish(){el.onpointerup();return {commits,refreshes};}};
}
const canvasClick=fixture('@page');
assert.equal(canvasClick.groupSelected,1);
assert.equal(canvasClick.groupDrags,1,'first click starts group drag without requiring a second click');
const explorerMember=fixture('member');
assert.equal(explorerMember.groupSelected,0);
assert.equal(typeof explorerMember.el.onpointermove,'function','Explorer-selected member gets individual movement and resizing');
console.log('Group canvas selection tests passed');

assert.equal(fixture('@page',{ctrlKey:true}).groupSelected,1,'Ctrl-click follows normal group selection');
assert.equal(fixture('member',{metaKey:true}).groupSelected,0,'Modifier keys preserve individual Explorer selection');

assert.deepEqual(explorerMember.finish(),{commits:1,refreshes:1},'Finishing a move refreshes selection without a route rebuild');
