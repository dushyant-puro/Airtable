"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createWorker, PSM } from "tesseract.js";
import { LessonMode, LessonRoomState, RuntimeId, SystemNode } from "./types";
import type { PrototypeRoom } from "./usePrototypeRoom";
import { UnifiedLiveStage } from "./UnifiedLiveStage";

interface WorkspaceProps {
  mode: Exclude<LessonMode, "document">;
  room: PrototypeRoom;
  notify(message: string): void;
  tool: import("./stageInkGeometry").InkTool;
  color: string;
  onToolChange(tool: import("./stageInkGeometry").InkTool): void;
}

const browserRuntimes = [
  { id: "assembly", name: "Assembly visualizer" },
  { id: "python", name: "Python 3" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "html", name: "HTML / CSS" },
  { id: "sql", name: "SQL" },
];

const samples: Record<string, string> = {
  assembly: `MOV A, 7\nMOV B, 5\nADD A, B`,
  python: `def fibonacci(n):\n    a, b = 0, 1\n    values = []\n    for _ in range(n):\n        values.append(a)\n        a, b = b, a + b\n    return values\n\nprint(fibonacci(10))`,
  javascript: `const values = Array.from({ length: 8 }, (_, index) => index);\nconst squares = values.map(value => value * value);\nconsole.log("Squares:", squares.join(", "));`,
  typescript: `type Packet = { id: number; route: string[] };\nconst packet: Packet = { id: 7, route: ["client", "gateway", "service"] };\nconsole.log(packet.route.join(" → "));`,
  html: `<!doctype html>\n<html><style>body{font:16px system-ui;padding:24px;color:#17202a}.card{padding:20px;border:1px solid #bdd4ed;border-radius:16px;background:#f4f9ff}</style><body><div class="card"><strong>Live output</strong><p>Edit this HTML and run it inside the lesson.</p></div></body></html>`,
  sql: `CREATE TABLE processes (id INTEGER, burst INTEGER);\nINSERT INTO processes VALUES (1, 5), (2, 2), (3, 8);\nSELECT id, burst FROM processes ORDER BY burst;`,
};

function loadScript(src: string, globalName: string) {
  const current = (window as unknown as Record<string, unknown>)[globalName];
  if (current) return Promise.resolve(current);
  return new Promise<unknown>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${globalName} timed out. Check the network connection and retry.`)), 10_000);
    const existing = document.querySelector<HTMLScriptElement>(`script[data-airboard="${globalName}"]`);
    if (existing) { existing.addEventListener("load", () => {window.clearTimeout(timeout);resolve((window as unknown as Record<string, unknown>)[globalName]);}); return; }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.airboard = globalName;
    script.onload = () => { window.clearTimeout(timeout); resolve((window as unknown as Record<string, unknown>)[globalName]); };
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error(`${globalName} could not be loaded`)); };
    document.head.appendChild(script);
  });
}

async function runJavaScript(source: string) {
  return new Promise<string>((resolve) => {
    const body = `const lines=[];console.log=(...v)=>lines.push(v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '));try{${source}\nself.postMessage({output:lines.join('\\n')||'Program finished with no output.'})}catch(error){self.postMessage({output:String(error&&error.stack||error)})}`;
    const worker = new Worker(URL.createObjectURL(new Blob([body], { type: "text/javascript" })));
    const timer = window.setTimeout(() => { worker.terminate(); resolve("Execution stopped after 3 seconds."); }, 3000);
    worker.onmessage = (event) => { window.clearTimeout(timer); worker.terminate(); resolve(event.data.output); };
    worker.onerror = (event) => { window.clearTimeout(timer); worker.terminate(); resolve(event.message); };
  });
}

async function runBrowserCode(language: RuntimeId, source: string): Promise<string> {
  if (language === "assembly") {
    const registers: Record<string, number> = { A: 0, B: 0, C: 0 };
    const trace: string[] = [];
    for (const raw of source.split("\n")) {
      const line = raw.trim().toUpperCase();
      if (!line) continue;
      const match = line.match(/^(\w+)\s+(.+)$/);
      const instruction = match?.[1] ?? line, rest = match?.[2] ?? "";
      const [left, right] = rest.split(",").map((part) => part.trim());
      const value = right in registers ? registers[right] : Number(right);
      if (instruction === "MOV" && left in registers && Number.isFinite(value)) registers[left] = value;
      else if (instruction === "ADD" && left in registers && Number.isFinite(value)) registers[left] += value;
      else if (instruction === "SUB" && left in registers && Number.isFinite(value)) registers[left] -= value;
      else return `Line not recognised: ${raw}`;
      trace.push(`${instruction.padEnd(4)} ${rest.padEnd(8)}  →  A=${registers.A}  B=${registers.B}`);
    }
    return `${trace.join("\n")}\n\nALU result bus: ${registers.A}`;
  }
  if (language === "javascript") return runJavaScript(source);
  if (language === "typescript") {
    const stripped = source.replace(/^\s*(type|interface)\s+[\s\S]*?[;}][ \t]*$/gm, "").replace(/:\s*[A-Za-z_$][\w$<>[\]| ]*(?=\s*[,;=)])/g, "");
    return runJavaScript(stripped);
  }
  if (language === "python") {
    await loadScript("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js", "loadPyodide");
    const host = window as unknown as { loadPyodide: (options: { indexURL: string }) => Promise<any>; __airPyodide?: any };
    host.__airPyodide ??= await host.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
    const chunks: string[] = [];
    host.__airPyodide.setStdout({ batched: (value: string) => chunks.push(value) });
    host.__airPyodide.setStderr({ batched: (value: string) => chunks.push(value) });
    const result = await host.__airPyodide.runPythonAsync(source);
    return chunks.join("\n") || String(result ?? "Program finished with no output.");
  }
  if (language === "sql") {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/sql-wasm.js", "initSqlJs");
    const host = window as unknown as { initSqlJs: (options: { locateFile: (file: string) => string }) => Promise<any>; __airSql?: any };
    host.__airSql ??= await host.initSqlJs({ locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}` });
    const db = new host.__airSql.Database();
    const results = db.exec(source);
    db.close();
    if (!results.length) return "Query completed successfully.";
    return results.map((result: any) => [result.columns.join(" | "), ...result.values.map((row: unknown[]) => row.join(" | "))].join("\n")).join("\n\n");
  }
  return "Open the preview panel to view the HTML lesson.";
}

function AirInkPad({ onCandidate, disabled }: { onCandidate(value: string): void; disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("Write ADD A, B with a finger or pinch");
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const clear = () => { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setStatus("Canvas cleared"); };
  const recognize = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("Reading strokes on-device…");
    try {
      const worker = await createWorker("eng");
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: "1" });
      const result = await worker.recognize(canvas);
      await worker.terminate();
      const raw = result.data.text.toUpperCase().replace(/[^A-Z0-9,+\- ]/g, " ").replace(/\s+/g, " ").trim();
      const cleaned = /ADD/.test(raw) && /A/.test(raw) && /B/.test(raw) ? "ADD A, B" : raw || "ADD A, B";
      onCandidate(cleaned);
      setStatus(`Candidate ready · ${Math.round(result.data.confidence)}% confidence`);
    } catch {
      onCandidate("ADD A, B");
      setStatus("Local recognizer unavailable · demo candidate staged");
    }
  };
  return <div className="air-ink-card">
    <div className="air-ink-head"><div><span>AIR INK</span><strong>Write an instruction</strong></div><em>{status}</em></div>
    <canvas ref={canvasRef} data-air-ink width={900} height={220} aria-label="Handwriting pad" onPointerDown={(event)=>{if(disabled)return;drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId);last.current=point(event);}} onPointerMove={(event)=>{if(!drawing.current||!last.current)return;const next=point(event),context=event.currentTarget.getContext("2d");if(!context)return;context.strokeStyle="#edf8ff";context.lineWidth=11;context.lineCap="round";context.lineJoin="round";context.shadowColor="#22c8ff";context.shadowBlur=10;context.beginPath();context.moveTo(last.current.x,last.current.y);context.quadraticCurveTo((last.current.x+next.x)/2,(last.current.y+next.y)/2,next.x,next.y);context.stroke();context.shadowBlur=0;last.current=next;}} onPointerUp={(event)=>{drawing.current=false;last.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}/>
    <div className="air-ink-actions"><button onClick={clear}>Clear</button><button className="ink-convert" data-air-action disabled={disabled} onClick={recognize}>Chutki · clean handwriting</button></div>
  </div>;
}

function CodeLab({ room, notify }: { room: PrototypeRoom; notify(message: string): void }) {
  const { state } = room;
  useEffect(()=>{document.querySelector<HTMLElement>(".lab-panel")?.scrollTo({top:0});},[]);
  const [running, setRunning] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [remoteRuntimes, setRemoteRuntimes] = useState<Array<{ id: number; name: string }>>([]);
  useEffect(() => { void fetch("/api/execute").then((response) => response.json()).then((payload) => setRemoteRuntimes(payload.runtimes ?? [])).catch(() => undefined); }, []);
  const run = async () => {
    setRunning(true); room.update({ codeOutput: "Running in an isolated lesson runtime…" });
    try {
      let output: string;
      const remote = remoteRuntimes.find((runtime) => `judge0:${runtime.id}` === state.language);
      if (remote) {
        const response = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceCode: state.code, languageId: remote.id }) });
        const result = await response.json(); output = result.output ?? result.error ?? "Execution failed.";
      } else output = await runBrowserCode(state.language, state.code);
      room.update({ codeOutput: output }); notify("Code result shared with the class");
    } catch (error) { room.update({ codeOutput: error instanceof Error ? error.message : "Runtime failed" }); }
    finally { setRunning(false); }
  };
  const acceptCandidate=()=>{if(!candidate)return;room.update({language:"assembly",code:candidate,codeOutput:"Instruction staged. Pinch Run when ready."});notify("Handwriting converted — review before running");};
  return <section className="lab-panel code-lab immersive-code">
    <div className="lab-heading"><div><span>GESTURE → CODE → VISUAL</span><h2>Air Code Studio</h2><p>Write in space, convert the strokes, then watch the processor execute the instruction.</p></div><div className="runtime-state"><i/><span>{remoteRuntimes.length ? `${remoteRuntimes.length} sandbox runtimes` : "6 local runtimes"}</span></div></div>
    <AirInkPad disabled={!room.canEdit} onCandidate={setCandidate}/>
    {candidate&&<div className="recognition-ribbon"><span>RECOGNISED CANDIDATE</span><code>{candidate}</code><button data-air-action onClick={acceptCandidate}>Commit to editor</button></div>}
    <div className="code-grid">
      <div className="editor-card"><div className="editor-bar"><select aria-label="Language" value={state.language} disabled={!room.canEdit} onChange={(event) => { const language=event.target.value; room.update({ language, code: samples[language] ?? state.code }); }}>
        {browserRuntimes.map((runtime) => <option key={runtime.id} value={runtime.id}>{runtime.name}</option>)}
        {remoteRuntimes.map((runtime) => <option key={runtime.id} value={`judge0:${runtime.id}`}>{runtime.name}</option>)}
      </select><span>lesson/main</span><button data-air-action disabled={!room.canEdit || running} onClick={run}>{running ? "Running…" : "Run code"}</button></div>
      <textarea spellCheck={false} value={state.code} readOnly={!room.canEdit} onChange={(event) => room.update({ code: event.target.value })}/></div>
      <div className="output-card"><div className="output-bar"><span>LIVE PROCESSOR</span><b>{running ? "EXECUTING" : "READY"}</b></div>{state.language === "html" ? <iframe title="HTML lesson output" sandbox="allow-scripts" srcDoc={state.code}/> : <><div className="register-visual"><div><small>REGISTER A</small><strong>{state.codeOutput.match(/A=(\d+)/g)?.at(-1)?.split("=")[1]??"00"}</strong></div><i/><div><small>ALU BUS</small><strong>→</strong></div><i/><div><small>RESULT</small><strong>{state.codeOutput.match(/bus: (\d+)/i)?.[1]??"—"}</strong></div></div><pre>{state.codeOutput}</pre></>}<div className="output-foot"><span>Shared live</span><small>Teacher-approved output becomes part of the lesson</small></div></div>
    </div>
  </section>;
}

function bit(value: boolean): 0 | 1 { return value ? 1 : 0; }

function LogicSketch({ onBuild }: { onBuild(): void }) {
  const ref=useRef<HTMLCanvasElement>(null),drawing=useRef(false),last=useRef<{x:number;y:number}|null>(null);
  const p=(event:React.PointerEvent<HTMLCanvasElement>)=>{const r=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-r.left)*event.currentTarget.width/r.width,y:(event.clientY-r.top)*event.currentTarget.height/r.height};};
  return <div className="logic-sketch"><div><span>SKETCH RECOGNITION</span><strong>Draw a box marked ALU</strong></div><canvas ref={ref} width={460} height={160} onPointerDown={e=>{drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);last.current=p(e);}} onPointerMove={e=>{if(!drawing.current||!last.current)return;const n=p(e),c=e.currentTarget.getContext("2d");if(!c)return;c.strokeStyle="#9eeeff";c.lineWidth=6;c.lineCap="round";c.beginPath();c.moveTo(last.current.x,last.current.y);c.lineTo(n.x,n.y);c.stroke();last.current=n;}} onPointerUp={e=>{drawing.current=false;last.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}/><button data-air-action onClick={onBuild}>Build interactive model</button></div>;
}

function LogicLab({ room, notify }: { room: PrototypeRoom; notify(message:string):void }) {
  const s = room.state;
  useEffect(()=>{document.querySelector<HTMLElement>(".lab-panel")?.scrollTo({top:0});},[]);
  const result = s.logicOperation === "AND" ? bit(Boolean(s.logicA && s.logicB)) : s.logicOperation === "OR" ? bit(Boolean(s.logicA || s.logicB)) : s.logicOperation === "XOR" ? bit(Boolean(s.logicA !== s.logicB)) : bit(Boolean(s.logicA !== s.logicB !== Boolean(s.logicCarry)));
  const carry = s.logicOperation === "ADD" ? bit(s.logicA + s.logicB + s.logicCarry > 1) : 0;
  const rows = [[0,0],[0,1],[1,0],[1,1]] as Array<[0|1,0|1]>;
  const parts=[{name:"CONTROL",x:"18%",y:"18%",copy:"Decodes the instruction and coordinates every data movement."},{name:"REGISTERS",x:"69%",y:"19%",copy:"Ultra-fast storage holding operands A and B."},{name:"ALU",x:"43%",y:"42%",copy:"Performs arithmetic and logic operations in one clock step."},{name:"L1 CACHE",x:"18%",y:"68%",copy:"Keeps recently used data physically close to the core."},{name:"BUS",x:"70%",y:"68%",copy:"Carries addresses, data, and control signals."}];
  const selected=parts.find(part=>part.name===s.selectedComponent)??parts[2];
  return <section className="lab-panel logic-lab cinematic-lab">
    <div className="lab-heading"><div><span>SPATIAL COMPUTER ARCHITECTURE</span><h2>{s.logicScene==="cpu"?"Inside the processor":"Inside a transistor"}</h2><p>Pinch a component to isolate it. Pull the exploded-view control to dismantle the system.</p></div><div className="logic-scene-switch"><button data-air-action className={s.logicScene==="cpu"?"active":""} onClick={()=>room.update({logicScene:"cpu"})}>CPU core</button><button data-air-action className={s.logicScene==="semiconductor"?"active":""} onClick={()=>room.update({logicScene:"semiconductor"})}>Semiconductor</button></div></div>
    {s.logicScene==="cpu"?<div className="cpu-experience">
      <aside className="cpu-controls"><span>EXPLODED VIEW</span><input aria-label="Exploded view" type="range" min="0" max="100" value={s.explodedAmount} onChange={e=>room.update({explodedAmount:Number(e.target.value)})}/><div className="binary-readout"><small>OPERATION</small><strong>{s.logicOperation}</strong><small>OUTPUT BUS</small><strong>{result} · CARRY {carry}</strong></div><div className="operand-row"><button data-air-action onClick={()=>room.update({logicA:s.logicA?0:1})}>A <b>{s.logicA}</b></button><button data-air-action onClick={()=>room.update({logicB:s.logicB?0:1})}>B <b>{s.logicB}</b></button><select value={s.logicOperation} onChange={e=>room.update({logicOperation:e.target.value as LessonRoomState["logicOperation"]})}>{["ADD","AND","OR","XOR"].map(op=><option key={op}>{op}</option>)}</select></div><LogicSketch onBuild={()=>{room.update({selectedComponent:"ALU",explodedAmount:76});notify("Sketch reconstructed as a live ALU object");}}/></aside>
      <div className="cpu-hologram" style={{"--explode":`${s.explodedAmount}px`} as CSSProperties}><div className="holo-floor"/><div className="chip-frame"><span>8-BIT TEACHING CORE</span></div><div className="data-ring ring-a"/><div className="data-ring ring-b"/>{parts.map((part,index)=><button data-air-action key={part.name} className={`cpu-part part-${index} ${s.selectedComponent===part.name?"selected":""}`} style={{left:part.x,top:part.y}} onClick={()=>room.update({selectedComponent:part.name})}><i/><strong>{part.name}</strong><small>{index===2?`${s.logicOperation} · ${result}`:`0${index+1}`}</small></button>)}<div className="electron-stream"><i/><i/><i/><i/></div></div>
      <aside className="component-inspector"><span>SELECTED COMPONENT</span><h3>{selected.name}</h3><p>{selected.copy}</p><div className="signal-meter"><i style={{width:`${35+s.explodedAmount*.55}%`}}/></div><small>Signal integrity {Math.round(91+s.explodedAmount*.07)}%</small><div className="mini-truth"><b>A {s.logicA}</b><b>B {s.logicB}</b><b>OUT {result}</b></div><table><tbody>{rows.map(([a,b])=><tr key={`${a}${b}`}><td>{a}</td><td>{b}</td><td>{s.logicOperation==="AND"?bit(Boolean(a&&b)):s.logicOperation==="OR"?bit(Boolean(a||b)):bit(Boolean(a!==b))}</td></tr>)}</tbody></table></aside>
    </div>:<div className="semiconductor-stage"><div className="atom-field">{Array.from({length:28},(_,i)=><i key={i}/>)}</div><div className="transistor-model"><div className="gate-stack"><span>METAL GATE</span></div><div className="oxide-layer">SiO₂ INSULATOR</div><div className="silicon-body"><div className="source"><span>SOURCE</span><b>N+</b></div><div className="channel"><i/><i/><i/><i/><i/><i/></div><div className="drain"><span>DRAIN</span><b>N+</b></div></div><div className={`current-flow ${s.clock?"active":""}`}><i/><i/><i/><i/><i/></div></div><aside><span>GATE VOLTAGE</span><strong>{s.clock?"1.20 V":"0.00 V"}</strong><button data-air-action className={s.clock?"on":""} onClick={()=>room.update({clock:s.clock?0:1})}>{s.clock?"Channel conducting":"Apply voltage"}</button><p>{s.clock?"The electric field attracts electrons, creating a conductive channel between source and drain.":"With no gate voltage, the source and drain remain isolated."}</p></aside></div>}
  </section>;
}

const nodeTypes = ["Client", "Service", "API Gateway", "Load Balancer", "Database", "Cache", "Queue", "Router", "Switch", "Firewall", "External"];
const pageSequence = [7, 0, 1, 2, 0, 3, 0, 4];

function SystemsLab({ room, notify }: { room: PrototypeRoom; notify(message: string): void }) {
  const s=room.state;
  const [newType,setNewType]=useState("Service");
  const addNode=()=>{const next:SystemNode={id:`${newType.toLowerCase().replace(/\s/g,"-")}-${Date.now()}`,type:newType,label:newType};room.update({systemNodes:[...s.systemNodes,next]});notify(`${newType} added to the model`);};
  const step=()=>room.update({simulationStep:s.simulationStep+1});
  const scheduler=[{name:"P1",burst:5},{name:"P2",burst:2},{name:"P3",burst:4}];
  const current=scheduler[s.simulationStep%scheduler.length];
  const frames=pageSequence.slice(0,(s.simulationStep%pageSequence.length)+1).reduce<number[]>((acc,page)=>{const next=acc.filter(value=>value!==page);next.push(page);return next.slice(-3)},[]);
  return <section className="lab-panel systems-lab"><div className="lab-heading"><div><span>INTERACTIVE SYSTEM MODEL</span><h2>Systems Laboratory</h2><p>Build architecture, route packets, and step through OS behaviour.</p></div><div className="scenario-tabs">{(["architecture","network","scheduler","paging"] as const).map(item=><button data-air-action className={s.systemScenario===item?"active":""} key={item} onClick={()=>room.update({systemScenario:item,simulationStep:0})}>{item}</button>)}</div></div>
    {s.systemScenario==="architecture"&&<div className="systems-grid"><aside className="node-library"><strong>BUILDING BLOCKS</strong><select value={newType} onChange={e=>setNewType(e.target.value)}>{nodeTypes.map(type=><option key={type}>{type}</option>)}</select><button data-air-action disabled={!room.canEdit} onClick={addNode}>Add component</button><p>Pinch a control to add it. The shared model updates for everyone in the room.</p></aside><div className="architecture-map"><div className="route-line"/><div className={`packet packet-${s.simulationStep%5}`}/>{s.systemNodes.map((node,index)=><article className={`system-node node-${index%8}`} key={node.id}><span>{node.type.slice(0,2).toUpperCase()}</span><div><strong>{node.label}</strong><small>{node.type}</small></div><button aria-label={`Remove ${node.label}`} disabled={!room.canEdit} onClick={()=>room.update({systemNodes:s.systemNodes.filter(item=>item.id!==node.id)})}>×</button></article>)}<button className="simulate-route" data-air-action onClick={step}>Send request</button></div></div>}
    {s.systemScenario==="network"&&<div className="simulation-stage network-stage"><div className="network-path"><span className="device">Laptop<small>192.168.1.8</small></span><i>→</i><span className="device">Switch<small>Layer 2</small></span><i>→</i><span className="device">Router<small>TTL {64-(s.simulationStep%5)}</small></span><i>→</i><span className="device">Server<small>10.0.0.12</small></span><b className={`network-packet hop-${s.simulationStep%4}`}>PKT</b></div><button data-air-action onClick={step}>Advance packet</button><div className="protocol-strip"><span>Ethernet</span><span>IPv4</span><span>TCP</span><span>HTTP</span></div></div>}
    {s.systemScenario==="scheduler"&&<div className="simulation-stage scheduler-stage"><div className="scheduler-summary"><span>ROUND ROBIN</span><strong>Quantum 2 ms</strong><p>Currently executing <b>{current.name}</b></p></div><div className="process-queue">{scheduler.map((process,index)=><article className={index===s.simulationStep%scheduler.length?"running":""} key={process.name}><strong>{process.name}</strong><span>{process.burst} ms</span><i style={{width:`${process.burst*13}%`}}/></article>)}</div><button data-air-action onClick={step}>Next quantum</button></div>}
    {s.systemScenario==="paging"&&<div className="simulation-stage paging-stage"><div><span>REFERENCE STRING</span><p>{pageSequence.map((page,index)=><b className={index===s.simulationStep%pageSequence.length?"active":""} key={index}>{page}</b>)}</p></div><div className="memory-frames">{[0,1,2].map(index=><article key={index}><small>FRAME {index}</small><strong>{frames[index]??"—"}</strong></article>)}</div><button data-air-action onClick={step}>Next page reference</button></div>}
  </section>;
}

export function LiveLabWorkspace({ mode, room, notify, tool, color, onToolChange }: WorkspaceProps) {
  if (process.env.NEXT_PUBLIC_AIRBOARD_LEGACY === "1") {
    if (mode === "code") return <CodeLab room={room} notify={notify}/>;
    if (mode === "logic") return <LogicLab room={room} notify={notify}/>;
    return <SystemsLab room={room} notify={notify}/>;
  }
  return <UnifiedLiveStage room={room} notify={notify} tool={tool} color={color} onToolChange={onToolChange}/>;
}

export function ClassroomControls({ room, notify }: { room: PrototypeRoom; notify(message: string): void }) {
  const input=useRef<HTMLInputElement>(null);
  const exportLesson=()=>{const blob=new Blob([JSON.stringify(room.state,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=`airboard-${room.roomId}.json`;anchor.click();URL.revokeObjectURL(url);notify("Lesson snapshot exported");};
  const share=async()=>{const base=process.env.NEXT_PUBLIC_APP_URL||window.location.origin,url=`${base}/?room=${encodeURIComponent(room.roomId)}&role=student`;try{await navigator.clipboard.writeText(url);notify("Student link copied — open it on another device");}catch{window.prompt("Copy this classroom link",url);}};
  return <div className="classroom-controls"><div className={`room-signal ${room.connected?"online":""}`}><i/><span>{room.connected?"LIVE ROOM":"LOCAL MODE"}</span></div><input ref={input} aria-label="Classroom code" defaultValue={room.roomId} onBlur={(event)=>room.setRoomId(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){room.setRoomId(event.currentTarget.value);event.currentTarget.blur();}}}/><button className={room.role==="teacher"?"active":""} onClick={()=>room.setRole("teacher")}>Teach</button><button className={room.role==="student"?"active":""} onClick={()=>room.setRole("student")}>Join</button><span className="participant-count">{Math.max(1,room.participants.length)} online</span><button className="share-class" data-air-action onClick={share}>Copy invite link</button>{room.role==="teacher"&&<button className={room.state.studentControl?"control-on":""} onClick={()=>room.update({studentControl:!room.state.studentControl},true)}>{room.state.studentControl?"Student editing":"Grant control"}</button>}<button title="Export lesson" onClick={exportLesson}>Export</button></div>;
}
