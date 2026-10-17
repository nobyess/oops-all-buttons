const paths={
  left:'M3 5h18 M3 10h11 M3 15h18 M3 20h11',
  center:'M3 5h18 M7 10h10 M3 15h18 M7 20h10',
  right:'M3 5h18 M10 10h11 M3 15h18 M10 20h11',
  justify:'M3 5h18 M3 10h18 M3 15h18 M3 20h18',
  top:'M4 4h16 M12 20V8 M7 13l5-5 5 5',
  middle:'M4 12h16 M12 2v7 M8 5l4 4 4-4 M12 22v-7 M8 19l4-4 4 4',
  bottom:'M4 20h16 M12 4v12 M7 11l5 5 5-5'
};
export function alignmentPicker(title,parent,axis,value,change,justify=false) {
  const group=document.createElement('div');group.className='alignment-picker';
  group.setAttribute('role','group');group.setAttribute('aria-label',title);parent.append(group);
  const label=document.createElement('span');label.textContent=title;group.append(label);
  const row=document.createElement('div');row.className='alignment-buttons';group.append(row);
  const options=axis==='horizontal'?['left','center','right',...(justify?['justify']:[])]:['top','center','bottom'];
  const buttons=[];
  for(const option of options) {
    const button=document.createElement('button');button.type='button';
    const name=option[0].toUpperCase()+option.slice(1);
    button.title=name;button.setAttribute('aria-label',name);
    button.setAttribute('aria-pressed',String(option===value));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',paths[axis==='vertical'&&option==='center'?'middle':option]);svg.append(path);button.append(svg);
    button.onclick=()=>{buttons.forEach(([b,v])=>b.setAttribute('aria-pressed',String(v===option)));change(option);};
    buttons.push([button,option]);row.append(button);
  }
}
