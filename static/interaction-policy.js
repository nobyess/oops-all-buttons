const textTypes=new Set(['text','password','search','number','email','url','tel']);
export function allowsTextSelection(target){
 const element=target?.closest?target:target?.parentElement;
 const field=element?.closest?.('input,textarea,[contenteditable]');
 if(!field)return false;
 const tag=field.tagName?.toLowerCase();
 if(tag==='textarea')return true;
 if(tag==='input')return textTypes.has((field.type || 'text').toLowerCase());
 return ['true','','plaintext-only'].includes(field.getAttribute('contenteditable'));
}
export function installInteractionPolicy(root){
 // Cancel browser defaults without stopping our designer, tag, and cell menus.
 const capture={capture:true};
 const context=event=>event.preventDefault();
 const selection=event=>{if(!allowsTextSelection(event.target))event.preventDefault();};
 root.addEventListener('contextmenu',context,capture);
 root.addEventListener('selectstart',selection,capture);
 return ()=>{root.removeEventListener('contextmenu',context,capture);root.removeEventListener('selectstart',selection,capture);};
}
