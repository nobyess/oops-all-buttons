import assert from 'node:assert/strict';
import {randomId} from '../static/uuid.js';
assert.equal(randomId({randomUUID:()=> 'native'}),'native');
const insecure={getRandomValues:bytes=>{bytes.fill(255);return bytes;}};
assert.equal(randomId(insecure),'ffffffff-ffff-4fff-bfff-ffffffffffff');
assert.match(randomId(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
console.log('UUID generation supports native and plain HTTP LAN browser APIs.');
