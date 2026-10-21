import {assetNode as node} from './asset-ui.js';
import {openContentPicker} from './content-picker.js';

export function markdownEdit(text,start,end,action){
 const selected=text.slice(start,end),wrap={bold:'**',italic:'*',code:'`'}[action];
 let replacement=selected;
 if(wrap){
  if(selected.startsWith(wrap)&&selected.endsWith(wrap)&&selected.length>=wrap.length*2)replacement=selected.slice(wrap.length,-wrap.length);
  else if(text.slice(start-wrap.length,start)===wrap&&text.slice(end,end+wrap.length)===wrap){start-=wrap.length;end+=wrap.length;replacement=selected;}
  else replacement=selected?wrap+selected+wrap:wrap;
 }else if(action==='heading'||action==='quote'){
  start=text.lastIndexOf('\n',start-1)+1;const next=text.indexOf('\n',end);end=next<0?text.length:next;
  replacement=text.slice(start,end).split('\n').map(line=>{
   if(action==='heading'){
    const heading=line.match(/^(#{1,3}) /);
    return heading?(heading[1].length===3?line.slice(4):'#'+line):'# '+line;
   }
   return line.startsWith('> ')?line.slice(2):'> '+line;
  }).join('\n');
 }else if(action==='rule')replacement='\n\n---\n\n';
 else replacement=action;
 return {text:text.slice(0,start)+replacement+text.slice(end),start,end:start+replacement.length};
}

function pageLink(api,label){return new Promise(resolve=>{
 const previous=document.activeElement;
 const modal=node('dialog',null,document.body,{className:'designer-dialog inline-tag-dialog markdown-link-dialog'});modal.setAttribute('aria-label','Insert Page Link');
 const form=node('form',null,modal);node('h2','Insert Page Link',form);const field=title=>node('label',title,form);
 const page=node('select',null,field('Page'),{required:true}),caption=node('input',null,field('Link text'),{value:label,maxLength:200});
 const status=node('p','Loading pages…',form,{role:'status'}),footer=node('div',null,form,{className:'row dialog-footer'});
 const cancel=node('button','Cancel',footer,{type:'button'}),insert=node('button','Insert Link',footer,{type:'submit',disabled:true});insert.dataset.dialogDefault='true';
 let finished=false;const finish=result=>{if(finished)return;finished=true;modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);};
 cancel.onclick=()=>finish(null);modal.oncancel=e=>{e.preventDefault();finish(null);};modal.onclose=()=>finish(null);
 form.onsubmit=e=>{e.preventDefault();if(!insert.disabled&&form.reportValidity())finish('['+(caption.value.trim()||page.selectedOptions[0].textContent).replace(/[\[\]\\]/g,'\\$&')+'](#runtime/'+encodeURIComponent(page.value)+')');};
 modal.showModal();
 api('pages').then(pages=>{if(finished)return;for(const item of pages)node('option',item.name,page,{value:item.id});insert.disabled=!pages.length;status.textContent=pages.length?'':'Create a page first.';}).catch(error=>{if(!finished)status.textContent=error.message;});
});}

export function markdownEditor(parent,{api,value='',onChange=()=>{}}){
 const root=node('div',null,parent,{className:'markdown-editor'}),toolbar=node('div',null,root,{className:'markdown-toolbar'});toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Markdown formatting');
 const input=node('textarea',null,root,{value,spellcheck:true});input.setAttribute('aria-label','Markdown source');
 input.oninput=()=>onChange(input.value);
 input.onkeydown=e=>{if(e.key==='Enter')e.stopPropagation();};
 for(const [action,title,glyph] of [['heading','Heading','H'],['bold','Bold','B'],['italic','Italic','I'],['quote','Blockquote','❯'],['code','Code','</>'],['rule','Horizontal rule','―'],['link','Link','↗'],['image','Image','▧']]){
  const button=node('button',glyph,toolbar,{type:'button',title});button.setAttribute('aria-label',title);
  button.onmousedown=e=>e.preventDefault();
  button.onclick=async()=>{
   const start=input.selectionStart,end=input.selectionEnd;let command=action;
   try{
    if(action==='link')command=await pageLink(api,input.value.slice(start,end));
    if(action==='image'){const asset=await openContentPicker({api,kind:'image'});command=asset?'!['+asset.name.replace(/[\[\]\\]/g,'\\$&')+']('+asset.url+')':null;}
    if(command===null||!root.isConnected)return;
    const result=markdownEdit(input.value,start,end,command);input.value=result.text;input.focus();input.setSelectionRange(result.end,result.end);onChange(input.value);
   }catch(error){status.textContent=error.message;}
  };
 }
 const status=node('p','',root,{role:'status',className:'hint'});
 return {input,get value(){return input.value;}};
}
