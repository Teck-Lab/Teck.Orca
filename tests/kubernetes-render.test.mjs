import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseResources} from '../runtime/kubernetes/render.mjs';
test('kubectl JSON streams and Lists preserve string braces and reject malformed input',()=>{
 const a={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'a'},data:{json:'{"text":"}\\\"{"}'}};
 const b={apiVersion:'v1',kind:'Service',metadata:{name:'b'}};
 assert.deepEqual(parseResources(JSON.stringify(a)+'\n'+JSON.stringify(b)),[a,b]);
 assert.deepEqual(parseResources(JSON.stringify({apiVersion:'v1',kind:'List',items:[a,b]})),[a,b]);
 assert.throws(()=>parseResources('{"kind":'),/JSON/);
 assert.throws(()=>parseResources('garbage'),/JSON/);
});
