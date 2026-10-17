const title=value=>String(value || '').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const tag=value=>value || '[Select Tag]';
export function actionText(item,pages=[],target=item.tag,value=item.value ?? 1) {
  const name=tag(target);
  switch(item.action) {
    case 'set': return `Set ${name} To ${value}`;
    case 'increment': return `Increment ${name} By ${value}`;
    case 'decrement': return `Decrement ${name} By ${value}`;
    case 'toggle': return `Toggle ${name}`;
    case 'value_input': return `Enter Value For ${name}`;
    case 'navigate': return `Go To ${pages.find(p=>p.id===item.page)?.name || '[Select Page]'}`;
    case 'popup': return `Open ${pages.find(p=>p.id===item.page)?.name || '[Select Page]'} As Popup (${item.position==='mouse'?'Mouse Location':'Centered'})`;
    default: return title(item.action) || '[Select Action]';
  }
}
export function actionLabel(item,pages=[]) {
  return `${title(item.trigger || 'click')} → ${actionText(item,pages)}`;
}
export function eventLabel(item) {
  const operand=o=>o?.kind==='tag'?tag(o.tag):String(o?.value ?? 0);
  const lower=operand(item.operand || {value:item.value ?? 0});
  const comparisons={'=':'=','!=':'!=','<':'<','>':'>'};
  const range=['range','within_range','out_of_range'].includes(item.operator);
  const condition=range
    ? `${item.operator==='out_of_range'?'Is Outside':'Is Within'} ${lower} To ${operand(item.end_operand || {value:item.upper ?? 100})}`
    : `${comparisons[item.operator] || title(item.operator)} ${lower}`;
  const effect={spin:`Spin (${item.rpm ?? 10} RPM)`,show:'Show',hide:'Hide',set_colors:'Set Colors',close_popup:'Close (Popup Only)',set_content:`Set Content To ${JSON.stringify(item.content ?? '')}`}[item.action]
    || actionText(item,[],item.target,item.amount ?? 1);
  return `${tag(item.tag)} ${condition} → ${effect}`;
}
