import assert from 'node:assert/strict';
import {copyTagReference,pasteTagReference} from '../static/tag-selector.js';
assert.equal(pasteTagReference([{id:'a'}]),null);copyTagReference('a');assert.equal(pasteTagReference([{id:'a',name:'Renamed'}]),'a');assert.equal(pasteTagReference([{id:'b'}]),null);copyTagReference('b');assert.equal(pasteTagReference([{id:'b'}]),'b');copyTagReference('');assert.equal(pasteTagReference([{id:'a'}]),null);
console.log('Tag clipboard uses stable IDs, survives rename, and rejects deleted or out-of-scope references.');
