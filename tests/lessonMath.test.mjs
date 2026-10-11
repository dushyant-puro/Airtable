import test from "node:test";
import assert from "node:assert/strict";
import {compileFormula,formulaSamples,alu,schedule} from "../app/livelab/lessonMath.ts";

test("math grammar, precedence and classroom functions",()=>{
  assert.equal(compileFormula("sin(pi/2)")(0),1);
  assert.equal(compileFormula("-x^2")(3),-9);
  assert.equal(compileFormula("2^3^2")(0),512);
  assert.equal(compileFormula("y = sqrt(x)")(9),3);
  assert.equal(compileFormula("f(x) = abs(x) + cos(0)")(-2),3);
  assert.equal(compileFormula("exp(-x^2/4)*cos(4*x)")(0),1);
  assert.equal(formulaSamples("sin(x)").length,241);
});
test("malformed or executable input cannot pass as a function",()=>{
  for(const source of ["","sin(","3x","fetch(x)","x;alert(1)","constructor(x)","x".repeat(501)])assert.throws(()=>compileFormula(source));
});
test("all one-bit ALU input combinations",()=>{
  for(let a=0;a<2;a++)for(let b=0;b<2;b++){
    const add=alu(a,b,"ADD");assert.equal(add.result+2*add.carry,a+b);
    assert.equal(alu(a,b,"AND").result,a&b);
    assert.equal(alu(a,b,"OR").result,a|b);
    assert.equal(alu(a,b,"XOR").result,a^b);
  }
});
test("round robin skips completed jobs and terminates",()=>{
  assert.deepEqual(schedule(0).remaining,[5,3,4]);
  assert.deepEqual(schedule(3).trace,[0,1,2]);
  assert.deepEqual(schedule(12).remaining,[0,0,0]);
  assert.equal(schedule(100).trace.length,12);
  assert.deepEqual(schedule(-10).trace,[]);
});
