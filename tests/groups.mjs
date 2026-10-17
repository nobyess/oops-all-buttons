import assert from 'node:assert/strict';
import {createGroup,groupBounds,groupMembers,groupDelta,copyGroup,pasteGroup,ungroup,memberVisible} from '../static/groups.js';
import {cloneControl} from '../static/control-edit.js';
import {evaluateControlEvents} from '../static/visual-events.js';
import {pageTagIds} from '../static/live-subscriptions.js';
import {instantiatePage} from '../static/page-parameters.js';
import {EditHistory} from '../static/edit-history.js';
const page={id:'main',width:1000,height:640,controls:[
 {id:'a',type:'polyline',left:43,top:60,width:100,height:40,points:[[0,0],[1,1]],actions:[{id:'press',tag:'out'}]},
 {id:'other',type:'label',left:600,top:60,width:40,height:40},
 {id:'b',type:'symbol',pinned:true,visible:false,left:243,top:160,width:80,height:80}
]};
const originalA=page.controls.find(c=>c.id==='a'),originalB=page.controls.find(c=>c.id==='b');
const history=new EditHistory();history.ensure(page);
const group=createGroup(page,['a','b'],()=> 'test');history.record(page);
assert.deepEqual(page.controls.map(c=>c.id),['other','a','b']);
assert.deepEqual(groupBounds(page,group.id),{left:43,top:60,width:280,height:180});
assert.deepEqual(groupDelta(groupBounds(page,group.id),37,23,page,20),{x:40,y:20});
const before=groupMembers(page,group.id).map(c=>({left:c.left,top:c.top,points:structuredClone(c.points)}));
for(const c of groupMembers(page,group.id)){c.left+=40;c.top+=20;}
assert.equal(originalB.left-originalA.left,200);assert.equal(originalB.pinned,true);
assert.deepEqual(originalA.points,before[0].points);
assert.equal(groupBounds(page,group.id).left,83);
originalA.left=20;assert.equal(groupBounds(page,group.id).left,20);
group.events=[{id:'hide',tag:'parameter:input',action:'hide',operator:'=',operand:{value:1}}];
page.parameters=[{id:'parameter:input',name:'Input'}];
assert.ok(pageTagIds(page).includes('parameter:input'));
const instance=instantiatePage(page,{'parameter:input':'plc'});
assert.equal(instance.groups[0].events[0].tag,'plc');
const appearance=evaluateControlEvents(instance.groups[0],{plc:{quality:'good',value:1}});
assert.equal(memberVisible(instance.controls.find(c=>c.id==='a'),instance,{[group.id]:appearance}),false);
assert.equal(memberVisible(instance.controls.find(c=>c.id==='other'),instance,{[group.id]:appearance}),true);
assert.equal(memberVisible(instance.controls.find(c=>c.id==='b'),instance,{[group.id]:{visible:true}}),true);
assert.equal(instance.controls.find(c=>c.id==='b').visible,false); // Group Show never mutates member visibility.
let id=0;const target={id:'other-page',width:1000,height:640,controls:[],groups:[]};
const copy=pasteGroup(target,copyGroup(page,group.id),{x:80,y:80},20,()=>String(++id));
assert.notEqual(copy.id,group.id);assert.notEqual(copy.events[0].id,group.events[0].id);
assert.equal(target.parameters.length,1);assert.equal(target.parameters[0].name,'Input');assert.equal(copy.events[0].tag,target.parameters[0].id);
const matched={id:'matched',width:1000,height:640,controls:[],groups:[],parameters:[{id:'parameter:existing',name:'Input'}]};
const matchedCopy=pasteGroup(matched,copyGroup(page,group.id),{x:40,y:40},20,()=>String(++id));assert.equal(matchedCopy.events[0].tag,'parameter:existing');assert.equal(matched.parameters.length,1);
assert.equal(target.controls.length,2);assert.ok(target.controls.every(c=>c.groupId===copy.id));
assert.equal(target.controls[1].pinned,true);assert.equal(target.controls[0].actions[0].tag,'out');
assert.notEqual(target.controls[0].actions[0].id,originalA.actions[0].id);
assert.equal(target.controls[1].left-target.controls[0].left,originalB.left-originalA.left);
const individual=cloneControl(originalA,target,{x:40,y:40},20,()=> 'single');assert.equal(individual.groupId,undefined);
ungroup(target,copy.id);assert.equal(target.groups.length,0);assert.ok(target.controls.every(c=>!c.groupId));
const undo=history.move(page,-1);assert.equal(undo.groups,undefined);const redo=history.move(page,1);assert.equal(redo.groups[0].id,group.id);
console.log('Groups: shared grid movement, pinned/shape integrity, independent visibility, parameters, fresh copy IDs, ungroup, and history passed.');

// The Add to Group dialog can create a named group around one control.
const single={controls:[{id:'solo'}],groups:[]};
assert.equal(createGroup(single,['solo']),null);
const named=createGroup(single,['solo'],()=> 'named',{name:'  Motor Assembly  ',minMembers:1});
assert.equal(named.name,'Motor Assembly');
assert.equal(single.controls[0].groupId,named.id);
