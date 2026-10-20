import {assetNode as node} from './asset-ui.js';
// The select always starts blank, so opening it offers every category even
// when the editable field already contains a different name.
export function categoryInput(parent,{value='General',categories=[]}={}){
 const label=node('label','Category',parent,{className:'asset-field'}),row=node('div',null,label,{className:'category-combo'});
 const input=node('input',null,row,{type:'text',value,required:true,maxLength:100});input.setAttribute('aria-label','Category');
 const select=node('select',null,row);select.setAttribute('aria-label','Choose existing category');
 input.setCategories=values=>{select.replaceChildren();node('option','',select,{value:''});for(const name of [...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))].sort((a,b)=>a.localeCompare(b)))node('option',name,select,{value:name});select.value='';};
 select.onchange=()=>{if(!select.value)return;input.value=select.value;select.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();};
 input.setCategories(categories);return input;
}
