import {displayValue} from './value-format.js';
export function parseInlineToken(raw){
 const match=String(raw).match(/^(.*)\|dp=(raw|\d{1,2});min=(\d{1,2});zeros=([01])$/);
 if(!match || !match[1] || Number(match[3])<1 || Number(match[3])>15 || match[2]!=='raw' && Number(match[2])>15)return {path:raw,format:null};
 return {path:match[1],format:{digits:match[2]==='raw'?null:Number(match[2]),minimumIntegerDigits:Number(match[3]),trailingZeros:match[4]==='1'}};
}
// Bound every formatting entry point, including previews and stored settings.
function normalizeFormat(format){
 format=format || {};
 const bounded=(value,fallback,min)=>{
  const number=Number(value);
  return Number.isFinite(number)?Math.max(min,Math.min(15,Math.trunc(number))):fallback;
 };
 return {digits:format.digits==null?null:bounded(format.digits,0,0),minimumIntegerDigits:bounded(format.minimumIntegerDigits??1,1,1),trailingZeros:format.trailingZeros!==false};
}
export function inlineToken(path,format={}){
 const {digits,minimumIntegerDigits:minimum,trailingZeros:zeros}=normalizeFormat(format);
 return '@{'+path+(digits===null && minimum===1?'':`|dp=${digits??'raw'};min=${minimum};zeros=${zeros?1:0}`)+'}';
}
export function formatInlineValue(value,format){
 if(!format || typeof value!=='number' || !Number.isFinite(value))return displayValue(value);
 format=normalizeFormat(format);
 let text=format.digits==null?String(value):value.toFixed(format.digits);
 if(format.digits!==null && !format.trailingZeros && text.includes('.') && !/[eE]/.test(text))text=text.replace(/0+$/,'').replace(/\.$/,'');
 const match=text.match(/^(-?)(\d+)(\.\d+)?$/);
 return match?match[1]+match[2].padStart(format.minimumIntegerDigits,'0')+(match[3] || ''):text;
}
