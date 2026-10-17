import assert from 'node:assert/strict';
import {modbusAddress} from '../static/modbus-tag-dialog.js';
assert.equal(modbusAddress('holding','0','float32','big','little'),'holding:0:float32:big:little');
assert.equal(modbusAddress('coil','65535','float64','little','little'),'coil:65535:bool:big:big');
for(const args of [['holding','','uint16','big','big'],['holding','0.5','uint16','big','big'],['holding','65535','float32','big','big'],['holding','0','bogus','big','big']])assert.throws(()=>modbusAddress(...args));
console.log('Modbus tag offsets, bit areas, formats, and register boundaries passed.');
