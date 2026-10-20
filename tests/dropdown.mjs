import assert from 'node:assert/strict';
import {dropdownDefinition} from '../static/dropdown.js';
class Element{
 constructor(){this.children=[];this.dataset={};this.value='';this.style={setProperty(){}};}
 append(child){this.children.push(child);}
 replaceChildren(){this.children=[];}
 querySelector(){return this.children[0];}
 setAttribute(key,value){this[key]=value;}
}
globalThis.document={createElement:()=>new Element()};
const definition=dropdownDefinition({text:{},fontSize:{}}),el=new Element(),writes=[];
const c={name:'Mode',elements:['Off','Auto','Manual']};
const ctx={bindingValue:{quality:'good',value:1},changeIndex:index=>writes.push(index)};
definition.render(el,c,ctx);const select=el.querySelector();
let disabledWrites=0,disabledState=select.disabled;
Object.defineProperty(select,'disabled',{get:()=>disabledState,set:value=>{disabledWrites++;disabledState=value;}});
for(let tick=0;tick<10;tick++)definition.update(el,c,ctx);
assert.equal(disabledWrites,0,'Live ticks must not mutate unchanged disabled state on a native popup');
assert.equal(select.value,'1');assert.equal(select.children[2].textContent,'Manual');
select.value='2';select.onchange();assert.deepEqual(writes,[2]);assert.equal(select.value,'1');
definition.update(el,c,{...ctx,bindingValue:{quality:'good',value:2}});assert.equal(select.value,'2');assert.equal(el.querySelector(),select);
for(const value of [-1,3,1.5,'bad']){definition.update(el,c,{...ctx,bindingValue:{quality:'good',value}});assert.equal(select.selectedIndex,-1);}
for(const flags of [{editing:true},{canInteract:false}]){definition.update(el,c,{...ctx,...flags});select.value='1';select.onchange();assert.equal(select.disabled,true);}
definition.update(el,{...c,touchable:false},ctx);select.value='1';select.onchange();assert.deepEqual(writes,[2]);
definition.update(el,{...c,elements:['<script>']},{...ctx,bindingValue:{quality:'bad',value:1}});assert.equal(select.children[0].textContent,'<script>');assert.equal(select.selectedIndex,-1);
assert.equal(definition.props.valueTag.label,'Index tag');assert.equal(definition.props.requiredRoles.type,'accessRoles');
definition.update(el,c,{...ctx,bindingValue:{quality:'good',value:false}});assert.equal(select.value,'0');assert.equal(select.children[0].value,'0');
select.value='1';select.onchange();assert.equal(writes.at(-1),1);assert.equal(select.value,'0');
definition.update(el,c,{...ctx,bindingValue:{quality:'good',value:true}});assert.equal(select.value,'1');
assert(!Object.hasOwn(definition.props,'indexBase'));
select.onpointerdown();select.value='0';
definition.update(el,c,{...ctx,bindingValue:{quality:'good',value:1}});assert.equal(select.value,'0');
definition.update(el,c,{...ctx,bindingValue:{quality:'good',value:2}});assert.equal(select.value,'0');assert.equal(select.liveLabel.textContent,'Manual');
select.onblur();assert.equal(select.value,'2');
select.onfocus();select.value='0';definition.update(el,c,ctx);select.onkeydown({key:'Escape'});assert.equal(select.value,'1');
console.log('Dropdown supports zero-based Boolean feedback and zero-based selection, with authorized writes only.');
