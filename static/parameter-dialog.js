import {randomId} from './uuid.js';
// Draft dialogs: Cancel leaves the page/action untouched.
function el(tag,text,parent,attrs={}){const n=document.createElement(tag);if(text!==null)n.textContent=text;Object.assign(n,attrs);parent?.append(n);return n;}
export function configureParameters(parameters=[]){return new Promise(resolve=>{
  const draft=structuredClone(parameters),modal=el('dialog',null,document.body,{className:'designer-dialog parameter-dialog parameter-config-dialog'});
  const header=el('div',null,modal,{className:'parameter-config-header'});
  el('h2','Configure Parameters',header);
  const list=el('div',null,modal,{className:'parameter-list'});
  const error=el('p','',modal,{className:'error',role:'status'});
  function render(){list.replaceChildren();
    const headings=el('div',null,list,{className:'parameter-column-headings'});
    el('span','Name',headings);el('span','Description',headings);el('span','',headings);
    if(!draft.length)el('p','No parameters. Add one to create a reusable tag connection.',list,{className:'hint'});
    for(const parameter of draft){
      const row=el('div',null,list,{className:'parameter-row'});
      const name=el('input',null,row,{value:parameter.name,type:'text',placeholder:'Name'});name.setAttribute('aria-label','Name');
      name.oninput=()=>parameter.name=name.value;
      const description=el('input',null,row,{value:parameter.description || '',type:'text',placeholder:'Description'});description.setAttribute('aria-label','Description');
      description.oninput=()=>parameter.description=description.value;
      el('button','Remove',row,{type:'button'}).onclick=()=>{draft.splice(draft.indexOf(parameter),1);render();};
    }
  }
  el('button','Add Parameter',header,{type:'button'}).onclick=()=>{draft.push({id:'parameter:'+randomId(),name:'',description:''});render();list.lastElementChild?.querySelector('input')?.focus();};
  const footer=el('div',null,modal,{className:'row dialog-footer'});
  function finish(result){modal.close();modal.remove();resolve(result);}
  el('button','Cancel',footer,{type:'button'}).onclick=()=>finish(null);
  el('button','Save',footer,{type:'button'}).onclick=()=>{
    const names=new Set();
    for(const p of draft){p.name=p.name.trim();if(!p.name || /[\\{}\r\n]/.test(p.name)){error.textContent='Enter a name without backslashes, braces, or line breaks.';return;}if(names.has(p.name.toLowerCase())){error.textContent='Parameter names must be unique.';return;}names.add(p.name.toLowerCase());}
    finish(draft);
  };
  modal.oncancel=e=>{e.preventDefault();finish(null);};render();modal.showModal();
});}
export function connectParameters(destination,connections={},makePicker){return new Promise(resolve=>{
  const draft={...connections},modal=el('dialog',null,document.body,{className:'designer-dialog parameter-dialog parameter-connect-dialog'});
  el('h2','Connect Parameters — '+destination.name,modal);
  const list=el('div',null,modal,{className:'parameter-list'});
  for(const parameter of destination.parameters || []){
    const row=el('section',null,list,{className:'parameter-connection'});
    const info=el('div',null,row,{className:'parameter-info'});
    el('strong',parameter.name,info);if(parameter.description)el('p',parameter.description,info,{className:'hint'});
    const picker=el('div',null,row,{className:'parameter-picker'});
    makePicker(picker,parameter.name,draft[parameter.id] || '',id=>draft[parameter.id]=id);
  }
  if(!destination.parameters?.length)el('p','This page has no parameters.',list,{className:'hint'});
  const footer=el('div',null,modal,{className:'row dialog-footer'});
  function finish(result){modal.close();modal.remove();resolve(result);}
  el('button','Cancel',footer,{type:'button'}).onclick=()=>finish(null);
  el('button','Save',footer,{type:'button'}).onclick=()=>finish(Object.fromEntries((destination.parameters || []).map(p=>[p.id,draft[p.id] || ''])));
  modal.oncancel=e=>{e.preventDefault();finish(null);};modal.showModal();
});}
