import assert from 'node:assert/strict';
import {parseInlineToken,inlineToken,formatInlineValue} from '../static/inline-format.js';
import {renderInlineText,inlineTagIds} from '../static/inline-text.js';
import {instantiatePage,renameParameterText} from '../static/page-parameters.js';
const path=String.raw`Simulation\AirHandler\SupplyAirTemperature`;
const formatted=inlineToken(path,{digits:2,minimumIntegerDigits:3,trailingZeros:true});
assert.equal(formatted,`@{${path}|dp=2;min=3;zeros=1}`);
assert.equal(inlineToken(path),`@{${path}}`);
const format=parseInlineToken(formatted.slice(2,-1)).format;
assert.equal(formatInlineValue(7.2,format),'007.20');
assert.equal(formatInlineValue(-7.2,format),'-007.20');
assert.equal(formatInlineValue(1234.5,format),'1234.50');
assert.equal(formatInlineValue(7.2,{...format,trailingZeros:false}),'007.2');
assert.equal(formatInlineValue(7,{...format,trailingZeros:false}),'007');
assert.equal(formatInlineValue(7.239,format),'007.24');
assert.equal(formatInlineValue(7.2,{...format,digits:null}),'007.2');
assert.equal(formatInlineValue(7.2,{...format,digits:0}),'007');
assert.equal(formatInlineValue('7.200',format),'7.200');
assert.equal(formatInlineValue(true,format),'1');
assert.equal(parseInlineToken(path+'|dp=99;min=3;zeros=1').format,null);
assert.equal(parseInlineToken(path+'|dp=2;min=0;zeros=1').format,null);
const tags=[{id:'supply',source:'simulation',source_name:'Simulation',folder:'AirHandler',name:'SupplyAirTemperature'}];
const values={supply:{quality:'good',value:7.239}};
const text=formatted+' / '+inlineToken(path,{digits:1})+' / '+inlineToken(path);
assert.equal(renderInlineText(text,{},tags,values),'007.24 / 7.2 / 7.239');
assert.deepEqual(inlineTagIds(text,{},tags),['supply']);
const refs={[formatted.slice(2,-1)]:'supply'};tags[0].name='Renamed';
assert.equal(renderInlineText(formatted,refs,tags,values),'007.24');
assert.equal(renderInlineText(formatted,refs,tags,{supply:{quality:'bad'}}),'—');
const token=inlineToken(String.raw`Parameters\Temperature`,{digits:1,minimumIntegerDigits:2});
const page={controls:[{type:'label',text:token,events:[]}],parameters:[{id:'parameter:t',name:'Temperature'}]};
const instance=instantiatePage(page,{'parameter:t':'supply'});
assert.equal(renderInlineText(instance.controls[0].text,instance.controls[0].textRefs,tags,values),'07.2');
page.parameters[0].name='Room';renameParameterText(page,[{id:'parameter:t',name:'Temperature'}]);
assert.equal(page.controls[0].text,inlineToken(String.raw`Parameters\Room`,{digits:1,minimumIntegerDigits:2}));
console.log('Per-occurrence rounding/padding, raw values, numeric-only formatting, rename stability, quality, and page parameters passed.');

// Accidental deletions and insertions must not interrupt other valid tags.
const good=inlineToken(path,{digits:2});
const goodRefs={[good.slice(2,-1)]:'supply'};
const mutations=new Set(['@{}','@{','}', '@{{Tag}}', '@{Tag\n}', '@{Tag|dp=Infinity;min=999999999;zeros=1}']);
for(let i=0;i<formatted.length;i++){
 mutations.add(formatted.slice(0,i)+formatted.slice(i+1));
 for(const char of ['{','}','|',';','0','9','-','.','\n'])mutations.add(formatted.slice(0,i)+char+formatted.slice(i));
}
for(const damaged of mutations){
 assert.doesNotThrow(()=>inlineTagIds(damaged,{},tags));
 const rendered=renderInlineText(damaged+' / '+good,goodRefs,tags,values);
 assert(rendered.endsWith(' / 7.24'),JSON.stringify(damaged));
}
for(const digits of [undefined,null,-999,999,1e100,Infinity,-Infinity,NaN,'','oops','2.7']){
 for(const minimumIntegerDigits of [undefined,null,-999,999,1e100,Infinity,NaN,'oops','3.7']){
  const settings={digits,minimumIntegerDigits};
  for(const value of [0,-0,7.2,-7.2,Number.MAX_VALUE,Number.MIN_VALUE,NaN,Infinity,null,true,'text']){
   const output=formatInlineValue(value,settings);
   assert.equal(typeof output,'string');assert(output.length<350);
  }
  const parsed=parseInlineToken(inlineToken(path,settings).slice(2,-1));
  assert(parsed.format===null || parsed.format.minimumIntegerDigits<=15);
 }
}
assert.equal(inlineToken(path,null),`@{${path}}`);
assert.equal(formatInlineValue(7.2,{digits:999,minimumIntegerDigits:1e100}).length,31);
console.log(`Malformed-token resilience: ${mutations.size} edits plus bounded settings and numeric extremes passed.`);
