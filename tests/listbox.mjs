import assert from 'node:assert/strict';
import {controls} from '../static/controls.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.selectedIndex=-1;}
 append(child){this.children.push(child);}
 replaceChildren(){this.children=[];this.selectedIndex=-1;}
 querySelector(){return this.children.find(child=>child.role==='listbox');}
 setAttribute(key,value){this[key]=value;}
 focus(){this.focused=true;}
 get value(){return this.tagName==='option'?this._value:this.children[this.selectedIndex]?.value || '';}
 set value(value){this._value=value;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const el=new Element('div'),writes=[];
const c={elements:['One','Two','Three','Four','Five'],touchable:true};
const ctx={editing:false,bindingValue:{quality:'good',value:5},changeIndex:value=>writes.push(value)};
controls.listbox.render(el,c,ctx);
const list=el.querySelector(),selection=()=>list.children.findIndex(row=>row['aria-selected']==='true');
assert.equal(selection(),4);assert.equal(list.children[4].textContent,'Five');
list.children[4].onclick();assert.deepEqual(writes,[]);
list.children[1].onclick();assert.deepEqual(writes,[2]);assert.equal(selection(),4);
// Repainting stale reads cannot cause an optimistic selection flash.
controls.listbox.update(el,c,ctx);assert.equal(selection(),4);
ctx.bindingValue={quality:'good',value:2};controls.listbox.update(el,c,ctx);assert.equal(el.querySelector(),list);assert.equal(selection(),1);
list.children[1].onclick();assert.deepEqual(writes,[2]);
controls.listbox.update(el,{...c,touchable:false},ctx);assert.equal(list['aria-disabled'],'true');list.children[3].onclick();assert.deepEqual(writes,[2]);
controls.listbox.update(el,c,{...ctx,editing:true});list.children[3].onclick();assert.deepEqual(writes,[2]);
controls.listbox.update(el,c,ctx);list.children[1].onkeydown({key:'ArrowDown',preventDefault(){}});assert(list.children[2].focused);assert.equal(selection(),1);
list.children[2].onkeydown({key:'Enter',preventDefault(){}});assert.deepEqual(writes,[2,3]);assert.equal(selection(),1);
for(const value of [0,6,1.5,'bad']){controls.listbox.update(el,c,{...ctx,bindingValue:{quality:'good',value}});assert.equal(selection(),-1);}
controls.listbox.update(el,c,{...ctx,bindingValue:{quality:'bad',value:2}});assert.equal(selection(),-1);
controls.listbox.update(el,{...c,elements:['<script>']},ctx);assert.equal(list.children[0].textContent,'<script>');assert.equal(list.children.length,1);
assert(!controls.listbox.props.text);assert.equal(controls.listbox.props.valueTag.label,'Index tag');
console.log('Listbox index feedback, one-based selection, user-only changes, disabled interaction, stable updates, and invalid indexes passed.');

const protectedControl={...c,requiredRoles:['operator']};
controls.listbox.update(el,protectedControl,{...ctx,canInteract:false,bindingValue:{quality:'good',value:3}});
assert.equal(list['aria-disabled'],'true');assert.equal(selection(),2);const count=writes.length;
list.children[0].onclick();list.children[0].onkeydown({key:'Enter',preventDefault(){}});assert.equal(writes.length,count);
controls.listbox.update(el,protectedControl,{...ctx,canInteract:false,bindingValue:{quality:'good',value:4}});assert.equal(selection(),3);
const {hasAccessRoles}=await import('../static/access-ui.js');
assert(!hasAccessRoles({administrator:false,roles:['operator']},['operator','supervisor']));assert(hasAccessRoles({administrator:false,roles:['operator','supervisor']},['operator','supervisor']));assert(hasAccessRoles({administrator:true,roles:[]},['operator']));assert(hasAccessRoles({administrator:false,roles:[]},[]));
assert.equal(controls.listbox.props.requiredRoles.type,'accessRoles');
console.log('Protected listboxes block mouse/keyboard writes while live read selection continues; all roles are required and administrators bypass.');
