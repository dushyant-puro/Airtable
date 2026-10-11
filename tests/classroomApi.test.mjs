import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {makeTestPdf} from "./pdfFixture.mjs";

// Run against npm run start; these tests only use isolated synthetic QA rooms.
const base="http://localhost:3000/api/rooms/QA-"+randomUUID();
test("PDF upload validates role and document content",async()=>{
  assert.equal((await fetch(base+"/document",{method:"POST",body:makeTestPdf()})).status,403);
  assert.equal((await fetch(base+"/document",{method:"POST",headers:{"x-classroom-role":"teacher"},body:"not a PDF"})).status,400);
});
test("shared PDF round-trips without corruption and stale IDs fail",async()=>{
  const bytes=makeTestPdf();
  const upload=await fetch(base+"/document",{method:"POST",headers:{"x-classroom-role":"teacher","x-document-name":"Rehearsal.pdf"},body:bytes});
  assert.equal(upload.status,200);const {id,name}=await upload.json();assert.equal(name,"Rehearsal.pdf");
  const download=await fetch(base+"/document?id="+id);assert.equal(download.status,200);assert.equal(download.headers.get("content-type"),"application/pdf");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  assert.equal((await fetch(base+"/document?id=wrong-document")).status,404);
});
test("students cannot commit ungranted classroom changes",async()=>{
  const response=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:"qa-student",role:"student",state:{version:100,highlights:[]}})});
  assert.equal(response.status,403);
});
