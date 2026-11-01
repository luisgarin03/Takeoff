import test from 'node:test';
import assert from 'node:assert/strict';
import { vectorObjects, selectVectorReference, pickVectorObject, matchVectorObjects } from '../src/lib/vectorSymbolSearch.js';

test('click selection picks the smaller overlapping shape and misses empty space', () => {
  const background={x:0,y:0,w:100,h:100};
  const square={x:20,y:20,w:10,h:10};
  assert.equal(pickVectorObject([background,square],{x:25,y:25}),square);
  assert.equal(pickVectorObject([square],{x:19,y:25}),square);
  assert.equal(pickVectorObject([square],{x:100,y:100}),null);
});

test('repeated image-mask symbols are isolated from their page background', () => {
  const ops = { paintImageMaskXObjectRepeat: 41 };
  const mask = { width:8,height:8,data:new Uint8Array([255,129,129,129,129,129,129,255]) };
  const objects=vectorObjects({fnArray:[41],argsArray:[[mask,10,0,0,10,[20,10,60,10]]] },ops,{transform:[1,0,0,1,0,0]});
  assert.equal(objects.length,2);
  const ref=selectVectorReference(objects,{x:19,y:9,w:12,h:12});
  assert.ok(ref);
  assert.equal(matchVectorObjects(objects,ref!).matches.length,2);
});

test('a fence paint batch exposes individual squares and ignores its crossing line', () => {
  const ops = { save:1, restore:2, transform:3, constructPath:4, moveTo:5, lineTo:6, stroke:7, rectangle:8, endPath:9, closePath:10 };
  const objects = vectorObjects({ fnArray:[4,7], argsArray:[
    [[5,6,8,8,5,6,6,6,10], [0,15,200,15, 20,10,10,10, 60,10,10,10, 110,20,120,20,120,10,110,10]], []
  ] },ops,{transform:[1,0,0,1,0,0]});
  assert.equal(objects.length,3);
  const reference=selectVectorReference(objects,{x:19,y:9,w:12,h:12});
  assert.ok(reference);
  const result=matchVectorObjects(objects,reference!,{threshold:.99});
  assert.equal(result.matches.length,3);
  assert.deepEqual(result.matches.map(o=>o.x),[20,60,110]);
});

test('overlapping painted paths remain separate and match translated geometry', () => {
  const ops = { save:1, restore:2, transform:3, constructPath:4, moveTo:5, lineTo:6, stroke:7, rectangle:8, endPath:9 };
  const list = { fnArray:[4,7,4,7,1,3,4,7,2], argsArray:[
    [[5,6,6],[10,10,20,10,15,20]],[],
    [[8],[8,8,30,30]],[],
    [],[1,0,0,1,50,0],[[5,6,6],[10,10,20,10,15,20]],[],[],
  ] };
  const objects=vectorObjects(list,ops,{transform:[1,0,0,1,0,0]});
  assert.equal(objects.length,3);
  const ref=selectVectorReference(objects,{x:9,y:9,w:12,h:12});
  assert.ok(ref);
  const result=matchVectorObjects(objects,ref!);
  assert.equal(result.matches.length,2);
  assert.deepEqual(result.matches.map(o=>o.x),[10,60]);
  assert.equal(selectVectorReference(objects,{x:0,y:0,w:2,h:2}),null);
});

test('different path topology and geometry are rejected', () => {
  const reference={x:0,y:0,w:10,h:10,codes:'m,l,l',paint:7,points:[[0,0],[1,0],[.5,1]]};
  assert.equal(matchVectorObjects([{...reference,codes:'m,c'}, {...reference,points:[[0,0],[1,1],[0,1]]}],reference).matches.length,0);
});
