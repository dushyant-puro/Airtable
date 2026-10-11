import test from "node:test";
import assert from "node:assert/strict";
import { canJoinInk, inkPath, inkBounds, moveInkObject, eraseInkAt } from "../app/livelab/stageInkGeometry.ts";
const object = {id:"note",x:0,y:0,strokes:[{id:"stroke",tool:"pen",color:"#1473e6",points:[{x:.2,y:.3},{x:.4,y:.5}]}]};
test("nearby letters join a line, distant writing stays independently movable",()=>{
  assert.equal(canJoinInk(object,{x:.45,y:.4}),true);
  assert.equal(canJoinInk(object,{x:.8,y:.4}),false);
});
test("vector ink keeps continuous paths and single-point dots",()=>{
  assert.equal(inkPath([]),"");
  assert.match(inkPath([{x:.1,y:.2}]),/^M 100.00 200.00 l/);
  assert.match(inkPath(object.strokes[0].points),/Q 200.00 300.00 300.00 400.00 L 400.00 500.00$/);
});
test("finished writing moves independently and clamps to stage edges",()=>{
  assert.deepEqual(inkBounds(object),{left:.2,top:.3,right:.4,bottom:.5});
  assert.equal(moveInkObject(object,99,99).x,.6);
  assert.equal(moveInkObject(object,-99,-99).y,-.3);
  assert.deepEqual(moveInkObject(object,.1,.1).strokes,object.strokes);
  assert.equal(object.x,0);
});
test("eraser hits segments in screen pixels and respects moved ink",()=>{
  assert.equal(eraseInkAt([object],{x:.3,y:.4},1000,700).length,0);
  assert.equal(eraseInkAt([object],{x:.8,y:.8},1000,700).length,1);
  const moved=moveInkObject(object,.3,0);
  assert.equal(eraseInkAt([moved],{x:.3,y:.4},1000,700).length,1);
  assert.equal(eraseInkAt([moved],{x:.6,y:.4},1000,700).length,0);
});
