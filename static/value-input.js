export function inputValue(text,{minimum=0,maximum=100,allowDecimal=false}) {
  const min=Number(minimum),max=Number(maximum);
  if(!Number.isFinite(min)||!Number.isFinite(max)||min>max)throw new Error('Invalid minimum or maximum.');
  const pattern=allowDecimal?/^-?(?:\d+(?:\.\d*)?|\.\d+)$/:/^-?\d+$/;
  if(!pattern.test(String(text)))throw new Error(allowDecimal?'Enter a number.':'Enter a whole number.');
  const value=Number(text);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Enter a value from ${min} to ${max}.`);
  return value;
}
export function openValueInput(settings,{name='',value}={}) {
  return new Promise(resolve=>{
    function el(tag,text,parent,props={}){const e=document.createElement(tag);if(text!==null)e.textContent=text;Object.assign(e,props);parent?.append(e);return e;}
    const heading=String(settings.prompt || '').trim() || 'Value Input';
    const modal=el('dialog',null,document.body,{className:'value-input-dialog'});modal.setAttribute('aria-label',heading);
    const form=el('form',null,modal);el('h2',heading,form);
    const min=Number(settings.minimum ?? 0),max=Number(settings.maximum ?? 100);
    el('p',`Minimum: ${min} · Maximum: ${max}`,form,{className:'hint'});
    const label=el('label','Value',form),input=el('input',null,label,{type:'text',inputMode:settings.allowDecimal?'decimal':'numeric',autocomplete:'off',required:true});

    const error=el('p','',form,{className:'value-input-error',role:'alert'});
    let last='';
    if(value!==undefined){try{inputValue(String(value),settings);last=String(value);}catch{}}
    input.value=last;
    const validDraft=text=>(settings.allowDecimal?/^-?\d*(?:\.\d*)?$/:/^-?\d*$/).test(text) && (min<0 || !text.startsWith('-'));
    input.onbeforeinput=event=>{
      if(event.data && !validDraft(input.value.slice(0,input.selectionStart ?? input.value.length)+event.data+input.value.slice(input.selectionEnd ?? input.value.length)))event.preventDefault();
    };
    input.oninput=()=>{if(validDraft(input.value))last=input.value;else input.value=last;error.textContent='';};
    const footer=el('div',null,form,{className:'row dialog-footer'}),cancel=el('button','Cancel',footer,{type:'button'});el('button','Write',footer,{type:'submit'});
    function finish(result){modal.close();modal.remove();resolve(result);}
    cancel.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};
    form.onsubmit=event=>{event.preventDefault();try{finish(inputValue(input.value,settings));}catch(e){error.textContent=e.message;input.focus();}};
    modal.showModal();input.focus();input.select?.();
  });
}
