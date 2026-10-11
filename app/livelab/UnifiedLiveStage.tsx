"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { PrototypeRoom } from "./usePrototypeRoom";
import { HolographicModel } from "./HolographicModel";

type Position = { x: number; y: number };

const pcbParts = [
  { id: "cpu", label: "CPU", detail: "32-bit teaching core", x: 42, y: 38, tone: "cyan" },
  { id: "ram", label: "RAM", detail: "Working memory", x: 69, y: 28, tone: "violet" },
  { id: "clock", label: "CLOCK", detail: "16 MHz crystal", x: 20, y: 24, tone: "amber" },
  { id: "power", label: "VRM", detail: "Power regulation", x: 19, y: 67, tone: "green" },
  { id: "io", label: "I/O", detail: "Input / output", x: 70, y: 66, tone: "blue" },
  { id: "flash", label: "FLASH", detail: "Program storage", x: 46, y: 73, tone: "rose" },
];

function useDrag(initial: Position & {scale?:number}, id: string, onCommit?: (pose:Position & {scale:number})=>void) {
  const [position, setPosition] = useState(initial);
  const [size,setSize]=useState(initial.scale??1);
  const commitRef=useRef(onCommit);
  useEffect(()=>{commitRef.current=onCommit;},[onCommit]);
  useEffect(()=>{setPosition({x:initial.x,y:initial.y});setSize(initial.scale??1);},[initial.x,initial.y,initial.scale]);
  const positionRef=useRef(position),sizeRef=useRef(size);
  useEffect(()=>{positionRef.current=position;sizeRef.current=size;},[position,size]);
  useEffect(()=>{
    let grab:{x:number;y:number;position:Position}|null=null;
    let span:number|null=null,baseSize=1;
    const handle=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      const panel=document.querySelector<HTMLElement>(`[data-spatial-id="${id}"]`);
      const stage=panel?.closest<HTMLElement>(".unified-stage"),rect=stage?.getBoundingClientRect();
      if(!panel||!rect)return;
      if(detail.phase==="start"&&detail.target===id){grab={x:detail.x,y:detail.y,position:positionRef.current};panel.classList.add("air-grabbed");}
      if(detail.phase==="move"&&grab){const maxX=Math.max(0,100-panel.offsetWidth*sizeRef.current/rect.width*100),maxY=Math.max(0,100-panel.offsetHeight*sizeRef.current/rect.height*100);setPosition({x:Math.max(0,Math.min(maxX,grab.position.x+(detail.x-grab.x)/rect.width*100)),y:Math.max(0,Math.min(maxY,grab.position.y+(detail.y-grab.y)/rect.height*100))});}
      if(detail.phase==="end"){if(grab||span!==null)commitRef.current?.({...positionRef.current,scale:sizeRef.current});grab=null;span=null;panel.classList.remove("air-grabbed");}
      if(detail.phase==="zoom"&&detail.target===id){if(span===null){span=detail.distance;baseSize=sizeRef.current;}setSize(Math.max(.6,Math.min(1.8,baseSize*detail.distance/Math.max(.08,span??.08))));}
    };
    window.addEventListener("air-spatial",handle);return()=>window.removeEventListener("air-spatial",handle);
  },[id]);
  const origin = useRef<{ pointerX: number; pointerY: number; panel: Position } | null>(null);
  const start = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select")) return;
    origin.current = { pointerX: event.clientX, pointerY: event.clientY, panel: position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!origin.current) return;
    const rect=event.currentTarget.closest(".unified-stage")?.getBoundingClientRect();
    const deltaX = ((event.clientX - origin.current.pointerX) / (rect?.width||window.innerWidth)) * 100;
    const deltaY = ((event.clientY - origin.current.pointerY) / (rect?.height||window.innerHeight)) * 100;
    const maxX=Math.max(1,100-event.currentTarget.offsetWidth*size/(rect?.width||window.innerWidth)*100),maxY=Math.max(2,100-event.currentTarget.offsetHeight*size/(rect?.height||window.innerHeight)*100);
    setPosition({ x: Math.max(1, Math.min(maxX, origin.current.panel.x + deltaX)), y: Math.max(2, Math.min(maxY, origin.current.panel.y + deltaY)) });
  };
  const end = () => { if(origin.current)commitRef.current?.({...positionRef.current,scale:sizeRef.current});origin.current = null; };
  return { position, size, handlers: { onPointerDown: start, onPointerMove: move, onPointerUp: end, onPointerCancel:end } };
}

function InkComposer({ onDock }: { onDock(image: string): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), active = useRef(false), last = useRef<Position | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState("Write one idea. Pause to dock it.");
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
  return <section className="unified-ink">
    <div><span>LIVE INK</span><strong>{hint}</strong><button onClick={clear}>Clear</button></div>
    <canvas ref={canvasRef} data-air-ink width={960} height={190} onPointerDown={event=>{active.current=true;event.currentTarget.setPointerCapture(event.pointerId);last.current=point(event);if(timer.current)clearTimeout(timer.current);}} onPointerMove={event=>{if(!active.current||!last.current)return;const next=point(event),context=event.currentTarget.getContext("2d");if(!context)return;context.strokeStyle="#e9fbff";context.lineWidth=8;context.lineCap="round";context.lineJoin="round";context.shadowColor="#39ddff";context.shadowBlur=8;context.beginPath();context.moveTo(last.current.x,last.current.y);context.quadraticCurveTo((last.current.x+next.x)/2,(last.current.y+next.y)/2,next.x,next.y);context.stroke();context.shadowBlur=0;last.current=next;}} onPointerUp={event=>{active.current=false;last.current=null;event.currentTarget.releasePointerCapture(event.pointerId);scheduleDock();}}/>
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
  const clean=formula.toLowerCase().replace(/π/g,"pi");
  if (!/^[0-9xpi+\-*/().\sincotas]+$/.test(clean)) return "";
  try {
    const expression=clean.replace(/\bpi\b/g,"Math.PI").replace(/\bsin\b/g,"Math.sin").replace(/\bcos\b/g,"Math.cos").replace(/\btan\b/g,"Math.tan");
    const fn=new Function("x",`return ${expression}`) as (x:number)=>number;
    return Array.from({length:181},(_,index)=>{const x=-Math.PI*2+index/180*Math.PI*4,y=Math.max(-3,Math.min(3,Number(fn(x))||0)),px=index/180*720,py=130-y*34;return `${index?"L":"M"}${px.toFixed(1)},${py.toFixed(1)}`;}).join(" ");
  } catch { return ""; }
}

export function UnifiedLiveStage({ room, notify }: { room: PrototypeRoom; notify(message:string):void }) {
  const updateRoom=room.update;
  const [zoom,setZoom]=useState(room.state.stageZoom),[explode,setExplode]=useState(room.state.stageExplode),[selected,setSelected]=useState(room.state.stageSelectedPart),[removed,setRemoved]=useState<string[]>(room.state.stageRemovedParts),[notes,setNotes]=useState<string[]>(room.state.stageNotes);
  const [code,setCode]=useState(room.state.stageCode),[output,setOutput]=useState(room.state.stageCodeOutput),[running,setRunning]=useState(false);
  const [formula,setFormula]=useState(room.state.stageFormula),[wave,setWave]=useState(room.state.stageFormula);
  const codeDrag=useDrag(room.state.stageCodePose,"code",pose=>updateRoom({stageCodePose:pose})),mathDrag=useDrag(room.state.stageMathPose,"math",pose=>updateRoom({stageMathPose:pose})),assetDrag=useDrag({x:35,y:30},"asset");
  const [sidebar,setSidebar]=useState(false),[model,setModel]=useState<"semiconductor"|"pcb">(room.state.stageModel),[rotation,setRotation]=useState(room.state.stageRotation),[conducting,setConducting]=useState(room.state.stageGateOn),[asset,setAsset]=useState<string|null>(null);
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
      if(d.phase==="zoom"&&d.target==="model"){if(span===null){span=d.distance;baseZoom=zoomRef.current;}setZoom(Math.max(.65,Math.min(1.8,baseZoom*d.distance/Math.max(.08,span??.08))));}
      if(d.phase==="rotate")setRotation(value=>value+d.delta);
      if(d.phase==="orbit-end")updateRoom({stageRotation:rotationRef.current});
      if(d.phase==="end"&&span!==null){span=null;updateRoom({stageZoom:zoomRef.current});}
    };window.addEventListener("air-spatial",handle);return()=>window.removeEventListener("air-spatial",handle);
  },[updateRoom]);
  useEffect(()=>{return()=>{if(asset)URL.revokeObjectURL(asset);};},[asset]);
  const selectedPart=pcbParts.find(part=>part.id===selected)??pcbParts[0],path=useMemo(()=>formulaPath(wave),[wave]);
  useEffect(()=>{setCode(room.state.stageCode);setOutput(room.state.stageCodeOutput);},[room.state.stageCode,room.state.stageCodeOutput]);
  useEffect(()=>{setFormula(room.state.stageFormula);setWave(room.state.stageFormula);},[room.state.stageFormula]);
  useEffect(()=>{setSelected(room.state.stageSelectedPart);setRemoved(room.state.stageRemovedParts);setZoom(room.state.stageZoom);setExplode(room.state.stageExplode);setNotes(room.state.stageNotes);},[room.state.stageSelectedPart,room.state.stageRemovedParts,room.state.stageZoom,room.state.stageExplode,room.state.stageNotes]);
  const run=async()=>{if(!room.canEdit)return;setRunning(true);const result=await executeJavaScript(code);setOutput(result);room.update({stageCode:code,stageCodeOutput:result});setRunning(false);notify("Code executed as a shared live visual object");};
  const togglePart=()=>{if(!room.canEdit)return;const next=removed.includes(selected)?removed.filter(id=>id!==selected):[...removed,selected];setRemoved(next);room.update({stageRemovedParts:next});};
  return <section className="unified-stage">
    <div className="unified-hud"><div><i/><span>HOLOSPACE / LIVE CLASSROOM</span></div><p>Pinch header to move · two palms to scale · hold fist for tools</p></div>
    <div className="spatial-stage-actions"><button className="spatial-tools-toggle" aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}>☷ <span>{sidebar?"Hide tools":"Show tools"}</span></button><button onClick={()=>window.dispatchEvent(new Event("air-camera-start"))}>◎ Enable hand control</button></div>
    {sidebar&&<aside className="spatial-sidebar"><header><span>SPATIAL INSTRUMENTS</span><strong>Shape the lesson.</strong><button onClick={()=>setSidebar(false)} aria-label="Close spatial tools">×</button></header><p>Hold a closed fist for 0.85 seconds to reveal or dismiss this panel.</p><button onClick={()=>chooseModel("semiconductor")} aria-pressed={model==="semiconductor"}>◈ Semiconductor · MOSFET</button><button onClick={()=>chooseModel("pcb")} aria-pressed={model==="pcb"}>▦ Exploded circuit board</button><label>EXPLODE LAYERS <input aria-label="Hologram explosion" type="range" min="0" max="100" value={explode} onChange={e=>{setExplode(+e.target.value);room.update({stageExplode:+e.target.value});}}/></label><label>MODEL SCALE <input aria-label="Hologram scale" type="range" min=".65" max="1.8" step=".05" value={zoom} onChange={e=>{setZoom(+e.target.value);room.update({stageZoom:+e.target.value});}}/></label><label>ORBIT <input aria-label="Hologram rotation" type="range" min="-3.14" max="3.14" step=".02" value={rotation} onChange={e=>{setRotation(+e.target.value);updateRoom({stageRotation:+e.target.value});}}/></label><button onClick={gateToggle}>{conducting?"● Current flowing":"○ Gate off"} · toggle gate</button><button onClick={()=>assetInput.current?.click()}>＋ Add floating image</button><div className="spatial-gesture-guide"><b>GESTURE GUIDE</b><p>Pinch + move a card header → grab</p><p>Two open palms → scale focused object</p><p>Open palm + turn wrist → orbit model</p><p>Pinch on live ink → luminous marker</p><p>Pause writing → dock completed line</p></div></aside>}
    <input ref={assetInput} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];if(file?.type.startsWith("image/")){setAsset(URL.createObjectURL(file));notify("Image added · pinch its header to move, use two palms to scale");}e.target.value="";}}/>
    {asset&&<article data-spatial-id="asset" className="floating-asset glass-object" style={{left:`${assetDrag.position.x}%`,top:`${assetDrag.position.y}%`,transform:`scale(${assetDrag.size})`,transformOrigin:"top left"}} {...assetDrag.handlers}><header data-air-grab="asset"><strong>Lesson image</strong><button onClick={()=>setAsset(null)} aria-label="Remove lesson image">×</button></header><img src={asset} alt="Imported lesson reference"/></article>}
    {model==="semiconductor"&&<div className="semiconductor-hologram" data-spatial-id="model"><HolographicModel explode={explode} zoom={zoom} rotation={rotation} conducting={conducting}/><div className="holo-caption"><span>LIVE MODEL / 001</span><strong>MOSFET</strong><p>Field effect transistor · separate the layers and trace the electrons.</p><button onClick={gateToggle}>{conducting?"Gate ON · electrons flowing":"Gate OFF · channel closed"}</button></div></div>}
    <div className="note-stack">{notes.slice(-4).map((note,index)=><article key={note.slice(-30)+index} style={{transform:`translate(${index*8}px,${index*58}px)`}}><img src={note} alt={`Docked handwritten line ${index+1}`}/><button disabled={!room.canEdit} onClick={()=>{const next=notes.filter(item=>item!==note);setNotes(next);room.update({stageNotes:next});}}>×</button></article>)}</div>
    <InkComposer onDock={image=>{if(!room.canEdit)return;const next=[...notes,image].slice(-4);setNotes(next);room.update({stageNotes:next});notify("Handwritten line docked and shared to the upper-left");}}/>
    <div data-spatial-id="model" className="pcb-world" style={{display:model==="pcb"?undefined:"none","--pcb-zoom":zoom,"--pcb-explode":`${explode}px`} as CSSProperties}>
      <div className="pcb-toolbar"><div><span>LIVE OBJECT · PCB</span><strong>AirBoard teaching board</strong></div><label>ZOOM <input type="range" min="0.65" max="1.8" step="0.05" value={zoom} disabled={!room.canEdit} onChange={event=>{const next=Number(event.target.value);setZoom(next);room.update({stageZoom:next});}}/></label><label>EXPLODE <input type="range" min="0" max="100" value={explode} disabled={!room.canEdit} onChange={event=>{const next=Number(event.target.value);setExplode(next);room.update({stageExplode:next});}}/></label></div>
      <div className="pcb-viewport"><div className="pcb-board"><div className="pcb-grid"/><div className="trace trace-a"/><div className="trace trace-b"/><div className="trace trace-c"/>{pcbParts.map((part,index)=><button data-air-action key={part.id} className={`pcb-component pcb-${part.tone} ${selected===part.id?"selected":""} ${removed.includes(part.id)?"removed":""}`} style={{left:`${part.x}%`,top:`${part.y}%`,"--part-index":index,transform:removed.includes(part.id)?"translateZ(140px) translateY(-120px) rotate(7deg) scale(1.12)":`translateZ(${18+explode}px) translateY(${-explode*.18}px)`} as CSSProperties} onClick={()=>{if(!room.canEdit)return;setSelected(part.id);room.update({stageSelectedPart:part.id});}}><i/><strong>{part.label}</strong><small>{part.detail}</small></button>)}<div className="pcb-pulse"><i/><i/><i/></div></div></div>
      <aside className="part-callout"><span>INSPECTING</span><h3>{selectedPart.label}</h3><p>{selectedPart.detail}. Pinch to isolate this component, then lift it away from the board.</p><button data-air-action disabled={!room.canEdit} onClick={togglePart}>{removed.includes(selected)?"Return to board":"Lift component"}</button></aside>
    </div>
    <article data-spatial-id="code" className="floating-code glass-object" style={{left:`${codeDrag.position.x}%`,top:`${codeDrag.position.y}%`,transform:`scale(${codeDrag.size})`,transformOrigin:"top left"}} {...codeDrag.handlers}>
      <header data-air-grab="code"><div><span>LIVE CODE · PINCH HEADER TO GRAB</span><strong>Floating editor</strong></div><b>{running?"RUNNING":"READY"}</b></header>
      <textarea value={code} disabled={!room.canEdit} spellCheck={false} onChange={event=>setCode(event.target.value)}/><div className="code-actions"><button data-air-action disabled={!room.canEdit} onClick={run}>{running?"Executing…":"Run + visualize"}</button><span>{output}</span></div>
      <div className={`code-orbit ${running?"running":""}`}>{Array.from({length:12},(_,i)=><i key={i} style={{"--particle":i} as CSSProperties}/>) }<strong>{output.match(/\d+/g)?.at(-1)??"●"}</strong></div>
    </article>
    <article data-spatial-id="math" className="floating-math glass-object" style={{left:`${mathDrag.position.x}%`,top:`${mathDrag.position.y}%`,transform:`scale(${mathDrag.size})`,transformOrigin:"top left"}} {...mathDrag.handlers}>
      <header data-air-grab="math"><div><span>MATHEMATICS · LIVE MEANING</span><strong>Fourier composer</strong></div><button data-air-action disabled={!room.canEdit} onClick={()=>{if(!room.canEdit)return;setWave(formula);room.update({stageFormula:formula});}}>Visualize</button></header>
      <input value={formula} disabled={!room.canEdit} onChange={event=>setFormula(event.target.value)} aria-label="Mathematical function"/>
      <svg viewBox="0 0 720 260" preserveAspectRatio="none"><defs><linearGradient id="waveGlow"><stop stopColor="#77edff"/><stop offset="1" stopColor="#7c86ff"/></linearGradient></defs><path className="math-gridline" d="M0 130H720M360 0V260"/><path className="math-wave" d={path}/></svg><div className="wave-meaning"><b>TIME</b><i/><span>The curve is built from rotating frequencies. Drag this card beside your face and explain each harmonic.</span></div>
    </article>
    <div className="unified-command-bar"><button disabled={!room.canEdit} onClick={()=>{if(!room.canEdit)return;setZoom(1);setExplode(36);setRemoved([]);room.update({stageZoom:1,stageExplode:36,stageRemovedParts:[]});}}>Reset space</button>{model==="pcb"?<button data-air-action disabled={!room.canEdit} onClick={togglePart}>Pinch · {removed.includes(selected)?"return":"lift"} {selectedPart.label}</button>:<button onClick={gateToggle}>{conducting?"Gate off":"Gate on"}</button>}<span>{room.connected?`${Math.max(1,room.participants.length)} people seeing this stage`:"Local rehearsal"}</span></div>
  </section>;
}
