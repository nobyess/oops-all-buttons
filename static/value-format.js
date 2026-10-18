// Presentation only: retain native types in caches, formulas, and driver writes.
export function displayValue(value) {
  return typeof value==='boolean'?(value?'1':'0'):String(value??'');
}

export function numericDisplayValue(sample,digits=2,unitText=''){
  const unit=String(unitText ?? '').trim(),suffix=unit?' '+unit:'';
  if(sample?.quality!=='good' || !['number','boolean'].includes(typeof sample.value) || !Number.isFinite(Number(sample.value)))return '—'+suffix;
  const places=Math.max(0,Math.min(15,Math.trunc(Number(digits)||0)));
  return Number(sample.value).toFixed(places)+suffix;
}
