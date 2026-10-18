import assert from 'node:assert/strict';
globalThis.document={documentElement:{dataset:{}}};
let listener;const media={matches:false,addEventListener:(name,fn)=>{listener=fn;}};
globalThis.matchMedia=()=>media;
const {applyTheme,resolvedTheme}=await import('../static/theme.js');
assert.equal(resolvedTheme('system',true),'dark');assert.equal(resolvedTheme('system',false),'light');
applyTheme('dark');assert.equal(document.documentElement.dataset.theme,'dark');
applyTheme('system');assert.equal(document.documentElement.dataset.theme,'light');
media.matches=true;listener();assert.equal(document.documentElement.dataset.theme,'dark');
applyTheme('light');listener();assert.equal(document.documentElement.dataset.theme,'light');
applyTheme('invalid');assert.equal(document.documentElement.dataset.theme,'dark');
applyTheme();assert.equal(document.documentElement.dataset.theme,'dark');
console.log('Per-user theme resolution, system changes, and explicit preferences passed.');

const properties=new Map();document.documentElement.style={setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)};
applyTheme('system','#123456');assert.equal(properties.get('--app-background'),'#123456');media.matches=false;listener();assert.equal(properties.get('--app-background'),'#123456');applyTheme('light','');assert(!properties.has('--app-background'));
