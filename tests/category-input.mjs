import assert from 'node:assert/strict';
import {categoryInput} from '../static/category-input.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};}
 append(child){this.children.push(child);}replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}
 dispatchEvent(event){this.lastEvent=event;this.oninput?.(event);return true;}focus(){this.focused=true;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const root=new Element('section');
const field=categoryInput(root,{value:'Imported',categories:['HVAC','Valves','HVAC',' Operations ']});
const select=root.children[0].children[0].children[1];
assert.deepEqual(select.children.map(item=>item.value),['','HVAC','Operations','Valves']);
assert.equal(field.value,'Imported');assert.equal(select.value,'','Unfiltered chooser starts blank regardless of text');
let changed=0;field.oninput=()=>changed++;
select.value='HVAC';select.onchange();
assert.equal(field.value,'HVAC');assert.equal(select.value,'');assert(field.focused);assert.equal(changed,1);
field.value='Custom Category';field.setCategories(['New Category']);assert.equal(field.value,'Custom Category');
select.value='New Category';select.onchange();assert.equal(field.value,'New Category');assert.equal(changed,2);
console.log('Category chooser replaces text, emits normal change tracking, and retains freely typed new categories.');
