"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import { cloneElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode, RefObject, PointerEvent as ReactPointerEvent } from "react";
import type { PrototypeRoom } from "./usePrototypeRoom";
import { HolographicModel } from "./HolographicModel";
import { SubjectHologram } from "./SubjectHologram";
import { formulaSamples, compileFormula, alu, schedule } from "./lessonMath";
import type { SpatialSubject } from "./types";
import { smoothZoom, translatePose, type SpatialPose, clamp } from "./spatialControls";
import { compilerFor, validRuntimes, codeSamples, stageLanguages, type StageLanguage, type CompilerRuntime } from "./codeRuntimes";

type Position = { x: number; y: number };
type DockId = "code" | "math" | "model" | "ink" | "notes" | "asset";
const dockLabels: Record<DockId, string> = { code: "code", math: "maths", model: "visual", ink: "ink pad", notes: "handwritten notes", asset: "lesson image" };

// Only the presentation host changes. Editor values and floating poses remain in the stage.
function Dockable({ id, docked, target, onToggle, children, controls }: {
  id: DockId; docked: boolean; target: HTMLElement | null; onToggle(id: DockId): void;
  children: ReactElement<{ className?: string; children?: ReactNode; style?: CSSProperties }>;
  controls?: ReactNode;
}) {
  if (children.props.style?.display === "none") return children;
  const content = cloneElement(children, {
    className: `${children.props.className ?? ""} dockable-object ${docked ? "docked-object" : ""}`,
    children: <>{controls}{children.props.children}<button type="button" className="object-dock-action" aria-label={`${docked ? "Float" : "Dock"} ${dockLabels[id]} ${docked ? "back to stage" : "to Show tools"}`} onClick={() => onToggle(id)}>{docked ? "↗ Float" : "⇥ Tools"}</button></>,
  });
  return docked && target ? createPortal(content, target, id) : content;
}

const pcbParts = [
  { id: "cpu", label: "CPU", detail: "32-bit teaching core", x: 42, y: 38, tone: "cyan" },
  { id: "ram", label: "RAM", detail: "Working memory", x: 69, y: 28, tone: "violet" },
  { id: "clock", label: "CLOCK", detail: "16 MHz crystal", x: 20, y: 24, tone: "amber" },
  { id: "power", label: "VRM", detail: "Power regulation", x: 19, y: 67, tone: "green" },
  { id: "io", label: "I/O", detail: "Input / output", x: 70, y: 66, tone: "blue" },
  { id: "flash", label: "FLASH", detail: "Program storage", x: 46, y: 73, tone: "rose" },
];

function useDrag(initial: Position & {scale?:number}, id: string, onCommit?: (pose:SpatialPose)=>void, enabled=true) {
  const [position, setPosition] = useState({x:initial.x,y:initial.y});
  const [size,setSize]=useState(initial.scale??1);
  const commitRef=useRef(onCommit),positionRef=useRef(position),sizeRef=useRef(size);
  const origin=useRef<{x:number;y:number;pose:SpatialPose}|null>(null);
  useEffect(()=>{commitRef.current=onCommit;},[onCommit]);
  useEffect(()=>{const next={x:initial.x,y:initial.y};positionRef.current=next;sizeRef.current=initial.scale??1;setPosition(next);setSize(initial.scale??1);},[initial.x,initial.y,initial.scale]);
  const applyPosition=(next:Position)=>{positionRef.current=next;setPosition(next);};
  const moveBy=(panel:HTMLElement,dx:number,dy:number,pose:SpatialPose)=>{
    const rect=panel.closest(".unified-stage")?.getBoundingClientRect();if(!rect)return;
    applyPosition(translatePose(pose,dx,dy,rect,{width:panel.offsetWidth,height:panel.offsetHeight}));
  };
  const end=()=>{if(origin.current)commitRef.current?.({...positionRef.current,scale:sizeRef.current});origin.current=null;};
  useEffect(()=>{
    let span:number|null=null,baseSize=1;
    const handle=(event:Event)=>{
      if(!enabled)return;
      const d=(event as CustomEvent).detail;
      const panel=Array.from(document.querySelectorAll<HTMLElement>(`[data-spatial-id="${id}"]`)).find(item=>item.offsetWidth>0&&item.offsetHeight>0);
      if(!panel)return;
      if(d.phase==="end"){end();if(span!==null)commitRef.current?.({...positionRef.current,scale:sizeRef.current});span=null;panel.classList.remove("air-grabbed");return;}
      if(panel.classList.contains("docked-object"))return;
      if(d.phase==="start"&&d.target===id){origin.current={x:d.x,y:d.y,pose:{...positionRef.current,scale:sizeRef.current}};panel.classList.add("air-grabbed");}
      if(d.phase==="move"&&origin.current&&d.target===id)moveBy(panel,d.x-origin.current.x,d.y-origin.current.y,origin.current.pose);
      if(d.phase==="zoom"&&d.target===id&&id!=="model"){if(span===null){span=d.distance;baseSize=sizeRef.current;}const next=smoothZoom(sizeRef.current,baseSize,d.distance,span??d.distance,.6,1.8);sizeRef.current=next;setSize(next);}
    };
    window.addEventListener("air-spatial",handle);return()=>{window.removeEventListener("air-spatial",handle);origin.current=null;};
  },[id,enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const start=(event:ReactPointerEvent<HTMLElement>)=>{
    const target=event.target as HTMLElement;
    if(!enabled||event.button!==0||event.currentTarget.classList.contains("docked-object")||target.closest("button,input,textarea,select,a"))return;
    if(!target.closest("[data-air-grab]")&&!(id==="model"&&target.tagName==="CANVAS"))return;
    origin.current={x:event.clientX,y:event.clientY,pose:{...positionRef.current,scale:sizeRef.current}};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:ReactPointerEvent<HTMLElement>)=>{if(origin.current)moveBy(event.currentTarget,event.clientX-origin.current.x,event.clientY-origin.current.y,origin.current.pose);};
  const key=(event:KeyboardEvent<HTMLElement>)=>{
    if(!enabled||id!=="model"||event.target!==event.currentTarget)return;
    const delta:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
    if(!delta[event.key])return;event.preventDefault();moveBy(event.currentTarget,...delta[event.key],{...positionRef.current,scale:sizeRef.current});commitRef.current?.({...positionRef.current,scale:sizeRef.current});
  };
  return {position,size,handlers:{onPointerDown:start,onPointerMove:move,onPointerUp:end,onPointerCancel:end,onKeyDown:key}};
}

function InkComposer({ onDock, draft, className = "unified-ink", children }: { onDock(image: string): void; draft: RefObject<string | null>; className?: string; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), active = useRef(false), last = useRef<Position | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState("Write one idea. Pause to dock it.");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && draft.current) {
      const image = new Image();
      image.onload = () => canvas.getContext("2d")?.drawImage(image, 0, 0);
      image.src = draft.current;
      return () => { image.onload = null; draft.current = canvas.toDataURL("image/png"); if (timer.current) clearTimeout(timer.current); };
    }
    return () => { if (canvas) draft.current = canvas.toDataURL("image/png"); if (timer.current) clearTimeout(timer.current); };
  }, [draft]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect=event.currentTarget.getBoundingClientRect(); return {x:(event.clientX-rect.left)*event.currentTarget.width/rect.width,y:(event.clientY-rect.top)*event.currentTarget.height/rect.height}; };
  const clear = () => canvasRef.current?.getContext("2d")?.clearRect(0,0,960,190);
  const scheduleDock = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current=setTimeout(()=>{const canvas=canvasRef.current;if(!canvas)return;onDock(canvas.toDataURL("image/png"));clear();setHint("Line docked · write the next idea");},720);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dockAirStroke = () => scheduleDock();
    canvas.addEventListener("air-ink-complete", dockAirStroke);
    return () => canvas.removeEventListener("air-ink-complete", dockAirStroke);
  });
  return <section className={className} data-spatial-id="ink">
    <div><span>LIVE INK</span><strong>{hint}</strong><button onClick={clear}>Clear</button></div>
    <canvas ref={canvasRef} data-air-ink width={960} height={190} onPointerDown={event=>{active.current=true;event.currentTarget.setPointerCapture(event.pointerId);last.current=point(event);if(timer.current)clearTimeout(timer.current);}} onPointerMove={event=>{if(!active.current||!last.current)return;const next=point(event),context=event.currentTarget.getContext("2d");if(!context)return;context.strokeStyle="#e9fbff";context.lineWidth=8;context.lineCap="round";context.lineJoin="round";context.shadowColor="#39ddff";context.shadowBlur=8;context.beginPath();context.moveTo(last.current.x,last.current.y);context.quadraticCurveTo((last.current.x+next.x)/2,(last.current.y+next.y)/2,next.x,next.y);context.stroke();context.shadowBlur=0;last.current=next;}} onPointerUp={event=>{active.current=false;last.current=null;event.currentTarget.releasePointerCapture(event.pointerId);scheduleDock();}}/>
    {children}
  </section>;
}

async function executeJavaScript(source:string) {
  return new Promise<string>((resolve)=>{
    const url=URL.createObjectURL(new Blob([`const out=[];console.log=(...v)=>out.push(v.join(' '));try{${source}\nself.postMessage(out.join('\\n')||'Program completed')}catch(e){self.postMessage(String(e))}`],{type:"text/javascript"}));
    const worker=new Worker(url);
    const finish=(message:string)=>{window.clearTimeout(timeout);worker.terminate();URL.revokeObjectURL(url);resolve(message);};
    const timeout=window.setTimeout(()=>finish("Stopped after 3 seconds"),3000);
    worker.onmessage=event=>finish(String(event.data));worker.onerror=event=>finish(event.message);
  });
}

function formulaPath(formula:string) {
  try {
    let connected=false;
    return formulaSamples(formula).map(({y},index)=>{if(!Number.isFinite(y)||Math.abs(y)>20){connected=false;return "";}const command=connected?"L":"M";connected=true;return `${command}${(index/240*720).toFixed(1)},${(130-Math.max(-3,Math.min(3,y))*34).toFixed(1)}`;}).join(" ");
  } catch { return ""; }
}

export function UnifiedLiveStage({ room, notify }: { room: PrototypeRoom; notify(message:string):void }) {
  const updateRoom=room.update;
  const [docked, setDocked] = useState<DockId[]>([]);
  const [dockTarget, setDockTarget] = useState<HTMLDivElement | null>(null);
  const inkDraft = useRef<string | null>(null);
  const toggleDock = (id: DockId) => {
    setDocked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    if (!docked.includes(id)) setSidebar(true);
  };
  const dockProps = (id: DockId) => ({ id, docked: docked.includes(id), target: dockTarget, onToggle: toggleDock, controls: id === "model" ? visualControls : undefined });
  const [zoom,setZoom]=useState(room.state.stageZoom),[explode,setExplode]=useState(room.state.stageExplode),[selected,setSelected]=useState(room.state.stageSelectedPart),[removed,setRemoved]=useState<string[]>(room.state.stageRemovedParts),[notes,setNotes]=useState<string[]>(room.state.stageNotes);
  const [code,setCode]=useState(room.state.stageCode),[output,setOutput]=useState(room.state.stageCodeOutput),[running,setRunning]=useState(false);
  const language = room.state.stageLanguage ?? "javascript";
  const drafts = useRef<Partial<Record<StageLanguage,string>>>({});
  const [runtimes,setRuntimes]=useState<CompilerRuntime[]>([]),[compilerStatus,setCompilerStatus]=useState("Checking compiler…");
  const [brightness,setBrightness]=useState(room.state.stageBrightness ?? 1.2);
  const checkCompiler=async()=>{setCompilerStatus("Checking compiler…");try{const response=await fetch("/api/execute",{signal:AbortSignal.timeout(6000)});const payload=await response.json();const available=payload.configured?validRuntimes(payload.runtimes):[];setRuntimes(available);setCompilerStatus(available.length?"Compiler connected":"C / C++ / Java execution needs JUDGE0_BASE_URL. You can still edit and project your source.");}catch{setRuntimes([]);setCompilerStatus("Compiler unreachable. Retry or configure JUDGE0_BASE_URL; your code is safe.");}};
  useEffect(()=>{void checkCompiler();},[]);
  const selectLanguage=(next:StageLanguage)=>{if(!room.canEdit||running)return;drafts.current={...room.state.stageCodeDrafts,...drafts.current,[language]:code};const nextCode=drafts.current[next]??codeSamples[next];setCode(nextCode);setOutput("Ready to execute");updateRoom({stageLanguage:next,stageCode:nextCode,stageCodeOutput:"Ready to execute",stageCodeDrafts:drafts.current});};
  useEffect(()=>{setBrightness(room.state.stageBrightness??1.2);},[room.state.stageBrightness]);
  const [formula,setFormula]=useState(room.state.stageFormula),[wave,setWave]=useState(room.state.stageFormula);
  const [mathError,setMathError]=useState(""),[subject,setSubject]=useState<SpatialSubject>(room.state.stageSubject??"semiconductor");
  const functionInput=useRef<HTMLInputElement>(null);
  const subjects:{id:SpatialSubject;title:string;detail:string}[]=[{id:"semiconductor",title:"◈ Semiconductor",detail:"MOSFET · layers & electron flow"},{id:"maths",title:"∿ Mathematics",detail:"Functions · Fourier · particle waves"},{id:"coding",title:"⌘ Coding",detail:"Neon source · executable output"},{id:"os",title:"◎ Operating systems",detail:"Round-robin · process queues"},{id:"coa",title:"▦ Computer architecture",detail:"CPU · registers · one-bit ALU"}];
  const chooseSubject=(next:SpatialSubject)=>{if(!room.canEdit)return;setSubject(next);updateRoom({stageSubject:next});setSidebar(false);};
  useEffect(()=>{setSubject(room.state.stageSubject??"semiconductor");},[room.state.stageSubject]);
  const visualize=(next:string)=>{if(!room.canEdit)return;try{compileFormula(next);setFormula(next);setWave(next);setMathError("");setSubject("maths");updateRoom({stageFormula:next,stageSubject:"maths"});}catch(error){setMathError(error instanceof Error?error.message:"Invalid function");}};
  const importFunction=async(file:File)=>{if(!room.canEdit)return;if(file.size>32_000){setMathError("Choose a function file smaller than 32 KB.");return;}try{const text=await file.text();const candidate=file.name.toLowerCase().endsWith(".json")?JSON.parse(text).formula:text.trim();if(typeof candidate!=="string")throw new Error('JSON must contain a "formula" string.');visualize(candidate);}catch(error){setMathError(error instanceof Error?error.message:"Unable to read function file.");}};
  const codeDrag=useDrag(room.state.stageCodePose,"code",pose=>updateRoom({stageCodePose:pose}),room.canEdit),mathDrag=useDrag(room.state.stageMathPose,"math",pose=>updateRoom({stageMathPose:pose}),room.canEdit),assetDrag=useDrag({x:35,y:30},"asset",undefined,room.canEdit);
  const modelDrag=useDrag(room.state.stageModelPose??{x:14,y:10,scale:1},"model",pose=>updateRoom({stageModelPose:pose}),room.canEdit);
  const modelStyle={left:`${modelDrag.position.x}%`,top:`${modelDrag.position.y}%`} as CSSProperties;
  const changeZoom=(next:number)=>{if(!room.canEdit)return;const value=clamp(next,.6,2.4);zoomRef.current=value;setZoom(value);updateRoom({stageZoom:value});};
  const resetVisual=()=>{if(!room.canEdit)return;setZoom(1);zoomRef.current=1;setRotation(.1);updateRoom({stageZoom:1,stageRotation:.1,stageModelPose:{x:14,y:10,scale:1}});};
  const zoomControls=<div className="visual-zoom-controls" role="group" aria-label="Visualization zoom"><button aria-label="Zoom visual out" disabled={!room.canEdit||zoom<=.6} onClick={()=>changeZoom(zoom/1.12)}>−</button><output aria-live="polite">{Math.round(zoom*100)}%</output><button aria-label="Zoom visual in" disabled={!room.canEdit||zoom>=2.4} onClick={()=>changeZoom(zoom*1.12)}>+</button><button aria-label="Reset visual position and zoom" disabled={!room.canEdit} onClick={resetVisual}>↺</button></div>;
  const visualControls=<div className="visual-manipulation" data-air-grab="model"><span>⋮⋮ Move visual</span>{docked.includes("model")&&zoomControls}</div>;
  const [sidebar,setSidebar]=useState(false),[model,setModel]=useState<"semiconductor"|"pcb">(room.state.stageModel),[rotation,setRotation]=useState(room.state.stageRotation),[conducting,setConducting]=useState(room.state.stageGateOn),[asset,setAsset]=useState<string|null>(null);
  useEffect(()=>{setDocked(current=>current.filter(id=>(id!=="asset"||!!asset)&&(id!=="notes"||notes.length>0)));},[asset,notes.length]);
  const rotationRef=useRef(rotation);
  useEffect(()=>{rotationRef.current=rotation;},[rotation]);
  useEffect(()=>{setModel(room.state.stageModel);setRotation(room.state.stageRotation);setConducting(room.state.stageGateOn);},[room.state.stageModel,room.state.stageRotation,room.state.stageGateOn]);
  const chooseModel=(next:"semiconductor"|"pcb")=>{if(!room.canEdit)return;setModel(next);updateRoom({stageModel:next});};
  const gateToggle=()=>{if(!room.canEdit)return;setConducting(!conducting);updateRoom({stageGateOn:!conducting});};
  const assetInput=useRef<HTMLInputElement>(null),zoomRef=useRef(zoom);
  useEffect(()=>{zoomRef.current=zoom;},[zoom]);
  useEffect(()=>{
    let span:number|null=null,baseZoom=1;
    const handle=(event:Event)=>{const d=(event as CustomEvent).detail;
      if(d.phase==="sidebar")setSidebar(value=>!value);
      if(d.phase==="zoom"&&d.target==="model"&&room.canEdit){if(span===null){span=d.distance;baseZoom=zoomRef.current;}const next=smoothZoom(zoomRef.current,baseZoom,d.distance,span??d.distance);zoomRef.current=next;setZoom(next);}
      if(d.phase==="rotate"&&room.canEdit)setRotation(value=>value+clamp(d.delta,-.08,.08));
      if(d.phase==="orbit-end")updateRoom({stageRotation:rotationRef.current});
      if(d.phase==="end"&&span!==null){span=null;updateRoom({stageZoom:zoomRef.current});}
    };window.addEventListener("air-spatial",handle);return()=>window.removeEventListener("air-spatial",handle);
  },[updateRoom,room.canEdit]);
  useEffect(()=>{const handle=(event:Event)=>{const target=(event as CustomEvent).detail;if(target.phase!=="dock")return;if(["code","math","model","ink","notes","asset"].includes(target.target)){const id=target.target as DockId;setDocked(current=>current.includes(id)?current:[...current,id]);setSidebar(true);notify(`${dockLabels[id]} moved into Show tools`);}};window.addEventListener("air-spatial",handle);return()=>window.removeEventListener("air-spatial",handle);},[notify]);
  useEffect(()=>{const wheel=(event:WheelEvent)=>{const object=(event.target as HTMLElement)?.closest<HTMLElement>('[data-spatial-id="model"]');if(!room.canEdit||!object||(object.classList.contains("docked-object")&&!event.ctrlKey)||(event.target as HTMLElement).closest("input,button,select"))return;event.preventDefault();const next=clamp(zoomRef.current*Math.exp(-clamp(event.deltaY,-120,120)*.002),.6,2.4);zoomRef.current=next;setZoom(next);updateRoom({stageZoom:next});};window.addEventListener("wheel",wheel,{passive:false});return()=>window.removeEventListener("wheel",wheel);},[room.canEdit,updateRoom]);
  useEffect(()=>{return()=>{if(asset)URL.revokeObjectURL(asset);};},[asset]);
  const selectedPart=pcbParts.find(part=>part.id===selected)??pcbParts[0],path=useMemo(()=>formulaPath(wave),[wave]);
  useEffect(()=>{setCode(room.state.stageCode);setOutput(room.state.stageCodeOutput);},[room.state.stageCode,room.state.stageCodeOutput]);
  useEffect(()=>{if(!room.canEdit||code===room.state.stageCode)return;const timer=window.setTimeout(()=>updateRoom({stageCode:code}),350);return()=>window.clearTimeout(timer);},[code,room.canEdit,room.state.stageCode,updateRoom]);
  useEffect(()=>{setFormula(room.state.stageFormula);setWave(room.state.stageFormula);},[room.state.stageFormula]);
  useEffect(()=>{setSelected(room.state.stageSelectedPart);setRemoved(room.state.stageRemovedParts);setZoom(room.state.stageZoom);setExplode(room.state.stageExplode);setNotes(room.state.stageNotes);},[room.state.stageSelectedPart,room.state.stageRemovedParts,room.state.stageZoom,room.state.stageExplode,room.state.stageNotes]);
  const runtime=compilerFor(language,runtimes);
  const canRun=language==="javascript"||!!runtime;
  const run=async()=>{if(!room.canEdit||running||!canRun)return;setRunning(true);try{let result:string;if(language==="javascript")result=await executeJavaScript(code);else{const response=await fetch("/api/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceCode:code,languageId:runtime!.id}),signal:AbortSignal.timeout(30000)});const payload=await response.json();if(!response.ok||payload.error||payload.success===false)throw new Error(payload.error??payload.output??"Compiler failed. Your source is preserved.");result=payload.output??"Program completed";}setOutput(result);setSubject("coding");updateRoom({stageCode:code,stageCodeOutput:result,stageSubject:"coding"});notify("Output shared · numeric values become particle columns");}catch(error){const message=error instanceof Error?error.message:"Execution failed; retry.";setOutput(message);updateRoom({stageCodeOutput:message});notify("Execution failed · source preserved");}finally{setRunning(false);}};
  const togglePart=()=>{if(!room.canEdit)return;const next=removed.includes(selected)?removed.filter(id=>id!==selected):[...removed,selected];setRemoved(next);room.update({stageRemovedParts:next});};
  const visualTitle=subject==="semiconductor"?(model==="pcb"?"Teaching PCB":"MOSFET"):subjects.find(item=>item.id===subject)?.title.slice(2);
  const visualDescription=subject==="semiconductor"?(model==="pcb"?`Inspecting ${selectedPart.label} · ${selectedPart.detail}`:"Field-effect transistor · layers & electron flow"):subject==="maths"?`f(x) = ${wave}`:subject==="coding"?"Explicit execution · neon source & particle output":subject==="os"?"Round-robin scheduling · quantum 1":"One-bit ALU · registers & datapath";
  const visualDetails=subject!=="semiconductor"?<div className="holo-caption"><span>LIVE SUBJECT / {subject.toUpperCase()}</span><strong>{subjects.find(item=>item.id===subject)?.title.slice(2)}</strong>{subject==="maths"&&<p>A sampled function in space · depth is illustrative. Turn your wrist to orbit; spread your palms to magnify.</p>}{subject==="coding"&&<p>Type in the floating editor. Run explicitly to project numeric results as particle columns.</p>}{subject==="os"&&<><p>Round-robin · quantum 1 · jobs 5, 3, 4 ticks. Completed: {room.state.simulationStep}/12</p><div className="simulation-trace">{schedule(room.state.simulationStep).trace.map((job,i)=><i key={i}>P{job+1}</i>)}</div><button disabled={!room.canEdit||room.state.simulationStep>=12} onClick={()=>updateRoom({simulationStep:Math.min(12,room.state.simulationStep+1)})}>Advance CPU tick</button><button disabled={!room.canEdit} onClick={()=>updateRoom({simulationStep:0})}>Restart</button></>}{subject==="coa"&&<><p>One-bit datapath · registers feed an ALU. Explode to separate components.</p><div className="coa-controls"><button disabled={!room.canEdit} onClick={()=>updateRoom({logicA:room.state.logicA?0:1})}>A = {room.state.logicA}</button><button disabled={!room.canEdit} onClick={()=>updateRoom({logicB:room.state.logicB?0:1})}>B = {room.state.logicB}</button>{(["ADD","AND","OR","XOR"] as const).map(op=><button key={op} aria-pressed={room.state.logicOperation===op} disabled={!room.canEdit} onClick={()=>updateRoom({logicOperation:op})}>{op}</button>)}</div><p role="status">Result {alu(room.state.logicA,room.state.logicB,room.state.logicOperation).result} · carry {alu(room.state.logicA,room.state.logicB,room.state.logicOperation).carry}</p></>}</div>:<div className="holo-caption"><span>LIVE MODEL / 001</span><strong>MOSFET</strong><p>Field effect transistor · separate the layers and trace the electrons.</p><button disabled={!room.canEdit} onClick={gateToggle}>{conducting?"Gate ON · electrons flowing":"Gate OFF · channel closed"}</button></div>;
  const resetSpace=()=>{if(!room.canEdit)return;resetVisual();setExplode(36);setRemoved([]);updateRoom({stageExplode:36,stageRemovedParts:[]});};
  return <section className="unified-stage" style={{"--visual-brightness":brightness} as CSSProperties}>
    <div className="unified-hud"><div><i/><span>HOLOSPACE / LIVE CLASSROOM</span></div><p>Pinch + move visual · two palms to zoom · V hold to dock</p></div>
    <div className="spatial-stage-actions"><button className="spatial-tools-toggle" aria-controls="classroom-tools" aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}>☷ <span>{sidebar?"Hide tools":"Show tools"}{docked.length?` (${docked.length})`:""}</span></button><button onClick={()=>window.dispatchEvent(new Event("air-camera-start"))}>◎ Enable hand control</button><button onClick={()=>{if(docked.length){setDocked([]);}else{setDocked(["code","math","model","ink",...(notes.length?["notes" as const]:[]),...(asset?["asset" as const]:[])]);setSidebar(true);}}}>{docked.length?"↗ Float all":"⇥ Dock all to tools"}</button></div>
    <aside id="classroom-tools" className="spatial-sidebar object-dock" aria-label="Spatial tools and docked objects" hidden={!sidebar}>
      <header><span>SPATIAL INSTRUMENTS</span><strong>Shape the lesson.</strong><button onClick={()=>setSidebar(false)} aria-label="Close spatial tools">×</button></header>
      <p>Fist hold: show / hide tools. Point a V sign at an object and hold for one second to dock it here.</p>
      <details className="instrument-settings" open={docked.length===0}><summary>Subjects &amp; visual settings</summary>
        <div className="subject-picker">{subjects.map(item=><button key={item.id} disabled={!room.canEdit} onClick={()=>chooseSubject(item.id)} aria-pressed={subject===item.id}><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
        {subject==="semiconductor"&&<><button disabled={!room.canEdit} onClick={()=>chooseModel(model==="pcb"?"semiconductor":"pcb")}>{model==="pcb"?"Show MOSFET":"Show exploded PCB"}</button><button disabled={!room.canEdit} onClick={gateToggle}>{conducting?"● Current flowing":"○ Gate off"} · toggle gate</button></>}
        <label>EXPLODE LAYERS <input disabled={!room.canEdit} aria-label="Hologram explosion" type="range" min="0" max="100" value={explode} onChange={e=>{setExplode(+e.target.value);updateRoom({stageExplode:+e.target.value});}}/></label>
        <label>MODEL SCALE · {Math.round(zoom*100)}% <input disabled={!room.canEdit} aria-label="Hologram scale" type="range" min=".6" max="2.4" step=".05" value={zoom} onChange={e=>changeZoom(+e.target.value)}/></label>
        <label>BRIGHTNESS · {Math.round(brightness*100)}% <input disabled={!room.canEdit} aria-label="Visual brightness" type="range" min=".7" max="1.8" step=".05" value={brightness} onChange={e=>{setBrightness(+e.target.value);updateRoom({stageBrightness:+e.target.value});}}/></label>
        <label>ORBIT <input disabled={!room.canEdit} aria-label="Hologram rotation" type="range" min="-3.14" max="3.14" step=".02" value={rotation} onChange={e=>{setRotation(+e.target.value);updateRoom({stageRotation:+e.target.value});}}/></label>
        <button disabled={!room.canEdit} onClick={resetVisual}>Reset visual position &amp; zoom</button><button onClick={()=>assetInput.current?.click()}>＋ Add floating image</button><button disabled={!room.canEdit} onClick={()=>functionInput.current?.click()}>∿ Import maths function</button>
      </details>
      <div className="object-dock-summary"><span>{docked.length?`${docked.length} objects in tools`:"No docked objects"}</span>{docked.length>0&&<button onClick={()=>setDocked([])}>Float all</button>}</div>
      <div ref={setDockTarget} className="object-dock-content"/>
      {!docked.length&&<p className="object-dock-empty">Click ⇥ Tools on an object, or hold a V sign over it. Float returns it to its saved position.</p>}
      <details className="spatial-gesture-guide"><summary>Gesture guide</summary><p>Fist hold → show / hide tools</p><p>V sign + one-second hold → dock focused object</p><p>Quick pinch on a visible button → activate</p><p>Pinch + move visual or header → move</p><p>Two open palms, hold briefly → zoom focused object</p><p>Open palm + turn wrist → orbit model</p><p>Mouse wheel over visual → zoom; arrow keys → move</p><p>Pinch on live ink → luminous marker</p></details>
    </aside>
    <input ref={functionInput} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importFunction(file);e.target.value="";}}/>
    {subject!=="semiconductor"&&<Dockable {...dockProps("model")}><div className="semiconductor-hologram subject-hologram movable-visual" data-spatial-id="model" style={modelStyle} tabIndex={0} aria-label="Move subject visualization" {...modelDrag.handlers}><SubjectHologram subject={subject} formula={wave} code={code} output={output} zoom={zoom} rotation={rotation} explode={explode} tick={room.state.simulationStep} a={room.state.logicA} b={room.state.logicB} operation={room.state.logicOperation}/>{docked.includes("model")&&visualDetails}</div></Dockable>}
    <input ref={assetInput} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];if(file?.type.startsWith("image/")){setAsset(URL.createObjectURL(file));notify("Image added · pinch its header to move, use two palms to scale");}e.target.value="";}}/>
    {asset&&<Dockable {...dockProps("asset")}><article data-spatial-id="asset" className="floating-asset glass-object" style={{left:`${assetDrag.position.x}%`,top:`${assetDrag.position.y}%`,transform:`scale(${assetDrag.size})`,transformOrigin:"top left"}} {...assetDrag.handlers}><header data-air-grab="asset"><strong>Lesson image</strong><button onClick={()=>setAsset(null)} aria-label="Remove lesson image">×</button></header><img src={asset} alt="Imported lesson reference"/></article></Dockable>}
    {subject==="semiconductor"&&model==="semiconductor"&&<Dockable {...dockProps("model")}><div className="semiconductor-hologram movable-visual" data-spatial-id="model" style={modelStyle} tabIndex={0} aria-label="Move semiconductor visualization" {...modelDrag.handlers}><HolographicModel explode={explode} zoom={zoom} rotation={rotation} conducting={conducting}/>{docked.includes("model")&&visualDetails}</div></Dockable>}
    {notes.length > 0 && <Dockable {...dockProps("notes")}><div className="note-stack" data-spatial-id="notes">{notes.slice(-4).map((note,index)=><article key={note.slice(-30)+index} style={{transform:`translate(${index*8}px,${index*58}px)`}}><img src={note} alt={`Docked handwritten line ${index+1}`}/><button disabled={!room.canEdit} onClick={()=>{const next=notes.filter(item=>item!==note);setNotes(next);room.update({stageNotes:next});}}>×</button></article>)}</div></Dockable>}
    <Dockable {...dockProps("ink")}><InkComposer className="unified-ink" draft={inkDraft} onDock={image=>{if(!room.canEdit)return;const next=[...notes,image].slice(-4);setNotes(next);room.update({stageNotes:next});notify("Handwritten line docked and shared to the upper-left");}}/></Dockable>
    <Dockable {...dockProps("model")}><div data-spatial-id="model" className="pcb-world movable-visual" tabIndex={0} aria-label="Move PCB visualization" {...modelDrag.handlers} style={{...modelStyle,display:subject==="semiconductor"&&model==="pcb"?undefined:"none","--pcb-zoom":zoom,"--pcb-explode":`${explode}px`} as CSSProperties}>
      <div className="pcb-toolbar"><div><span>LIVE OBJECT · PCB</span><strong>AirBoard teaching board</strong></div><label>ZOOM <input type="range" min="0.65" max="1.8" step="0.05" value={zoom} disabled={!room.canEdit} onChange={event=>{const next=Number(event.target.value);setZoom(next);room.update({stageZoom:next});}}/></label><label>EXPLODE <input type="range" min="0" max="100" value={explode} disabled={!room.canEdit} onChange={event=>{const next=Number(event.target.value);setExplode(next);room.update({stageExplode:next});}}/></label></div>
      <div className="pcb-viewport"><div className="pcb-board"><div className="pcb-grid"/><div className="trace trace-a"/><div className="trace trace-b"/><div className="trace trace-c"/>{pcbParts.map((part,index)=><button data-air-action key={part.id} className={`pcb-component pcb-${part.tone} ${selected===part.id?"selected":""} ${removed.includes(part.id)?"removed":""}`} style={{left:`${part.x}%`,top:`${part.y}%`,"--part-index":index,transform:removed.includes(part.id)?"translateZ(140px) translateY(-120px) rotate(7deg) scale(1.12)":`translateZ(${18+explode}px) translateY(${-explode*.18}px)`} as CSSProperties} onClick={()=>{if(!room.canEdit)return;setSelected(part.id);room.update({stageSelectedPart:part.id});}}><i/><strong>{part.label}</strong><small>{part.detail}</small></button>)}<div className="pcb-pulse"><i/><i/><i/></div></div></div>
      <aside className="part-callout"><span>INSPECTING</span><h3>{selectedPart.label}</h3><p>{selectedPart.detail}. Pinch to isolate this component, then lift it away from the board.</p><button data-air-action disabled={!room.canEdit} onClick={togglePart}>{removed.includes(selected)?"Return to board":"Lift component"}</button></aside>
    </div></Dockable>
    <Dockable {...dockProps("code")}><article data-spatial-id="code" className="floating-code glass-object" style={{"--card-left":`${codeDrag.position.x}%`,left:`${codeDrag.position.x}%`,top:`${codeDrag.position.y}%`,transform:`scale(${codeDrag.size})`,transformOrigin:"top left"} as CSSProperties} {...codeDrag.handlers}>
      <header data-air-grab="code"><div><span>LIVE CODE · PINCH HEADER TO GRAB</span><strong>Floating editor</strong></div><b>{running?"RUNNING":"READY"}</b></header>
      <div className="stage-runtime-bar"><label>LANGUAGE <select aria-label="Floating code language" value={language} disabled={!room.canEdit||running} onChange={e=>selectLanguage(e.target.value as StageLanguage)}>{stageLanguages.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>{language==="javascript"?"On-device worker":runtime?.name??"Compiler not connected"}</span><button disabled={!room.canEdit} onClick={()=>{if(!room.canEdit)return;setSubject("coding");updateRoom({stageSubject:"coding",stageCode:code});}}>Project source</button></div>
      <textarea aria-label="Floating code editor" value={code} disabled={!room.canEdit||running} spellCheck={false} onChange={event=>setCode(event.target.value)} onBlur={()=>{if(room.canEdit)updateRoom({stageCode:code});}}/><div className="code-actions"><button data-air-action disabled={!room.canEdit||running||!canRun} onClick={run}>{running?"Executing…":"Run + visualize"}</button><span>{output}</span></div>
      {language!=="javascript"&&<div className="compiler-status" role="status"><span>{!runtime&&runtimes.length ? "This compiler does not offer the selected language. Choose another runtime." : compilerStatus}</span><button disabled={running} onClick={()=>void checkCompiler()}>Retry compiler</button></div>}
      <div className={`code-orbit ${running?"running":""}`}>{Array.from({length:12},(_,i)=><i key={i} style={{"--particle":i} as CSSProperties}/>) }<strong>{output.match(/\d+/g)?.at(-1)??"●"}</strong></div>
    </article></Dockable>
    <Dockable {...dockProps("math")}><article data-spatial-id="math" className="floating-math glass-object" style={{"--card-left":`${mathDrag.position.x}%`,left:`${mathDrag.position.x}%`,top:`${mathDrag.position.y}%`,transform:`scale(${mathDrag.size})`,transformOrigin:"top left"} as CSSProperties} {...mathDrag.handlers}>
      <header data-air-grab="math"><div><span>MATHEMATICS · LIVE MEANING</span><strong>Function studio</strong></div><button data-air-action disabled={!room.canEdit} onClick={()=>visualize(formula)}>Visualize</button></header>
      <input value={formula} disabled={!room.canEdit} onChange={event=>setFormula(event.target.value)} onKeyDown={e=>{if(e.key==="Enter")visualize(formula);}} aria-label="Mathematical function"/><div className="math-presets"><button disabled={!room.canEdit} onClick={()=>visualize("sin(x) + 0.45*sin(3*x)")}>Fourier</button><button disabled={!room.canEdit} onClick={()=>visualize("exp(-x^2/4)*cos(4*x)")}>Wave packet</button><button disabled={!room.canEdit} onClick={()=>functionInput.current?.click()}>Import .txt / .json</button></div>{mathError&&<p className="math-error" role="alert">{mathError}</p>}
      <svg viewBox="0 0 720 260" preserveAspectRatio="none"><defs><linearGradient id="waveGlow"><stop stopColor="#77edff"/><stop offset="1" stopColor="#7c86ff"/></linearGradient></defs><path className="math-gridline" d="M0 130H720M360 0V260"/><path className="math-wave" d={path}/></svg><div className="wave-meaning"><b>TIME</b><i/><span>The curve is built from rotating frequencies. Drag this card beside your face and explain each harmonic.</span></div>
    </article></Dockable>
    <footer className="visualization-bottom-bar" aria-label="Visualization controls">
      <div className="bottom-visual-title"><span>LIVE VISUAL / {docked.includes("model")?"IN TOOLS":"ON STAGE"}</span><strong>{visualTitle}</strong><small>{visualDescription}</small></div>
      <div className="bottom-visual-actions">
        {subject==="semiconductor"&&(model==="pcb"?<button data-air-action className="visual-run-action" disabled={!room.canEdit} onClick={togglePart}>{removed.includes(selected)?"Return":"Lift"} {selectedPart.label}</button>:<button data-air-action className="visual-run-action" disabled={!room.canEdit} aria-pressed={conducting} onClick={gateToggle}>{conducting?"Ⅱ Pause visualization":"▶ Run visualization"}</button>)}
        {subject==="maths"&&<button data-air-action className="visual-run-action" disabled={!room.canEdit} onClick={()=>visualize(formula)}>▶ Visualize function</button>}
        {subject==="coding"&&<button data-air-action className="visual-run-action" disabled={!room.canEdit||running||!canRun} title={!canRun?"Connect a compiler in Show tools to run this language":undefined} onClick={run}>{running?"Executing…":"▶ Run + visualize"}</button>}
        {subject==="os"&&<button data-air-action className="visual-run-action" disabled={!room.canEdit||room.state.simulationStep>=12} onClick={()=>updateRoom({simulationStep:Math.min(12,room.state.simulationStep+1)})}>▶ Advance CPU tick</button>}
        {subject==="coa"&&<span className="bottom-alu-result" role="status">Result {alu(room.state.logicA,room.state.logicB,room.state.logicOperation).result} · carry {alu(room.state.logicA,room.state.logicB,room.state.logicOperation).carry}</span>}
        {!docked.includes("model")&&zoomControls}
        <button disabled={!room.canEdit} onClick={resetSpace}>Reset space</button>
        {!(subject==="semiconductor"&&model==="pcb")&&!docked.includes("model")&&<details className="bottom-visual-details" key={subject}><summary>Details</summary>{visualDetails}</details>}
      </div>
    </footer>
  </section>;
}
