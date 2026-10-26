import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSamplePlan } from '../src/lib/samplePlan.js';
const pdf = () => new Response('%PDF-1.7\nSample');
test('sample loading waits for asynchronous import, then releases busy state',async()=>{
 const busy:boolean[]=[],errors:string[]=[];let finish:any;
 const importing = new Promise<boolean>(resolve=>{finish=resolve;});
 const pending=loadSamplePlan({fetcher:async()=>pdf(),addFiles:async(files:File[])=>{assert.equal(files[0].name,'sample-finish-plan.pdf');return importing;},onBusy:(v:boolean)=>busy.push(v),onError:(v:string)=>errors.push(v)});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(busy,[true]);
 finish(true);assert.equal(await pending,true);assert.deepEqual(busy,[true,false]);assert.deepEqual(errors,['']);
});
test('sample loading recovers from denied imports and thrown import errors',async()=>{
 for(const addFiles of [async()=>false,async()=>{throw Error('Storage unavailable');}]){
  const busy:boolean[]=[],errors:string[]=[];
  assert.equal(await loadSamplePlan({fetcher:async()=>pdf(),addFiles,onBusy:(v:boolean)=>busy.push(v),onError:(v:string)=>errors.push(v)}),false);
  assert.deepEqual(busy,[true,false]);assert.ok(errors.at(-1));
 }
});
test('sample loading rejects missing or HTML responses without importing',async()=>{
 for(const response of [new Response('',{status:404}),new Response('<!doctype html>')]){
  let called=false;const busy:boolean[]=[];
  assert.equal(await loadSamplePlan({fetcher:async()=>response,addFiles:async()=>{called=true;},onBusy:(v:boolean)=>busy.push(v),onError:()=>{}}),false);
  assert.equal(called,false);assert.deepEqual(busy,[true,false]);
 }
});
