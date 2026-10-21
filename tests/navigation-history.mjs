import assert from 'node:assert/strict';
import {navigationHistory} from '../static/navigation-history.js';
let position=0;const entries=[{hash:'#pages',state:null}];
const win={location:{hash:'#pages',href:'http://local/#pages'},history:{state:null,replaceState(state,unused,url){this.state=state;entries[position]={state,hash:url.startsWith('#')?url:win.location.hash};},go(delta){position+=delta;this.state=entries[position].state;win.location.hash=entries[position].hash;}}};
const nav=navigationHistory(win);
function push(hash){entries.splice(position+1);entries.push({hash,state:null});position++;win.location.hash=hash;win.history.state=null;}
push('#editor/one');nav.accept();push('#sources');nav.accept();
win.history.go(-1);assert(nav.changed());nav.cancel();assert.equal(win.location.hash,'#sources');assert.equal(nav.changed(),false);
win.history.go(-1);nav.accept();assert.equal(win.location.hash,'#editor/one');win.history.go(-1);nav.accept();assert.equal(win.location.hash,'#pages');
win.history.go(1);nav.accept();push('#sheets');nav.cancel();assert.equal(win.location.hash,'#editor/one');assert.equal(nav.changed(),false);
win.history.go(1);nav.accept();assert.equal(win.location.hash,'#sheets');
console.log('Back/Forward cancellation preserves navigation entries.');

const countBeforeReset=entries.length;nav.reset();assert.equal(nav.canBack(),false);
const resetPosition=position;nav.back();assert.equal(position,resetPosition,'App Back stops at login boundary');
assert.equal(entries.length,countBeforeReset,'Reset does not pretend to delete native browser history');
push('#assets');nav.accept();assert.equal(nav.canBack(),true);
nav.back();assert(nav.changed());nav.accept();assert.equal(win.location.hash,'#sheets');assert.equal(nav.canBack(),false);
const reloaded=navigationHistory(win);assert.equal(reloaded.canBack(),false,'Boundary survives reload');
// A browser-native Back can still reach old entries; new navigation then works normally.
win.history.go(-1);assert(reloaded.changed());reloaded.accept();assert.equal(reloaded.canBack(),false);
push('#alarms');reloaded.accept();assert.equal(reloaded.canBack(),true);
reloaded.reset();assert.equal(reloaded.canBack(),false,'Every sign-in establishes a fresh boundary');
console.log('Login resets app Back history; new navigation, reload and native Back remain usable.');
