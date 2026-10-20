import {tagPicker,tagPath} from './tag-selector.js';
import {inlineToken,formatInlineValue} from './inline-format.js';
export function openInlineTagDialog(providers,{getSample,initial={}}={}){
 return new Promise(resolve=>{
  const previous=document.activeElement;
  const make=(tag,text,parent,attrs={})=>{const node=document.createElement(tag);if(text!==null)node.textContent=text;Object.assign(node,attrs);parent?.append(node);return node;};
  const modal=make('dialog',null,document.body,{className:'designer-dialog inline-tag-dialog'});modal.setAttribute('aria-label','Insert Tag');
  const form=make('form',null,modal);make('h2','Insert Tag',form);
  let selected=initial.tag || '',sample=null,finished=false,revision=0;
  const footer=make('div',null,null,{className:'row dialog-footer'});
  const cancel=make('button','Cancel',footer,{type:'button'}),confirm=make('button','Insert Tag',footer,{type:'submit',disabled:!selected});confirm.dataset.dialogDefault='true';
  tagPicker(form,{label:'Tag',value:selected,...providers,onChange:id=>{selected=id;confirm.disabled=!id;loadSample();}});
  const fields=make('div',null,form,{className:'inline-tag-fields'});
  const decimals=make('select',null,make('label','Decimal Places',fields));make('option','As received',decimals,{value:'raw'});
  for(let n=0;n<=15;n++)make('option',String(n),decimals,{value:String(n)});
  decimals.value=String(initial.format?.digits??'raw');
  const minimum=make('input',null,make('label','Minimum Integer Digits',fields),{type:'number',min:1,max:15,step:1,required:true,value:initial.format?.minimumIntegerDigits??1});
  make('p','Pad the number with leading zeros.',form,{className:'hint'});
  const zeros=make('input',null,make('label','Keep Trailing Zeros',form,{className:'checkbox-row'}),{type:'checkbox',checked:initial.format?.trailingZeros!==false});
  const preview=make('section',null,form,{className:'inline-tag-preview'});make('span','Preview',preview);const output=make('strong','Select a tag',preview,{role:'status'});
  const format=()=>({digits:decimals.value==='raw'?null:Number(decimals.value),minimumIntegerDigits:Math.max(1,Math.min(15,Math.trunc(Number(minimum.value)||1))),trailingZeros:zeros.checked});
  function update(){zeros.disabled=decimals.value==='raw';output.textContent=!selected?'Select a tag':sample?.quality==='good'?formatInlineValue(sample.value,format()):'—';}
  async function loadSample(){const epoch=++revision;sample=null;update();if(!selected)return;try{const value=await getSample?.(selected);if(!finished && epoch===revision){sample=value;update();}}catch{if(!finished && epoch===revision){sample=null;update();}}}
  for(const input of [decimals,minimum,zeros])input.oninput=input.onchange=update;
  make('p','Formatting affects this insertion only. Text and boolean values keep their normal display.',form,{className:'hint'});
  form.append(footer);
  function finish(value){if(finished)return;finished=true;revision++;modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);}
  cancel.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};modal.onclose=()=>finish(null);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const tag=providers.getTags().find(tag=>tag.id===selected);if(tag)finish({path:tagPath(tag),format:format(),token:inlineToken(tagPath(tag),format())});};
  modal.showModal();loadSample();
 });
}
