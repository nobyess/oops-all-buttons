// Store optional alpha in standard CSS #RRGGBBAA form.
export function colorOpacity(color) {
  return color?.length === 9 ? Math.round(parseInt(color.slice(7), 16) / 255 * 100) : 100;
}
export function withOpacity(color, percent) {
  const alpha=Math.round(Math.max(0,Math.min(100,Number(percent)||0))*255/100);
  return color.slice(0,7)+(alpha===255?'':alpha.toString(16).padStart(2,'0'));
}
export function colorPicker(title, parent, value, change) {
  const group=document.createElement('div');group.className='color-picker';parent.append(group);
  const label=document.createElement('label');label.textContent=title;group.append(label);
  const color=document.createElement('input');color.type='color';color.value=value.slice(0,7);label.append(color);
  const opacityLabel=document.createElement('label');opacityLabel.textContent='Opacity (%)';group.append(opacityLabel);
  const opacity=document.createElement('input');opacity.type='number';opacity.min=0;opacity.max=100;opacity.step=1;
  opacity.value=colorOpacity(value);opacityLabel.append(opacity);
  const update=()=>{const next=withOpacity(color.value,opacity.value);opacity.value=colorOpacity(next);change(next);};
  color.onchange=opacity.onchange=update;
  return color;
}
