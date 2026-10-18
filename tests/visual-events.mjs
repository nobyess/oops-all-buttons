import assert from 'node:assert/strict';
import {conditionMatches,evaluateControlEvents,eventTagIds} from '../static/visual-events.js';
const values={a:{quality:'good',value:8},b:{quality:'good',value:5},c:{quality:'good',value:10}};
const rule={id:'r',tag:'a',operator:'>',operand:{kind:'tag',tag:'b'},action:'hide'};
const control={events:[rule]};
assert.deepEqual(evaluateControlEvents(control,values),{visible:false});
values.a.value=0;assert.deepEqual(evaluateControlEvents(control,values),{});
values.a.value=8;
control.events.push({...rule,id:'colors',action:'set_colors',backColor:'#ff0000',foreColor:'#ffffff'});
control.events.push({...rule,id:'show',action:'show'});
assert.deepEqual(evaluateControlEvents(control,values),{visible:true,backColor:'#ff0000',foreColor:'#ffffff'});
for(const [op,number,result] of [['=',8,true],['!=',8,false],['<',9,true],['>',8,false]])assert.equal(conditionMatches({...rule,operator:op,operand:{value:number}},values),result);
const range={...rule,operator:'within_range',operand:{kind:'tag',tag:'b'},end_operand:{kind:'tag',tag:'c'}};
for(const value of [5,10]){values.a.value=value;assert.equal(conditionMatches(range,values),true);}
values.a.value=11;assert.equal(conditionMatches({...range,operator:'out_of_range'},values),true);
values.b.quality='bad';assert.deepEqual(evaluateControlEvents({events:[range]},values),{});
values.b.quality='good';values.b.value=12;assert.throws(()=>conditionMatches(range,values));
assert.deepEqual(eventTagIds(range).sort(),['a','b','c']);
values.a.value=10;values.b.value=5;
const old={events:[{...rule,id:'legacy',action:'increment',target:'output',amount:1}]};
const states=new Map(),writes=[];
const evaluate=()=>evaluateControlEvents(old,values,states,action=>writes.push(action));
evaluate();assert.equal(writes.length,0); // Startup true does not write.
values.a.value=0;evaluate();values.a.value=10;evaluate();evaluate();assert.equal(writes.length,1);
values.a.quality='bad';evaluate();values.a.quality='good';evaluate();assert.equal(writes.length,1);
assert.deepEqual(writes[0],{tag:'output',action:'increment',value:1});
assert.deepEqual(evaluateControlEvents({events:[{id:'draft',tag:''}]},values),{});
console.log('Browser comparisons, ranges, quality, appearance restoration, rule ordering, and legacy transitions passed.');

for(const type of ['label','button']) {
 const control={type,events:[{...rule,action:'set_content',content:'Ready\nRun'}]};
 values.a.value=8;
 assert.deepEqual(evaluateControlEvents(control,values),{contentOverride:'Ready\nRun'});
 values.a.value=0;assert.deepEqual(evaluateControlEvents(control,values),{});
 values.a.value=8;control.events[0].content='';
 assert.deepEqual(evaluateControlEvents(control,values),{contentOverride:''});
 delete control.events[0].content;assert.deepEqual(evaluateControlEvents(control,values),{});
}
assert.deepEqual(evaluateControlEvents({type:'image',events:[{...rule,action:'set_content',content:'No'}]},values),{});
console.log('Set Content supports whole-content overrides, empty text, restoration, and eligible controls.');

const styled={type:'button',events:[{...rule,action:'set_content',content:'Alarm',contentStyle:{fontFamily:'monospace',fontSize:24,bold:true,italic:true,textHorizontalAlignment:'left',textVerticalAlignment:'top',backColor:'#ff000080',foreColor:'#ffffff',width:999,actions:[]}}]};
values.a.value=8;
assert.deepEqual(evaluateControlEvents(styled,values),{contentOverride:'Alarm',fontFamily:'monospace',fontSize:24,bold:true,italic:true,textHorizontalAlignment:'left',textVerticalAlignment:'top',backColor:'#ff000080',foreColor:'#ffffff'});
values.a.value=0;assert.deepEqual(evaluateControlEvents(styled,values),{});
values.a.value=8;values.a.quality='bad';assert.deepEqual(evaluateControlEvents(styled,values),{});
console.log('Set Content formatting overrides restore correctly and cannot change geometry or actions.');

assert.deepEqual(evaluateControlEvents({type:'numeric',events:[{...rule,action:'set_content',content:'No'}]},{a:{quality:'good',value:8}}),{});

const spinRule={id:'spin',tag:'a',operator:'>',operand:{value:0},action:'spin',rpm:30};
values.a={quality:'good',value:true};
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[spinRule]},values),{spinRpm:30});
values.a.value=false;
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[spinRule]},values),{spinRpm:0});
values.a.value=true;
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[{...spinRule,rpm:90}]},values),{spinRpm:60});
assert.deepEqual(evaluateControlEvents({type:'label',events:[spinRule]},values),{});
values.a.quality='bad';
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[spinRule]},values),{});

values.a={quality:'good',value:25};
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[{...spinRule,operator:'within_range',operand:{value:20},end_operand:{value:30}}]},values),{spinRpm:30});
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[{...spinRule,operator:'<',operand:{kind:'tag',tag:'b'}}]},values),{spinRpm:0});

assert.equal(evaluateControlEvents({type:'label',events:[{id:'blink',tag:'a',operator:'>',operand:{value:0},action:'set_content',content:'Test',contentStyle:{blink:true}}]}, {a:{quality:'good',value:1}}).blink,true);

// Blink shares ordinary conditions, restores defaults, and never produces writes.
for(const type of ['label','button','numeric','square','circle','triangle','polyline','symbol','image','level']) {
 const control={type,events:[{...rule,action:'blink'}]},writes=[];
 assert.deepEqual(evaluateControlEvents(control,{a:{quality:'good',value:8},b:{quality:'good',value:5}},new Map(),write=>writes.push(write)),{controlBlink:true});
 assert.deepEqual(evaluateControlEvents(control,{a:{quality:'good',value:0},b:{quality:'good',value:5}}),{});
 assert.deepEqual(evaluateControlEvents(control,{a:{quality:'bad',value:8},b:{quality:'good',value:5}}),{});
 assert.equal(writes.length,0);
}
for(const type of ['listbox','page','group'])assert.deepEqual(evaluateControlEvents({type,events:[{...rule,action:'blink'}]},{a:{quality:'good',value:8},b:{quality:'good',value:5}}),{});
console.log('Conditional Blink supports eligible controls and restores on false or unavailable data.');

// Event Blink is independent of content styling and cannot be canceled by Set Content.
const bothBlinks={type:'button',events:[{...rule,action:'blink'},{...rule,id:'content',action:'set_content',content:'Alarm',contentStyle:{blink:false}}]};
assert.deepEqual(evaluateControlEvents(bothBlinks,{a:{quality:'good',value:8},b:{quality:'good',value:5}}),{controlBlink:true,contentOverride:'Alarm',blink:false});
