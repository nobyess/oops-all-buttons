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
