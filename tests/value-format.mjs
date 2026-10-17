import assert from 'node:assert/strict';
import {displayValue,numericDisplayValue} from '../static/value-format.js';
import {controls} from '../static/controls.js';
assert.equal(displayValue(true),'1');assert.equal(displayValue(false),'0');
assert.equal(displayValue('true'),'true');assert.equal(displayValue(1.25),'1.25');
for(const [value,expected] of [[true,'1.00'],[false,'0.00']]) {
 const element={};controls.numeric.render(element,{text:'Bit'},{bindingValue:{value,quality:'good'}});
 assert.equal(element.textContent,expected);
}
console.log('Boolean displays use 0/1; text and numeric values remain unchanged.');

assert.equal(numericDisplayValue({quality:'good',value:12.3456},2),'12.35');
assert.equal(numericDisplayValue({quality:'good',value:12.3456},3),'12.346');
assert.equal(numericDisplayValue({quality:'good',value:12.3456},0),'12');
assert.equal(numericDisplayValue({quality:'good',value:0},2),'0.00');
assert.equal(numericDisplayValue({quality:'bad',value:12},2),'—');
assert.equal(numericDisplayValue({quality:'good',value:'text'},2),'—');
assert.equal(controls.numeric.hidden,undefined);assert.equal(controls.numeric.props.text,undefined);
assert.equal(controls.numeric.props.valueTag.type,'binding');
console.log('Numeric Display decimal places, zero, missing values, and tag-only content passed.');
