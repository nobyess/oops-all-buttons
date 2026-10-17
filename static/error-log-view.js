// Keep unchanged rows mounted across status refreshes.
const states=new WeakMap();
export function updateErrorLog(parent,entries,node){
 let state=states.get(parent);
 if(!state){state={rows:new Map(),empty:null};states.set(parent,state);}
 const keys=new Set(),scroll=parent.scrollTop;
 for(const [index,entry] of entries.entries()){
  const key=JSON.stringify([entry.origin,entry.message]);keys.add(key);
  let row=state.rows.get(key);
  if(!row){
   const element=node('section',null,parent,{className:'admin-error-entry'});
   node('strong',entry.origin,element);node('p',entry.message,element,{className:'bad'});
   row={element,details:node('p','',element,{className:'hint'})};state.rows.set(key,row);
  }
  const details=`Count: ${Number(entry.count).toLocaleString()} · First: ${new Date(entry.first*1000).toLocaleString()} · Last: ${new Date(entry.last*1000).toLocaleString()}`;
  if(row.details.textContent!==details)row.details.textContent=details;
  if(parent.children[index]!==row.element)parent.insertBefore(row.element,parent.children[index] || null);
 }
 for(const [key,row] of state.rows)if(!keys.has(key)){row.element.remove();state.rows.delete(key);}
 if(entries.length){state.empty?.remove();state.empty=null;}
 else if(!state.empty)state.empty=node('p','No errors recorded.',parent,{className:'hint'});
 parent.scrollTop=scroll;
}
