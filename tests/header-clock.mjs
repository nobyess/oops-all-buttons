import assert from 'node:assert/strict';
import {installClock,clockText} from '../static/header-clock.js';
let tick,cleared;globalThis.setInterval=(fn,interval)=>{assert.equal(interval,1000);tick=fn;return 12;};globalThis.clearInterval=id=>{cleared=id;};
const el={},close=installClock(el);assert(el.textContent);assert(!Number.isNaN(Date.parse(el.dateTime)));tick();close();assert.equal(cleared,12);
const d=new Date(2026,9,17,13,4,5);assert.equal(clockText(d),d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' · '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
console.log('Header clock uses local date/time, updates once per second, and supports cleanup.');
