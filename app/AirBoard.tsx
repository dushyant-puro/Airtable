"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import React, { useCallback, useEffect, useRef, useState } from "react";
// @ts-expect-error pdfjs-dist does not expose complete types for this legacy build.
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { createWorker } from "tesseract.js";
import { ClassroomControls, LiveLabWorkspace } from "./livelab/LiveLabWorkspace";
import { usePrototypeRoom } from "./livelab/usePrototypeRoom";
import { DockHold, SpatialPinch, ConfirmHold, isDeliberateTap } from "./livelab/spatialControls";
import { GestureGuide } from "./livelab/GestureGuide";

if (typeof window !== "undefined") pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

type Tool = "pointer" | "pen" | "highlighter" | "eraser";
type Mode = "welcome" | "board" | "pdf";
interface LineRect { id: string; left: number; top: number; width: number; height: number; text: string; }
interface Highlight { id: string; page: number; rect: LineRect; color: string; }
interface Point { x: number; y: number; }

class OneEuroFilter {
  private previous: number | null = null;
  private derivative = 0;
  private previousTime: number | null = null;
  constructor(private minCutoff = 1.3, private beta = 0.06, private derivativeCutoff = 1) {}
  private alpha(cutoff: number, delta: number) { const value = 2 * Math.PI * cutoff * delta; return value / (value + 1); }
  filter(value: number, timestamp: number) {
    if (this.previous === null || this.previousTime === null) { this.previous = value; this.previousTime = timestamp; return value; }
    const delta = Math.max((timestamp - this.previousTime) / 1000, 0.001);
    const rawDerivative = (value - this.previous) / delta;
    const derivativeAlpha = this.alpha(this.derivativeCutoff, delta);
    this.derivative += derivativeAlpha * (rawDerivative - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.previous += this.alpha(cutoff, delta) * (value - this.previous);
    this.previousTime = timestamp;
    return this.previous;
  }
  reset() { this.previous = null; this.previousTime = null; this.derivative = 0; }
}

const iconPaths: Record<string, React.ReactNode> = {
  pointer: <><path d="M6 3l12 9-7 1.5-3 6z"/><path d="M12 14l4 5"/></>, pen: <><path d="M4 20l4.2-1 10.9-10.9a2.1 2.1 0 00-3-3L5.2 16z"/><path d="M14.7 6.5l3 3"/></>,
  highlighter: <><path d="M7 15l8-8 3 3-8 8H7z"/><path d="M5 21h14M13.5 8.5l3 3"/></>, eraser: <><path d="M4.5 15.5l8-10a2 2 0 013 0l4 4a2 2 0 010 3l-6.5 6.5H8z"/><path d="M11 19l-4.5-4.5"/></>,
  upload: <><path d="M12 16V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/></>, search: <><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>, undo: <><path d="M9 7L4 12l5 5"/><path d="M5 12h8a6 6 0 016 6"/></>,
  camera: <><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z"/></>, close: <path d="M6 6l12 12M18 6L6 18"/>, external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></>, chevronLeft: <path d="M15 5l-7 7 7 7"/>, chevronRight: <path d="M9 5l7 7-7 7"/>,
};
function Icon({ name, size = 18 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{iconPaths[name]}</svg>; }
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export default function AirBoard() {
  const room = usePrototypeRoom();
  const lessonMode = room.state.activeMode;
  const videoRef = useRef<HTMLVideoElement>(null), stageVideoRef = useRef<HTMLVideoElement>(null), handHudRef = useRef<HTMLCanvasElement>(null), pdfCanvasRef = useRef<HTMLCanvasElement>(null), inkCanvasRef = useRef<HTMLCanvasElement>(null), documentRef = useRef<HTMLDivElement>(null), cursorRef = useRef<HTMLDivElement>(null), hoverRectRef = useRef<SVGRectElement>(null), fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("welcome"), [tool, setTool] = useState<Tool>("pen"), [color, setColor] = useState("#1473e6"), [trackerStatus, setTrackerStatus] = useState("Camera offline"), [gesture, setGesture] = useState("Ready when you are"), [cameraActive, setCameraActive] = useState(false), [showGuide, setShowGuide] = useState(false), [showSearch, setShowSearch] = useState(false), [searchText, setSearchText] = useState(""), [selectedPassage, setSelectedPassage] = useState(""), [pdfName, setPdfName] = useState(""), [pdfDoc, setPdfDoc] = useState<any>(null), [page, setPage] = useState(1), [pageCount, setPageCount] = useState(0), [scale, setScale] = useState(1), [lineRects, setLineRects] = useState<LineRect[]>([]), [highlights, setHighlights] = useState<Highlight[]>([]), [hoverLine, setHoverLine] = useState<LineRect | null>(null), [toast, setToast] = useState(""), [confidence, setConfidence] = useState(0), [autoClean, setAutoClean] = useState(true), [cleanStatus, setCleanStatus] = useState("Ready");
  const modeRef = useRef(mode), lessonModeRef = useRef(lessonMode), toolRef = useRef(tool), colorRef = useRef(color), pageRef = useRef(page), pageCountRef = useRef(pageCount), scaleRef = useRef(scale), linesRef = useRef(lineRects), hoverLineStateRef = useRef<LineRect | null>(null), highlightsRef = useRef(highlights);
  const airInkLast = useRef<Point | null>(null), airInkCanvas = useRef<HTMLCanvasElement | null>(null), spatialHandsRef=useRef<HTMLCanvasElement>(null);
  const dockHold=useRef(new DockHold()),spatialZoomArm=useRef<{since:number;target:string}|null>(null);
  const spatialPinch=useRef(new SpatialPinch()),confirmHold=useRef(new ConfirmHold()),pinchTiming=useRef({since:0,maxTravel:0});
  const spatialSession=useRef<{pinch:boolean;target:string;start:Point|null;control:HTMLElement|null;fist:number;fistFired:boolean;zoom:boolean;angle:number|null}>({pinch:false,target:"model",start:null,control:null,fist:0,fistFired:false,zoom:false,angle:null});
  const visionStarting=useRef(false),visionCleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{visionCleanup.current?.();},[]);
  const filterX = useRef(new OneEuroFilter(1.15, .035)), filterY = useRef(new OneEuroFilter(1.15, .035)), pinching = useRef(false), lastPoint = useRef<Point | null>(null), activeStrokePoints = useRef<[number,number,number][]>([]), stablePoint = useRef<Point | null>(null), swipeTrack = useRef<{ x:number; y:number; time:number } | null>(null), openPalmSince = useRef<number | null>(null), lastSwipe = useRef(0), zoomStart = useRef<{ distance:number; scale:number } | null>(null), zoomArmedSince = useRef<number | null>(null), fistStarted = useRef<number | null>(null), fistTriggered = useRef(false), activeGesture = useRef(""), lineCooldown = useRef(0), inkSnapshots = useRef<Record<string, string>>({}), autoCleanRef = useRef(true), ocrWorkerRef = useRef<any>(null), ocrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null), inkBoundsRef = useRef<{ minX:number; minY:number; maxX:number; maxY:number } | null>(null), mediaStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => { modeRef.current = mode; }, [mode]); useEffect(() => { toolRef.current = tool; }, [tool]); useEffect(() => { colorRef.current = color; }, [color]); useEffect(() => { pageRef.current = page; }, [page]); useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]); useEffect(() => { scaleRef.current = scale; }, [scale]); useEffect(() => { linesRef.current = lineRects; }, [lineRects]); useEffect(() => { hoverLineStateRef.current = hoverLine; }, [hoverLine]); useEffect(() => { highlightsRef.current = highlights; }, [highlights]);
  useEffect(() => { lessonModeRef.current = lessonMode; }, [lessonMode]);
  useEffect(() => { autoCleanRef.current = autoClean; }, [autoClean]);
  useEffect(() => { const video=stageVideoRef.current,stream=mediaStreamRef.current;if(video&&stream){video.srcObject=stream;void video.play();} }, [cameraActive,mode]);

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2200); }, []);
  const setGestureLabel = (value: string) => { if (activeGesture.current !== value) { activeGesture.current = value; setGesture(value); } };
  const snapshotKey = () => modeRef.current === "pdf" ? `pdf-${pageRef.current}` : "board";
  const saveInk = useCallback(() => { const canvas = inkCanvasRef.current; if (canvas?.width && canvas.height) { const key=snapshotKey(),source=canvas.toDataURL();inkSnapshots.current[key]=source;if(room.canEdit)room.update({inkSnapshots:{...room.state.inkSnapshots,[key]:source}}); } }, [room]);
  const restoreInk = useCallback((key: string) => { const canvas = inkCanvasRef.current, source = inkSnapshots.current[key] ?? room.state.inkSnapshots[key]; if (!canvas || !source) return; const image = new Image(); image.onload = () => {const context=canvas.getContext("2d");context?.clearRect(0,0,canvas.width,canvas.height);context?.drawImage(image, 0, 0, canvas.width, canvas.height);}; image.src = source; }, [room.state.inkSnapshots]);
  const renderPdfPage = useCallback(async (number: number, doc: any) => {
    const pdfPage = await doc.getPage(number), canvas = pdfCanvasRef.current, ink = inkCanvasRef.current; if (!canvas || !ink) return;
    const viewport = pdfPage.getViewport({ scale: 1.55 }); canvas.width = viewport.width; canvas.height = viewport.height; ink.width = viewport.width; ink.height = viewport.height;
    await pdfPage.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const content = await pdfPage.getTextContent(), lines: LineRect[] = [];
    content.items.forEach((item: any, index: number) => { if (!item.str?.trim()) return; const transform = pdfjsLib.Util.transform(viewport.transform, item.transform), fontHeight = Math.hypot(transform[2], transform[3]), x = transform[4], y = transform[5] - fontHeight, width = item.width * 1.55; const existing = lines.find((line) => Math.abs(line.top - y) < Math.max(5, fontHeight * .35)); if (existing) { const right = Math.max(existing.left + existing.width, x + width); existing.left = Math.min(existing.left, x); existing.width = right - existing.left; existing.text += ` ${item.str}`; } else lines.push({ id: `line-${index}`, left: x, top: y, width, height: fontHeight * 1.25, text: item.str }); });
    setLineRects(lines); restoreInk(`pdf-${number}`);
  }, [restoreInk]);
  useEffect(() => { if (pdfDoc && mode === "pdf") renderPdfPage(page, pdfDoc); }, [pdfDoc, mode, page, renderPdfPage]);
  const changePage = useCallback((direction: -1 | 1) => { if (modeRef.current !== "pdf") return; saveInk(); setPage((current) => { const next = Math.max(1, Math.min(pageCountRef.current, current + direction)); if (next !== current) {notify(direction > 0 ? "Next page" : "Previous page");room.update({page:next});} return next; }); }, [notify, room, saveInk]);
  const findLine = (x: number, y: number) => linesRef.current.find((line) => x >= line.left - 28 && x <= line.left + line.width + 28 && y >= line.top - 10 && y <= line.top + line.height + 10) ?? null;
  const updateHoverLine = (line: LineRect | null) => { if (hoverLineStateRef.current?.id !== line?.id) setHoverLine(line); const rect = hoverRectRef.current; if (!rect) return; if (!line) rect.style.display = "none"; else { rect.style.display = "block"; rect.setAttribute("x", String(line.left)); rect.setAttribute("y", String(line.top)); rect.setAttribute("width", String(line.width)); rect.setAttribute("height", String(line.height)); } };
  const addHighlight = (line: LineRect) => { const id = `${pageRef.current}-${line.id}`; if (highlightsRef.current.some((item) => item.id === id)) return; setHighlights((items) => [...items, { id, page: pageRef.current, rect: line, color: colorRef.current }]); notify("Passage highlighted"); };
  const openAirLens = (line: LineRect) => { const clean = line.text.replace(/\s+/g, " ").trim(); setSelectedPassage(clean); setSearchText(clean); setShowSearch(true); notify("Passage added to Quick Look"); };
  const processHandwriting = async () => {
    const canvas = inkCanvasRef.current, bounds = inkBoundsRef.current;
    if (!canvas || !bounds || !autoCleanRef.current) return;
    inkBoundsRef.current = null;
    const context = canvas.getContext("2d"); if (!context) return;
    const padding = 14, x = Math.max(0, Math.floor(bounds.minX-padding)), y = Math.max(0, Math.floor(bounds.minY-padding)), width = Math.min(canvas.width-x, Math.ceil(bounds.maxX-bounds.minX+padding*2)), height = Math.min(canvas.height-y, Math.ceil(bounds.maxY-bounds.minY+padding*2));
    if (width < 18 || height < 12) return;
    try {
      setCleanStatus("Recognizing…"); setGestureLabel("Cleaning handwriting");
      const source = context.getImageData(x,y,width,height), mask = document.createElement("canvas"); mask.width=width; mask.height=height;
      const maskContext=mask.getContext("2d")!, prepared=maskContext.createImageData(width,height);
      for(let i=0;i<source.data.length;i+=4){const ink=source.data[i+3]>24;prepared.data[i]=prepared.data[i+1]=prepared.data[i+2]=ink?0:255;prepared.data[i+3]=255;}
      maskContext.putImageData(prepared,0,0);
      const enlarged=document.createElement("canvas");enlarged.width=width*2;enlarged.height=height*2;const enlargedContext=enlarged.getContext("2d")!;enlargedContext.imageSmoothingEnabled=true;enlargedContext.drawImage(mask,0,0,enlarged.width,enlarged.height);
      if(!ocrWorkerRef.current){ocrWorkerRef.current=await createWorker("eng");await ocrWorkerRef.current.setParameters({tessedit_pageseg_mode:"7",preserve_interword_spaces:"1",user_defined_dpi:"300"});}
      const result=await ocrWorkerRef.current.recognize(enlarged), text=result.data.text.replace(/[^\p{L}\p{N}\s.,!?'-]/gu,"").replace(/\s+/g," ").trim();
      if(text && result.data.confidence>=38){context.clearRect(x,y,width,height);const fontSize=Math.max(20,Math.min(46,Math.round(height*.72)));context.save();context.globalAlpha=1;context.fillStyle=colorRef.current;context.font=`600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;context.textBaseline="middle";context.fillText(text,x+4,y+height/2,Math.max(width*1.7,180));context.restore();setCleanStatus(`Cleaned: ${text}`);setGestureLabel(`Recognized “${text}”`);saveInk();}
      else{setCleanStatus("Kept original ink");setGestureLabel("Ink kept — recognition uncertain");}
    }catch(error){console.error("Handwriting cleanup failed",error);setCleanStatus("Original ink kept");}
  };
  const finishStroke = () => { activeStrokePoints.current=[];if(ocrTimerRef.current)clearTimeout(ocrTimerRef.current);if(autoCleanRef.current&&toolRef.current==="pen")ocrTimerRef.current=setTimeout(processHandwriting,900);else saveInk(); };
  const drawStroke = (from: Point, to: Point, erase = false) => { const context = inkCanvasRef.current?.getContext("2d"); if (!context) return; const distance=Math.hypot(to.x-from.x,to.y-from.y);if(distance<.7)return;activeStrokePoints.current.push([to.x,to.y,.5]);const midpoint={x:(from.x+to.x)/2,y:(from.y+to.y)/2};context.save();context.lineCap="round";context.lineJoin="round";context.globalCompositeOperation=erase?"destination-out":"source-over";context.globalAlpha=toolRef.current==="highlighter"?.22:1;context.strokeStyle=colorRef.current;context.lineWidth=erase?42:toolRef.current==="highlighter"?24:6;context.beginPath();context.moveTo(from.x,from.y);context.quadraticCurveTo(midpoint.x,midpoint.y,to.x,to.y);context.stroke();context.restore();if(!erase&&toolRef.current==="pen"){const b=inkBoundsRef.current;if(!b)inkBoundsRef.current={minX:Math.min(from.x,to.x),minY:Math.min(from.y,to.y),maxX:Math.max(from.x,to.x),maxY:Math.max(from.y,to.y)};else{b.minX=Math.min(b.minX,from.x,to.x);b.minY=Math.min(b.minY,from.y,to.y);b.maxX=Math.max(b.maxX,from.x,to.x);b.maxY=Math.max(b.maxY,from.y,to.y);}} };
  const drawHandHud = (hands: any[]) => { [handHudRef.current,spatialHandsRef.current].forEach(canvas=>{const context=canvas?.getContext("2d");if(!canvas||!context)return;context.clearRect(0,0,canvas.width,canvas.height);const large=canvas===spatialHandsRef.current;hands.forEach((hand:any[],handIndex:number)=>{const accent=handIndex===0?"#76f7ff":"#ffdc92";context.strokeStyle=accent;context.fillStyle=accent;context.lineWidth=large?2.2:1.3;context.shadowColor=accent;context.shadowBlur=large?8:0;context.globalAlpha=.85;connections.forEach(([a,b])=>{context.beginPath();context.moveTo((1-hand[a].x)*canvas.width,hand[a].y*canvas.height);context.lineTo((1-hand[b].x)*canvas.width,hand[b].y*canvas.height);context.stroke();});hand.forEach((point:any,index:number)=>{const px=(1-point.x)*canvas.width,py=point.y*canvas.height;context.beginPath();context.arc(px,py,large?3:2,0,Math.PI*2);context.fill();if(large&&[4,8,12,16,20].includes(index)){context.beginPath();context.ellipse(px,py,18,11,-.3,0,Math.PI*2);context.stroke();context.strokeStyle="#ffe0a2";context.beginPath();context.ellipse(px,py,24,15,-.3,.3,4.9);context.stroke();context.strokeStyle=accent;}});});context.globalAlpha=1;context.shadowBlur=0;});};
  const activateAt = (x:number,y:number) => {const canvas=inkCanvasRef.current;if(!canvas)return;const rect=canvas.getBoundingClientRect(),clientX=rect.left+(x/canvas.width)*rect.width,clientY=rect.top+(y/canvas.height)*rect.height,target=document.elementFromPoint(clientX,clientY) as HTMLElement|null,control=target?.closest<HTMLElement>("button,[data-air-action]");if(control&&!control.hasAttribute("disabled")){control.click();setGestureLabel("Chutki activated control");}};
  const drawAirInkAt=(x:number,y:number)=>{const stage=inkCanvasRef.current;if(!stage)return false;const stageRect=stage.getBoundingClientRect(),clientX=stageRect.left+(x/stage.width)*stageRect.width,clientY=stageRect.top+(y/stage.height)*stageRect.height,target=document.elementFromPoint(clientX,clientY) as HTMLElement|null,canvas=target?.closest<HTMLCanvasElement>("canvas[data-air-ink]");if(!canvas){airInkCanvas.current?.dispatchEvent(new CustomEvent("air-ink-complete"));airInkLast.current=null;airInkCanvas.current=null;return false;}if(airInkCanvas.current!==canvas)airInkLast.current=null;airInkCanvas.current=canvas;const rect=canvas.getBoundingClientRect(),next={x:(clientX-rect.left)*canvas.width/rect.width,y:(clientY-rect.top)*canvas.height/rect.height},context=canvas.getContext("2d");if(context&&airInkLast.current){context.strokeStyle="#edf8ff";context.lineWidth=11;context.lineCap="round";context.lineJoin="round";context.shadowColor="#22c8ff";context.shadowBlur=10;context.beginPath();context.moveTo(airInkLast.current.x,airInkLast.current.y);context.quadraticCurveTo((airInkLast.current.x+next.x)/2,(airInkLast.current.y+next.y)/2,next.x,next.y);context.stroke();context.shadowBlur=0;}airInkLast.current=next;return true;};
  const routeSpatialHands=(hands:any[],x:number,y:number,pinchDistance:number,name:string,timestamp:number)=>{
    if(lessonModeRef.current==="document")return false;
    const canvas=inkCanvasRef.current;if(!canvas)return true;
    const rect=canvas.getBoundingClientRect(),point={x:rect.left+x/canvas.width*rect.width,y:rect.top+y/canvas.height*rect.height},session=spatialSession.current;
    const emit=(detail:Record<string,unknown>)=>window.dispatchEvent(new CustomEvent("air-spatial",{detail}));
    const palm=(h:any)=>[8,12,16,20].every(i=>h[i].y<h[i-2].y);
    const end=()=>{if(session.pinch||session.zoom){emit({phase:"end"});window.dispatchEvent(new CustomEvent("air-stage-ink",{detail:{phase:"end"}}));airInkCanvas.current?.dispatchEvent(new CustomEvent("air-ink-complete"));}session.control?.removeAttribute("data-air-holding");session.control?.style.removeProperty("--air-hold-progress");confirmHold.current.reset();spatialPinch.current.reset();session.pinch=false;session.zoom=false;session.control=null;airInkLast.current=null;airInkCanvas.current=null;};
    if(hands.length===2&&hands.every(palm)){
      spatialPinch.current.reset();
      if(session.pinch)end();session.fist=0;
      dockHold.current.reset();
      const a=hands[0][9],b=hands[1][9],distance=Math.hypot((a.x-b.x)*rect.width/rect.height,a.y-b.y);
      if(distance<.12){setGestureLabel("Separate both palms to arm zoom");return true;}
      if(!session.zoom){const target=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>("[data-spatial-id]")?.dataset.spatialId;if(!target||!["model","code","math","asset"].includes(target)){spatialZoomArm.current=null;setGestureLabel("Point at a visual or card with two open palms");return true;}if(!spatialZoomArm.current||spatialZoomArm.current.target!==target)spatialZoomArm.current={since:timestamp,target};if(timestamp-spatialZoomArm.current.since<220){setGestureLabel("Hold both palms · zoom arming");return true;}session.zoom=true;session.target=spatialZoomArm.current.target;}
      emit({phase:"zoom",target:session.target,distance});setGestureLabel(`Scaling ${session.target} · spread palms`);return true;
    }
    spatialZoomArm.current=null;
    if(session.zoom)end();
    if(hands.length===1&&name==="Victory"){
      spatialPinch.current.reset();
      if(session.pinch)end();session.fist=0;
      const target=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>("[data-spatial-id]");
      const id=target&&!target.classList.contains("docked-object")?target.dataset.spatialId??null:null;
      const hold=dockHold.current.update(id,timestamp);
      if(hold.fire&&id)emit({phase:"dock",target:id});
      setGestureLabel(id?hold.progress===1?"Object docked · release V sign":`Dock ${id} to tools · ${Math.round(hold.progress*100)}%`:"V sign: point at a floating object");return true;
    }
    dockHold.current.reset();
    if(name==="Closed_Fist"){
      spatialPinch.current.reset();
      if(session.pinch)end();if(!session.fist)session.fist=timestamp;
      if(timestamp-session.fist>850&&!session.fistFired){emit({phase:"sidebar"});session.fistFired=true;}
      setGestureLabel(session.fistFired?"Tools toggled · release fist":"Hold fist to reveal tools");return true;
    }
    session.fist=0;session.fistFired=false;
    const pinch=spatialPinch.current.update(pinchDistance,timestamp);
    if(!session.pinch&&pinch.started){
      if(session.angle!==null){emit({phase:"orbit-end"});session.angle=null;}
      session.pinch=true;session.start=point;
      pinchTiming.current={since:timestamp,maxTravel:0};confirmHold.current.reset();
      const element=document.elementFromPoint(point.x,point.y),header=element?.closest<HTMLElement>("[data-air-grab]");
      session.control=element?.closest<HTMLElement>('button,input[type="range"],textarea,select,summary')||null;
      if(session.control?.hasAttribute("data-air-ink-move"))session.control=null;
      const stageWriting=toolRef.current!=="pointer"&&!element?.closest(".spatial-sidebar,.spatial-stage-actions");
      session.target=stageWriting?"stage-ink":session.control?.matches('input[type="range"]')?"slider":session.control?.matches("textarea,select")?"editor":header&&!session.control?header.dataset.airGrab!:element?.closest("canvas[data-air-ink]")?"ink":element?.closest('[data-spatial-id="model"]')&&!session.control?"model":"control";
      airInkLast.current=null;emit({phase:"start",target:session.target,...point});
      if(session.target==="stage-ink"){session.control=null;window.dispatchEvent(new CustomEvent("air-stage-ink",{detail:{phase:"start",...point}}));}
    }
    if(session.pinch&&session.start)pinchTiming.current.maxTravel=Math.max(pinchTiming.current.maxTravel,Math.hypot(point.x-session.start.x,point.y-session.start.y));
    if(session.pinch&&pinch.ended){
      const control=session.control,bounds=control?.getBoundingClientRect(),inside=!!bounds&&point.x>=bounds.left&&point.x<=bounds.right&&point.y>=bounds.top&&point.y<=bounds.bottom;
      if(control&&!control.hasAttribute("disabled")&&isDeliberateTap(timestamp-pinchTiming.current.since,pinchTiming.current.maxTravel,inside)){
        if(session.target==="control"&&!control.hasAttribute("data-air-confirm")){control.focus();control.click();}
        if(session.target==="editor")control.focus();
      }
      end();setGestureLabel("Released · point to focus");return true;
    }
    if(session.pinch){
      if(session.target==="stage-ink"){window.dispatchEvent(new CustomEvent("air-stage-ink",{detail:{phase:"point",...point}}));setGestureLabel(toolRef.current==="eraser"?"Erasing stage ink":"Writing anywhere · release pinch to finish");return true;}
      else if(session.target==="ink")drawAirInkAt(x,y);
      else if(session.target==="control"&&session.control){
        const control=session.control,bounds=control.getBoundingClientRect(),inside=point.x>=bounds.left&&point.x<=bounds.right&&point.y>=bounds.top&&point.y<=bounds.bottom;
        if(control.hasAttribute("data-air-confirm")&&!control.hasAttribute("disabled")){
          const hold=confirmHold.current.update(inside&&pinchTiming.current.maxTravel<=18&&pinch.active&&pinchDistance<.38,timestamp);
          control.setAttribute("data-air-holding","");control.style.setProperty("--air-hold-progress",`${hold.progress*100}%`);
          if(hold.fire){control.focus();control.click();setGestureLabel("Run confirmed · release pinch before another action");}
          else setGestureLabel(hold.progress===1?"Run confirmed · release pinch":`Hold pinch to run · ${Math.round(hold.progress*100)}%`);
        }else setGestureLabel("Button focused · release a short pinch to activate");
        return true;
      }
      else if(session.target==="editor"){setGestureLabel("Short pinch to focus editor · type using your keyboard");return true;}
      else if(session.target==="slider"&&session.control instanceof HTMLInputElement){
        const input=session.control,bounds=input.getBoundingClientRect(),min=Number(input.min)||0,max=Number(input.max)||100,step=Number(input.step)||1;
        const value=Math.max(min,Math.min(max,min+Math.round(((point.x-bounds.left)/bounds.width)*(max-min)/step)*step));
        if(Math.abs(Number(input.value)-value)>=step*.5){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,String(value));input.dispatchEvent(new Event("input",{bubbles:true}));}
      }else if(pinchTiming.current.maxTravel>5)emit({phase:"move",target:session.target,...point});
      setGestureLabel(session.target==="ink"?"Luminous ink · pinch and write":`Holding ${session.target} · move your hand`);return true;
    }
    const focus=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>("[data-spatial-id]")?.dataset.spatialId;if(focus)session.target=focus;
    if(palm(hands[0])&&session.target==="model"){
      const h=hands[0],angle=Math.atan2(h[9].y-h[0].y,h[9].x-h[0].x);
      if(session.angle!==null){const delta=angle-session.angle;if(Math.abs(delta)<.2)emit({phase:"rotate",delta:delta*1.8});}session.angle=angle;setGestureLabel("Open palm · turn wrist to orbit");
    }else{if(session.angle!==null)emit({phase:"orbit-end"});session.angle=null;setGestureLabel(`Focus: ${session.target} · pinch header to grab`);}
    return true;
  };

  const startVision = useCallback(async () => {
    if (cameraActive||visionStarting.current) return;visionStarting.current=true;setTrackerStatus("Requesting camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: { ideal: 60, min: 30 } }, audio: false }), video = videoRef.current; if (!video){stream.getTracks().forEach(track=>track.stop());visionStarting.current=false;return;} mediaStreamRef.current=stream; video.srcObject = stream; if(stageVideoRef.current)stageVideoRef.current.srcObject=stream; await video.play(); setCameraActive(true);if(modeRef.current==="welcome"){room.update({activeMode:"systems"});lessonModeRef.current="systems";}setMode((current) => current === "welcome" ? "board" : current); setTrackerStatus("Calibrating hand control");
      visionCleanup.current=()=>stream.getTracks().forEach(track=>track.stop());
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
      const landmarker = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", delegate: "GPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .7, minHandPresenceConfidence: .68, minTrackingConfidence: .68 }); setTrackerStatus("Gesture engine online");
      let running = true, lastVideoTime = -1;
      const processFrame = (timestamp: number) => {
        if (!running || !videoRef.current) return; const currentVideo = videoRef.current;
        if (currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime) {
          lastVideoTime = currentVideo.currentTime; const result = landmarker.recognizeForVideo(currentVideo, timestamp), hands = result.landmarks ?? []; drawHandHud(hands); setConfidence(hands.length ? Math.round((result.gestures?.[0]?.[0]?.score ?? result.handedness?.[0]?.[0]?.score ?? .9) * 100) : 0);
          if (!hands.length) { dockHold.current.reset();spatialPinch.current.reset();confirmHold.current.reset();spatialSession.current.control?.removeAttribute("data-air-holding");spatialSession.current.control?.style.removeProperty("--air-hold-progress");spatialSession.current.control=null;spatialZoomArm.current=null; if(spatialSession.current.pinch||spatialSession.current.zoom){window.dispatchEvent(new CustomEvent("air-spatial",{detail:{phase:"end"}}));window.dispatchEvent(new CustomEvent("air-stage-ink",{detail:{phase:"end"}}));airInkCanvas.current?.dispatchEvent(new CustomEvent("air-ink-complete"));}spatialSession.current.pinch=false;spatialSession.current.zoom=false;spatialSession.current.fist=0;spatialSession.current.fistFired=false;airInkLast.current=null;airInkCanvas.current=null;setGestureLabel("Waiting for hand"); filterX.current.reset(); filterY.current.reset(); stablePoint.current=null;lastPoint.current = null; swipeTrack.current = null;openPalmSince.current=null; zoomStart.current = null;zoomArmedSince.current=null; if (cursorRef.current) cursorRef.current.style.opacity = "0"; }
          else {
            const hand=hands[0],thumb=hand[4],index=hand[8],middle=hand[12],ring=hand[16],pinky=hand[20],wrist=hand[0],canvas=inkCanvasRef.current;if(!canvas)return;
            const palm=Math.hypot(wrist.x-hand[9].x,wrist.y-hand[9].y)||.15,pinchDistance=Math.hypot(index.x-thumb.x,index.y-thumb.y)/palm,open=[index.y<hand[6].y,middle.y<hand[10].y,ring.y<hand[14].y,pinky.y<hand[18].y],extendedCount=open.filter(Boolean).length,thumbOpen=Math.hypot(thumb.x-hand[2].x,thumb.y-hand[2].y)/palm>.5,recognizedGesture=result.gestures?.[0]?.[0],recognizedName=recognizedGesture?.categoryName??"None",recognizedScore=recognizedGesture?.score??0;
            const writingPoint=pinchDistance<.46?{x:(index.x+thumb.x)/2,y:(index.y+thumb.y)/2}:index;
            const filtered={x:filterX.current.filter((1-writingPoint.x)*canvas.width,timestamp),y:filterY.current.filter(writingPoint.y*canvas.height,timestamp)};
            if(!stablePoint.current)stablePoint.current=filtered;else{const dx=filtered.x-stablePoint.current.x,dy=filtered.y-stablePoint.current.y,distance=Math.hypot(dx,dy);if(distance>1.2){const alpha=distance<10?.48:distance<35?.72:.9;stablePoint.current={x:stablePoint.current.x+dx*alpha,y:stablePoint.current.y+dy*alpha};}}
            const {x,y}=stablePoint.current;
            if(cursorRef.current){cursorRef.current.style.opacity="1";cursorRef.current.style.transform=`translate3d(${x}px,${y}px,0)`;}
            const line=modeRef.current==="pdf"?findLine(x,y):null;updateHoverLine(line);
            const handIsOpen=(candidate:any,indexOfHand:number)=>{const classification=result.gestures?.[indexOfHand]?.[0];return(classification?.categoryName==="Open_Palm"&&classification.score>.62)||(candidate[8].y<candidate[6].y&&candidate[12].y<candidate[10].y&&candidate[16].y<candidate[14].y&&candidate[20].y<candidate[18].y);};
            if(routeSpatialHands(hands,x,y,pinchDistance,recognizedScore>(recognizedName==="Victory"?.85:.7)?recognizedName:"None",timestamp)){
              lastPoint.current=null;
            }else if(hands.length===2){
              openPalmSince.current=null;swipeTrack.current=null;lastPoint.current=null;
              if(!handIsOpen(hands[0],0)||!handIsOpen(hands[1],1)){zoomArmedSince.current=null;zoomStart.current=null;setGestureLabel("Open both palms to zoom");}
              else if(!zoomArmedSince.current){zoomArmedSince.current=timestamp;zoomStart.current=null;setGestureLabel("Two palms detected · hold");}
              else if(timestamp-zoomArmedSince.current<180){setGestureLabel("Zoom arming…");}
              else{const a=hands[0][8],b=hands[1][8],distance=Math.hypot(a.x-b.x,a.y-b.y);if(!zoomStart.current)zoomStart.current={distance,scale:scaleRef.current};const ratio=distance/Math.max(.08,zoomStart.current.distance);if(Math.abs(ratio-1)>.025){const nextScale=Math.max(.72,Math.min(3.2,zoomStart.current.scale*ratio));scaleRef.current=nextScale;setScale(nextScale);setGestureLabel(ratio>1?"Zooming in":"Zooming out");}else setGestureLabel("Zoom locked");}
            }else{
              zoomArmedSince.current=null;zoomStart.current=null;
              const isFist=(recognizedName==="Closed_Fist"&&recognizedScore>.64)||(extendedCount===0&&pinchDistance>.25),isLShape=open[0]&&!open[1]&&!open[2]&&!open[3]&&thumbOpen&&pinchDistance>.48,isOpenPalm=(recognizedName==="Open_Palm"&&recognizedScore>.64)||(extendedCount===4&&pinchDistance>.48);
              if(isFist){openPalmSince.current=null;swipeTrack.current=null;if(!fistStarted.current)fistStarted.current=timestamp;const progress=Math.min(100,((timestamp-fistStarted.current)/850)*100);setGestureLabel(`Quick Look capture · ${Math.round(progress)}%`);if(line&&progress>=100&&!fistTriggered.current){fistTriggered.current=true;openAirLens(line);}lastPoint.current=null;}
              else{fistStarted.current=null;fistTriggered.current=false;
                if(isLShape&&line){openPalmSince.current=null;swipeTrack.current=null;setGestureLabel("Magnetic highlight");if(timestamp-lineCooldown.current>900){addHighlight(line);lineCooldown.current=timestamp;}lastPoint.current=null;}
                else if(isOpenPalm){
                  lastPoint.current=null;if(!openPalmSince.current){openPalmSince.current=timestamp;swipeTrack.current=null;setGestureLabel("Palm detected · hold");}
                  else if(timestamp-openPalmSince.current<140)setGestureLabel("Swipe arming…");
                  else{const mirroredX=1-wrist.x,currentY=wrist.y,now=performance.now();if(!swipeTrack.current){swipeTrack.current={x:mirroredX,y:currentY,time:now};setGestureLabel("Swipe ready");}else{const dx=mirroredX-swipeTrack.current.x,dy=currentY-swipeTrack.current.y,elapsed=now-swipeTrack.current.time;if(Math.abs(dx)>.115&&Math.abs(dx)>Math.abs(dy)*1.7&&elapsed<480&&now-lastSwipe.current>650){changePage(dx<0?1:-1);lastSwipe.current=now;swipeTrack.current=null;openPalmSince.current=null;setGestureLabel(dx<0?"Next page":"Previous page");}else if(Math.abs(dy)>.1||elapsed>520)swipeTrack.current={x:mirroredX,y:currentY,time:now};}}
                }else{
                  openPalmSince.current=null;swipeTrack.current=null;if(!pinching.current&&pinchDistance<.22){pinching.current=true;activeStrokePoints.current=[];airInkLast.current=null;airInkCanvas.current=null;if(ocrTimerRef.current)clearTimeout(ocrTimerRef.current);}const airWriting=pinching.current&&lessonModeRef.current!=="document"&&drawAirInkAt(x,y);if(pinching.current&&pinchDistance>.38){pinching.current=false;if(airInkLast.current){airInkCanvas.current?.dispatchEvent(new CustomEvent("air-ink-complete",{bubbles:true}));airInkLast.current=null;airInkCanvas.current=null;setGestureLabel("Air ink stroke captured");}else if(toolRef.current==="pointer")activateAt(x,y);else finishStroke();}const shouldErase=toolRef.current==="eraser"||(open[0]&&open[1]&&!open[2]&&!open[3]);if(airWriting){setGestureLabel("Writing instruction · stabilized");lastPoint.current=null;}else if(pinching.current&&toolRef.current!=="pointer"){setGestureLabel(shouldErase?"Erasing":toolRef.current==="highlighter"?"Highlighting":"Writing · stabilized");if(lastPoint.current)drawStroke(lastPoint.current,{x,y},shouldErase);lastPoint.current={x,y};}else{setGestureLabel(toolRef.current==="pointer"?"Chutki to activate":shouldErase?"Pinch to erase":line?"Passage acquired":"Pointer ready");lastPoint.current=null;}
                }
              }
            }
          }
        }
        if("requestVideoFrameCallback" in HTMLVideoElement.prototype)(videoRef.current as any)?.requestVideoFrameCallback(processFrame);else requestAnimationFrame(processFrame);
      };
      if("requestVideoFrameCallback" in HTMLVideoElement.prototype)(video as any).requestVideoFrameCallback(processFrame);else requestAnimationFrame(processFrame);
      visionCleanup.current=()=>{running=false;landmarker.close();stream.getTracks().forEach((track)=>track.stop());};visionStarting.current=false;
    } catch(error){visionStarting.current=false;console.error(error);setTrackerStatus("Camera unavailable");setGesture("Use mouse or touch instead");setMode("board");}
  },[cameraActive,changePage]);
  useEffect(()=>{const enable=()=>{void startVision();};window.addEventListener("air-camera-start",enable);return()=>window.removeEventListener("air-camera-start",enable);},[startVision]);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { const file=event.target.files?.[0];if(!file||file.type!=="application/pdf")return;try{saveInk();const bytes=new Uint8Array(await file.arrayBuffer()),document=await pdfjsLib.getDocument({data:bytes}).promise;setPdfDoc(document);setPdfName(file.name);setPageCount(document.numPages);pageCountRef.current=document.numPages;setPage(1);pageRef.current=1;setMode("pdf");modeRef.current="pdf";setScale(1);setHighlights([]);notify(`${document.numPages}-page document ready`);}catch(error){console.error(error);notify("That PDF could not be opened");}finally{event.target.value="";} };
  const startBoard=()=>{saveInk();setMode("board");modeRef.current="board";setTool("pointer");room.update({activeMode:"systems"});setScale(1);requestAnimationFrame(()=>{const canvas=inkCanvasRef.current;if(!canvas)return;const bounds=documentRef.current?.getBoundingClientRect();canvas.width=Math.max(900,Math.floor(bounds?.width??1200));canvas.height=Math.max(600,Math.floor(bounds?.height??720));restoreInk("board");});};
  const pointerToCanvas=(event:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=inkCanvasRef.current!,rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};};
  const openSearch=(engine:"google"|"wikipedia"|"scholar")=>{const query=searchText.trim();if(!query)return;const urls={google:`https://www.google.com/search?q=${encodeURIComponent(query)}`,wikipedia:`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,scholar:`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`};window.open(urls[engine],"_blank","noopener,noreferrer");};
  const clearInk=()=>{if(lessonModeRef.current!=="document"){window.dispatchEvent(new Event("air-stage-ink-clear"));notify("Stage ink cleared");return;}const canvas=inkCanvasRef.current;canvas?.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);activeStrokePoints.current=[];inkBoundsRef.current=null;delete inkSnapshots.current[snapshotKey()];notify("Ink layer cleared");};

  useEffect(()=>{if(room.state.page!==page&&pdfDoc){const next=Math.max(1,Math.min(pageCount||1,room.state.page));window.setTimeout(()=>setPage(next),0);}},[room.state.page,pdfDoc,pageCount]);
  useEffect(()=>{if(Math.abs(room.state.scale-scale)>.001){const next=room.state.scale;window.setTimeout(()=>setScale(next),0);}},[room.state.scale]);
  useEffect(()=>{if(room.state.highlights.length){const next=room.state.highlights as Highlight[];window.setTimeout(()=>setHighlights(next),0);}},[room.state.highlights]);
  useEffect(()=>{inkSnapshots.current={...inkSnapshots.current,...room.state.inkSnapshots};if(mode!=="welcome")restoreInk(snapshotKey());},[room.state.inkSnapshots]);

  return <main className={`air-app light-theme ${lessonMode!=="document"&&mode!=="welcome"?"classroom-immersive":""}`}>
    <header className="air-topbar"><div className="air-brand"><div className="air-brand-mark"><span/><i/></div><div><strong>AirBoard</strong><small>GESTURE WORKSPACE</small></div></div><div className="document-identity"><span className={`mode-dot ${cameraActive?"online":""}`}/><div><strong>{mode==="pdf"?pdfName:mode==="board"?"Untitled canvas":"No document open"}</strong><small>{mode==="pdf"?`${pageCount} pages · local session`:"Private · processed on device"}</small></div></div><div className="top-actions"><button className="ghost-button learn-gestures-button" onClick={()=>setShowGuide(true)}>Learn gestures</button><div className="clean-toggle"><div><strong>Clean handwriting</strong><small>{cleanStatus}</small></div><button role="switch" aria-checked={autoClean} className={autoClean?"on":""} onClick={()=>{setAutoClean(!autoClean);setCleanStatus(!autoClean?"Ready":"Off");}}><span/></button></div><button className={`ghost-button ${showSearch?"active":""}`} onClick={()=>setShowSearch(!showSearch)}><Icon name="search"/><span>Quick Look</span></button><button className="primary-button" onClick={()=>fileInputRef.current?.click()}><Icon name="upload"/><span>Open PDF</span></button><input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handlePdfUpload}/></div></header>
    <section className={`air-workspace ${cameraActive&&mode==="board"&&lessonMode==="document"?"camera-focus":""} ${lessonMode!=="document"&&mode!=="welcome"?"lab-focus":""}`}>
      <aside className="tool-dock" aria-label="Tools"><div className="dock-logo"><Icon name="grid" size={17}/></div><div className="dock-divider"/>{(["pointer","pen","highlighter","eraser"]as Tool[]).map((item)=><button key={item} className={`dock-button ${tool===item?"active":""}`} onClick={()=>setTool(item)} aria-pressed={tool===item} title={item}><Icon name={item}/></button>)}<div className="dock-divider"/><div className="color-rail">{["#1473e6","#22a06b","#f5c542","#e5484d","#1d2228"].map((item)=><button key={item} aria-label={`Use ${item}`} className={color===item?"selected":""} style={{background:item}} onClick={()=>setColor(item)}/>)}</div><div className="dock-spacer"/><button className="dock-button" onClick={clearInk} title="Clear ink"><Icon name="undo"/></button></aside>
      <section className="stage-shell"><div className={`spatial-stage ${cameraActive&&mode==="board"&&lessonMode==="document"?"camera-live":cameraActive&&mode!=="welcome"?"presenter-live":""}`}>{cameraActive&&mode!=="welcome"&&<><video ref={stageVideoRef} className="stage-camera" muted playsInline autoPlay/><canvas ref={spatialHandsRef} className="spatial-hand-overlay" width={1280} height={720}/></>}{cameraActive&&mode==="board"&&lessonMode==="document"&&<div className="writing-zone"><span>WRITING SPACE</span></div>}<div className="ambient-grid"/>
        {mode!=="welcome"&&<div className="livelab-chrome"><div className="single-stage-badge"><i/><span>LIVE SPATIAL STAGE</span></div><ClassroomControls room={room} notify={notify}/></div>}
        {mode==="welcome"&&<div className="welcome-panel"><div className="orbit-hero"><i/><i/><i/><div className="hero-hand">✦</div></div><p className="overline">THE EXECUTABLE CLASSROOM CANVAS</p><h1>Make ideas<br/><em>come alive.</em></h1><p className="hero-copy">Teach code, computer architecture, operating systems, networks, and documents in one gesture-controlled live lab.</p><div className="hero-actions"><button className="hero-primary" onClick={startVision}><span className="pulse-dot"/>Enable spatial control</button><button className="hero-secondary" onClick={startBoard}>Enter LiveLab</button></div><div className="capability-strip"><span>CHUTKI TO CONTROL</span><i/><span>CODE TO EXECUTE</span><i/><span>SYSTEMS TO SIMULATE</span></div></div>}
        {mode!=="welcome"&&<div className={`document-viewport ${showSearch&&lessonMode==="document"?"with-search":""}`}><div className="document-space"><div ref={documentRef} className={`document-surface ${lessonMode==="document"?mode:"board lab-surface"}`} style={{transform:`scale(${lessonMode==="document"?scale:1})`}}>{lessonMode==="document"?(mode==="pdf"?<canvas ref={pdfCanvasRef} className="pdf-layer"/>:<div className="board-copy"><span>INFINITE CANVAS</span><h2>Think out loud.</h2><p>Pinch your index finger and thumb to begin.</p></div>):<LiveLabWorkspace mode={lessonMode} room={room} notify={notify} tool={tool} color={color} onToolChange={setTool}/>}<svg className="highlight-layer" style={{display:lessonMode==="document"?undefined:"none"}}>{highlights.filter((item)=>item.page===page).map((item)=><rect key={item.id} x={item.rect.left} y={item.rect.top} width={item.rect.width} height={item.rect.height} rx="3" fill={item.color} opacity=".34"/>)}<rect ref={hoverRectRef} className="magnetic-line" style={{display:"none"}} rx="3"/></svg><canvas ref={inkCanvasRef} className="ink-layer" style={{pointerEvents:lessonMode==="document"?undefined:"none"}} width={1200} height={720} onPointerDown={(event)=>{if(tool==="pointer")return;event.currentTarget.setPointerCapture(event.pointerId);activeStrokePoints.current=[];lastPoint.current=pointerToCanvas(event);}} onPointerMove={(event)=>{if(!event.currentTarget.hasPointerCapture(event.pointerId)||!lastPoint.current)return;const next=pointerToCanvas(event);drawStroke(lastPoint.current,next,tool==="eraser");lastPoint.current=next;}} onPointerUp={(event)=>{event.currentTarget.releasePointerCapture(event.pointerId);lastPoint.current=null;finishStroke();}}/><div ref={cursorRef} className={`spatial-cursor ${tool}`}><span/></div></div></div>
          {showSearch&&lessonMode==="document"&&<aside className="air-lens-panel"><div className="lens-header"><div><Icon name="search" size={16}/><strong>Quick Look</strong><small>WEB RESEARCH</small></div><button onClick={()=>setShowSearch(false)}><Icon name="close"/></button></div><div className="lens-body"><div className="lens-label">Captured passage</div><blockquote>{selectedPassage||"Hover a line in your PDF and hold a closed fist for one second."}</blockquote><label htmlFor="air-search">Search the open web</label><div className="search-field"><Icon name="search" size={16}/><textarea id="air-search" value={searchText} onChange={(event)=>setSearchText(event.target.value)} placeholder="Search this passage…"/></div><div className="search-engines"><button onClick={()=>openSearch("google")}><span>G</span><div><strong>Web search</strong><small>Broad results</small></div><Icon name="external" size={14}/></button><button onClick={()=>openSearch("wikipedia")}><span>W</span><div><strong>Wikipedia</strong><small>Quick context</small></div><Icon name="external" size={14}/></button><button onClick={()=>openSearch("scholar")}><span>S</span><div><strong>Scholar</strong><small>Research papers</small></div><Icon name="external" size={14}/></button></div><div className="lens-tip"><span>FIST</span><p>Hold over any PDF line to replace this passage hands-free.</p></div></div></aside>}
        </div>}
        {mode!=="welcome"&&lessonMode!=="document"&&cameraActive&&<div className="coding-gesture-status" role="status">{gesture}</div>}
        {mode!=="welcome"&&lessonMode==="document"&&<><div className="stage-status"><span className={`status-beacon ${cameraActive?"active":""}`}/><div><small>LIVE GESTURE</small><strong>{gesture}</strong></div><b>{confidence?`${confidence}%`:"—"}</b></div>{mode==="pdf"&&<div className="page-control"><button disabled={page<=1} onClick={()=>changePage(-1)}><Icon name="chevronLeft"/></button><span><b>{page}</b> / {pageCount}</span><button disabled={page>=pageCount} onClick={()=>changePage(1)}><Icon name="chevronRight"/></button></div>}<div className="zoom-control"><button onClick={()=>{const next=Math.max(.72,scale-.15);setScale(next);room.update({scale:next});}}>−</button><span>{Math.round(scale*100)}%</span><button onClick={()=>{const next=Math.min(3.2,scale+.15);setScale(next);room.update({scale:next});}}>+</button></div></>}
      </div></section>
      <aside className="intelligence-rail"><div className="camera-card"><div className="camera-visual"><video ref={videoRef} muted playsInline/><canvas ref={handHudRef} width={280} height={198}/><div className="scan-line"/><div className="camera-corners"><i/><i/><i/><i/></div>{!cameraActive&&<button onClick={startVision}><Icon name="camera"/><span>Start camera</span></button>}</div><div className="camera-meta"><span className={cameraActive?"online":""}/><div><strong>{trackerStatus}</strong><small>{cameraActive?"2-HAND · 21 POINT MESH":"NO VIDEO IS RECORDED"}</small></div></div></div>
        <div className="rail-section"><div className="rail-title"><span>Gesture controls</span><button onClick={()=>setShowGuide(!showGuide)}>{showGuide?"Hide":"Learn"}</button></div><div className="gesture-list"><div><span className="gesture-glyph pinch">⌁</span><p><strong>Pinch + move</strong><small>Write or annotate</small></p><b>01</b></div><div><span className="gesture-glyph palm">✋</span><p><strong>Open-palm swipe</strong><small>Navigate pages</small></p><b>02</b></div><div><span className="gesture-glyph expand">↔</span><p><strong>Two-hand span</strong><small>Continuous zoom</small></p><b>03</b></div><div><span className="gesture-glyph fist">●</span><p><strong>Fist dwell</strong><small>Capture to Quick Look</small></p><b>04</b></div></div></div>
        {showGuide&&<div className="calibration-note"><span>CALIBRATION TIP</span><p>Keep shoulders relaxed and your whole hand inside the camera frame. A deliberate hold beats a fast pose.</p></div>}<div className="rail-section session-section"><div className="rail-title"><span>Session</span><em>LOCAL</em></div><div className="metric-grid"><div><small>DOCUMENT</small><strong>{mode==="pdf"?pageCount:"∞"}</strong><span>{mode==="pdf"?"pages":"canvas"}</span></div><div><small>MARKS</small><strong>{highlights.length}</strong><span>saved</span></div></div></div><div className="privacy-card"><span>◆</span><div><strong>On-device vision</strong><p>Camera frames never leave this browser.</p></div></div>
      </aside>
    </section><GestureGuide open={showGuide} spatial={lessonMode!=="document"} cameraActive={cameraActive} onClose={()=>setShowGuide(false)}/>{toast&&<div className="air-toast"><span>✦</span>{toast}</div>}
  </main>;
}
