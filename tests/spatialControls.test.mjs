import test from "node:test";
import assert from "node:assert/strict";
import { DockHold, smoothZoom, translatePose } from "../app/livelab/spatialControls.ts";
import { compilerFor, validRuntimes } from "../app/livelab/codeRuntimes.ts";
import { createCompilerClient } from "../app/livelab/judge0Provider.ts";

test("V hold requires stable focus and release before a second activation",()=>{
  const hold=new DockHold();
  assert.equal(hold.update("code",100).fire,false);
  assert.equal(hold.update("math",900).fire,false);
  assert.equal(hold.update("math",1899).fire,false);
  assert.equal(hold.update("math",1900).fire,true);
  assert.equal(hold.update("code",4000).fire,false);
  assert.equal(hold.update(null,4500).fire,false);
  assert.equal(hold.update("code",4900).fire,false);
  hold.reset();assert.equal(hold.update("code",5000).fire,false);
  assert.equal(hold.update("code",6000).fire,true);
});
test("zoom ignores noise and invalid spans, damps and clamps large changes",()=>{
  assert.equal(smoothZoom(1,1,.505,.5),1);
  assert.equal(smoothZoom(1,1,1,.01),1);
  assert.equal(smoothZoom(1,1,NaN,.5),1);
  assert.equal(smoothZoom(1,1,.7,.5),1.14);
  for(let i=0,scale=1;i<100;i++){scale=smoothZoom(scale,1,99,.5);assert.ok(scale<=2.4);}
});
test("movement keeps the scaled object within the stage",()=>{
  const stage={width:1000,height:800},object={width:400,height:300};
  assert.deepEqual(translatePose({x:10,y:10,scale:1},100,80,stage,object),{x:20,y:20,scale:1});
  assert.deepEqual(translatePose({x:10,y:10,scale:1.5},9999,-9999,stage,object),{x:40,y:0,scale:1.5});
});
test("compiler catalogue distinguishes C, C++, Java and JavaScript without fixed IDs",()=>{
  const rows=[{id:10,name:"C++ (GCC 14)"},{id:11,name:"JavaScript (Node.js)"},{id:12,name:"Java (OpenJDK)"},{id:13,name:"C (GCC 14)"}];
  assert.equal(compilerFor("c",rows).id,13);assert.equal(compilerFor("cpp",rows).id,10);assert.equal(compilerFor("java",rows).id,12);
  assert.equal(compilerFor("java",[]),undefined);assert.deepEqual(validRuntimes([null,{}, {id:"7",name:"Java"}]),[]);
});
test("Judge0 uses catalogue IDs, disables networking and polls to completion",async()=>{
  const calls=[],responses=[[{id:13,name:"C (GCC)"}],{token:"test-job"},{status:{id:2}},{status:{id:3,description:"Accepted"},stdout:"2 4 8 16"}];
  const fetcher=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(responses.shift()),{status:200});};
  const result=await createCompilerClient("https://compiler.test",undefined,fetcher,async()=>{}).execute("int main(){}",13);
  assert.equal(result.output,"2 4 8 16");assert.equal(result.success,true);
  const job=JSON.parse(calls[1].init.body);assert.equal(job.enable_network,false);assert.equal(job.cpu_time_limit,3);assert.equal(job.language_id,13);
  assert.match(calls[1].url,/wait=false/);assert.equal(calls.length,4);
});
test("compiler errors and compile diagnostics are preserved",async()=>{
  const broken=async()=>new Response("unavailable",{status:503});
  await assert.rejects(createCompilerClient("https://compiler.test",undefined,broken).listRuntimes(),/HTTP 503/);
  const values=[[{id:9,name:"Java"}],{token:"job"},{status:{id:6,description:"Compilation Error"},compile_output:"Main.java: syntax error"}];
  const result=await createCompilerClient("https://compiler.test",undefined,async()=>new Response(JSON.stringify(values.shift())),async()=>{}).execute("bad",9);
  assert.equal(result.success,false);assert.match(result.output,/syntax error/);
});
test("unknown runtime is rejected before submitting code",async()=>{
  let calls=0;
  const client=createCompilerClient("https://compiler.test",undefined,async()=>{calls++;return new Response(JSON.stringify([{id:9,name:"Java"}]));});
  await assert.rejects(client.execute("bad",999),/available compiler/);assert.equal(calls,1);
});
