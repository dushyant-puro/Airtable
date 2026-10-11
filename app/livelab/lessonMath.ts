// Small, bounded expression grammar. Imported functions never execute JavaScript.
export function compileFormula(source: string): (x: number) => number {
  const text = source.trim().replace(/^\s*(?:y|f\(x\))\s*=\s*/i, "").replace(/π/g, "pi").toLowerCase();
  if (!text || text.length > 500) throw new Error("Enter a function of x (maximum 500 characters).");
  const tokens = text.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[a-z]+|[+\-*/^(),]/g) ?? [];
  if (tokens.join("") !== text.replace(/\s/g, "")) throw new Error("Unsupported symbol. Use x, numbers, + − * / ^ and standard functions.");
  const functions: Record<string, (n:number)=>number> = {sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,log:Math.log,floor:Math.floor,ceil:Math.ceil};
  type Fn = (x:number)=>number;
  let index=0,depth=0;
  const atom=():Fn=>{
    if (++depth > 48) throw new Error("Expression is too deeply nested.");
    const token=tokens[index++]; let result:Fn;
    if(token==="("){result=sum();if(tokens[index++]!==")")throw new Error("Missing closing parenthesis.");}
    else if(token==="x")result=x=>x;
    else if(token==="pi"||token==="e")result=()=>token==="pi"?Math.PI:Math.E;
    else if(token && Object.hasOwn(functions,token)){if(tokens[index++]!=="(")throw new Error(`Use ${token}(x).`);const value=sum();if(tokens[index++]!==")")throw new Error("Missing closing parenthesis.");result=x=>functions[token](value(x));}
    else if(token && /^\d|^\./.test(token)){const n=Number(token);result=()=>n;}
    else throw new Error(`Expected a number, x or function; found ${token??"end of expression"}.`);
    depth--;return result;
  };
  const power=():Fn=>{const left=atom();if(tokens[index]==="^"){index++;const right=unary();return x=>left(x)**right(x);}return left;};
  const unary=():Fn=>{if(tokens[index]==="+"||tokens[index]==="-"){const sign=tokens[index++],right=unary();return x=>sign==="-"?-right(x):right(x);}return power();};
  const product=():Fn=>{let left=unary();while(tokens[index]==="*"||tokens[index]==="/"){const op=tokens[index++],a=left,b=unary();left=x=>op==="*"?a(x)*b(x):a(x)/b(x);}return left;};
  const sum=():Fn=>{let left=product();while(tokens[index]==="+"||tokens[index]==="-"){const op=tokens[index++],a=left,b=product();left=x=>op==="+"?a(x)+b(x):a(x)-b(x);}return left;};
  const evaluate=sum();if(index!==tokens.length)throw new Error("Use explicit multiplication, for example 3*x.");return evaluate;
}

export function formulaSamples(source:string) {
  const fn=compileFormula(source);
  return Array.from({length:241},(_,i)=>{const x=-2*Math.PI+i/240*4*Math.PI;return {x,y:fn(x)};});
}

export function alu(a:number,b:number,operation:string) {
  if(operation==="ADD")return {result:(a+b)%2,carry:a&b};
  return {result:operation==="AND"?a&b:operation==="OR"?a|b:a^b,carry:0};
}

// Round-robin, quantum = one tick, all jobs arrive at t=0.
export function schedule(ticks:number) {
  const remaining=[5,3,4],trace:number[]=[];let cursor=0;
  for(let t=0;t<Math.min(12,Math.max(0,ticks));t++) {
    while(remaining[cursor]===0)cursor=(cursor+1)%3;
    trace.push(cursor);remaining[cursor]--;cursor=(cursor+1)%3;
  }
  return {remaining,trace,active:trace.at(-1)??-1};
}
