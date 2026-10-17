// Keep the decision separate from saving/navigation so Cancel never mutates the page.
export function confirmPageLeave(name){return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='page-leave-dialog';
  const title=document.createElement('h2');title.textContent='Unsaved Changes';
  const text=document.createElement('p');text.textContent=`Save changes to ${name || 'this page'} before continuing?`;
  const footer=document.createElement('div');footer.className='row dialog-footer';
  function finish(choice){modal.close();modal.remove();resolve(choice);}
  for(const [label,choice] of [['Cancel','cancel'],['Discard','discard'],['Save & Continue','save']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.onclick=()=>finish(choice);footer.append(button);
  }
  modal.append(title,text,footer);document.body.append(modal);
  modal.oncancel=event=>{event.preventDefault();finish('cancel');};modal.showModal();
});}
