import assert from 'node:assert/strict';
import {accountProfile} from '../static/account-popup.js';
assert.deepEqual(accountProfile({username:'Operator',administrator:false,roles:['r2','r1']},[{id:'r1',name:'Maintenance'},{id:'r2',name:'Operations'}]),{username:'Operator',level:'Standard User',roles:['Operations','Maintenance']});
assert.deepEqual(accountProfile({username:'Admin',administrator:true,roles:[]},[]),{username:'Admin',level:'Administrator',roles:[]});
assert.deepEqual(accountProfile({username:'User',roles:['missing']},[]).roles,['Unknown role']);
console.log('Account popup shows user level and assigned role names for administrators and standard users.');
