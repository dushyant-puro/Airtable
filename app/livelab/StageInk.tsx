"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import type { PrototypeRoom } from "./usePrototypeRoom";
import { canJoinInk, eraseInkAt, inkBounds, inkPath, moveInkObject, type InkPoint, type InkTool, type StageInkObject, type StageInkStroke } from "./stageInkGeometry";

const makeId = () => crypto.randomUUID();

export function StageInk({ room, tool, color }: { room: PrototypeRoom; tool: InkTool; color: string }) {
  const layer = useRef<HTMLDivElement>(null), livePath = useRef<SVGPathElement>(null);
  const [objects, setObjects] = useState(room.state.stageInkObjects ?? []);
  const objectsRef = useRef(objects), roomRef = useRef(room), toolRef = useRef(tool), colorRef = useRef(color);
  const active = useRef<StageInkStroke | null>(null), erasing = useRef(false);
  const group = useRef<{ id: string; until: number } | null>(null);
  const grab = useRef<{ id: string; point: InkPoint; object: StageInkObject } | null>(null);
  roomRef.current = room; toolRef.current = tool; colorRef.current = color;
  const display = (next: StageInkObject[]) => { objectsRef.current = next; setObjects(next); };
  const commit = (next: StageInkObject[]) => { display(next); roomRef.current.update({ stageInkObjects: next }); };
  const pointAt = (x: number, y: number): InkPoint | null => {
    const rect = layer.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return { x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) };
  };
  const paint = () => {
    const stroke = active.current, path = livePath.current;
    if (!path) return;
    path.setAttribute("d", stroke ? inkPath(stroke.points) : "");
    path.setAttribute("stroke", stroke?.color ?? colorRef.current);
    path.setAttribute("stroke-width", stroke?.tool === "highlighter" ? "24" : "4");
    path.setAttribute("opacity", stroke?.tool === "highlighter" ? ".38" : "1");
  };
  const finish = () => {
    if (!roomRef.current.canEdit) { active.current = null; erasing.current = false; paint(); return; }
    const stroke = active.current;
    active.current = null;
    if (stroke?.points.length) {
      const now = performance.now();
      const existing = group.current && now <= group.current.until && objectsRef.current.some(o => o.id === group.current?.id && canJoinInk(o, stroke.points[0]));
      const id = existing ? group.current!.id : makeId();
      const next = existing ? objectsRef.current.map(o => o.id === id ? { ...o, strokes: [...o.strokes, stroke] } : o) : [...objectsRef.current, { id, x: 0, y: 0, strokes: [stroke] }];
      group.current = { id, until: now + 1400 };
      commit(next);
    }
    if (erasing.current) { erasing.current = false; commit(objectsRef.current); group.current = null; }
    paint();
  };
  const add = (point: InkPoint) => {
    if (!roomRef.current.canEdit) return;
    if (toolRef.current === "eraser") {
      erasing.current = true;
      const rect = layer.current?.getBoundingClientRect();
      if (rect) display(eraseInkAt(objectsRef.current, point, rect.width, rect.height));
      return;
    }
    const stroke = active.current;
    if (!stroke) return;
    const last = stroke.points.at(-1), rect = layer.current?.getBoundingClientRect();
    if (last && rect && Math.hypot((point.x - last.x) * rect.width, (point.y - last.y) * rect.height) < .6) return;
    stroke.points.push(point); paint();
  };
  const begin = (point: InkPoint) => {
    if (!roomRef.current.canEdit || toolRef.current === "pointer") return;
    finish();
    if (toolRef.current === "eraser") { add(point); return; }
    active.current = { id: makeId(), tool: toolRef.current, color: colorRef.current, points: [point] };
    paint();
  };
  const startGrab = (id: string, point: InkPoint) => {
    if (!roomRef.current.canEdit || toolRef.current !== "pointer") return;
    const object = objectsRef.current.find(o => o.id === id);
    if (object) { group.current = null; grab.current = { id, point, object }; }
  };
  const moveGrab = (point: InkPoint) => {
    const from = grab.current;
    if (!from) return;
    const moved = moveInkObject(from.object, point.x - from.point.x, point.y - from.point.y);
    display(objectsRef.current.map(o => o.id === from.id ? moved : o));
  };
  const endGrab = () => { if (grab.current) { grab.current = null; commit(objectsRef.current); } };
  useEffect(() => {
    const next = room.state.stageInkObjects ?? [];
    if (!active.current && !erasing.current && !grab.current) { objectsRef.current = next; setObjects(next); }
  }, [room.state.stageInkObjects]);
  useEffect(() => { finish(); endGrab(); group.current = null; }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!room.canEdit) { active.current = null; erasing.current = false; grab.current = null; paint(); } }, [room.canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ink = (event: Event) => {
      if (!roomRef.current.canEdit) return;
      const d = (event as CustomEvent).detail;
      if (d.phase === "end") { finish(); return; }
      const point = pointAt(d.x, d.y);
      if (!point) return;
      if (d.phase === "start") begin(point);
      else if (d.phase === "point") add(point);
    };
    const spatial = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d.phase === "end") { endGrab(); return; }
      if (!roomRef.current.canEdit || !String(d.target).startsWith("ink-")) return;
      const point = pointAt(d.x, d.y);
      if (!point) return;
      if (d.phase === "start") startGrab(d.target.slice(4), point);
      else if (d.phase === "move") moveGrab(point);
    };
    const clear = () => { if (roomRef.current.canEdit) { active.current = null; erasing.current = false; grab.current = null; group.current = null; paint(); commit([]); } };
    window.addEventListener("air-stage-ink", ink); window.addEventListener("air-spatial", spatial); window.addEventListener("air-stage-ink-clear", clear);
    return () => { window.removeEventListener("air-stage-ink", ink); window.removeEventListener("air-spatial", spatial); window.removeEventListener("air-stage-ink-clear", clear); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pointerPoint = (event: PointerEvent<HTMLElement>) => pointAt(event.clientX, event.clientY);
  const writing = tool !== "pointer" && room.canEdit;
  const keyMove = (event: KeyboardEvent<HTMLButtonElement>, object: StageInkObject) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] };
    if (!room.canEdit || !directions[event.key]) return;
    event.preventDefault(); const next = moveInkObject(object, ...directions[event.key]);
    commit(objectsRef.current.map(o => o.id === object.id ? next : o));
  };
  return <div ref={layer} className="stage-ink-layer" data-writing={writing} aria-label="Full-stage annotations">
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="stage-ink-vectors" aria-label="Movable classroom ink">
      {objects.map(object => <g key={object.id} transform={`translate(${object.x * 1000} ${object.y * 1000})`} data-ink-object={object.id}>{object.strokes.map(stroke => <path key={stroke.id} d={inkPath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.tool === "highlighter" ? 24 : 4} opacity={stroke.tool === "highlighter" ? .38 : 1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}</g>)}
      <path ref={livePath} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
    {writing && <div className="stage-ink-capture" role="img" aria-label="Write anywhere on the classroom stage" onPointerDown={event => { if (event.button !== 0) return; const point = pointerPoint(event); if (point) { event.currentTarget.setPointerCapture(event.pointerId); begin(point); } }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointerPoint(event); if (point) add(point); }} onPointerUp={event => { const point = pointerPoint(event); if (point) add(point); finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={finish}/>}
    {!writing && room.canEdit && objects.map((object, index) => {
      const b = inkBounds(object);
      return <div key={object.id} className="stage-ink-object" data-spatial-id={`ink-${object.id}`} data-air-grab={`ink-${object.id}`} style={{ left: `${(b.left + object.x) * 100}%`, top: `${(b.top + object.y) * 100}%`, width: `${Math.max(.012, b.right - b.left) * 100}%`, height: `${Math.max(.012, b.bottom - b.top) * 100}%` }} onPointerDown={event => { if ((event.target as HTMLElement).closest("button") || event.button !== 0) return; const point = pointerPoint(event); if (point) { event.currentTarget.setPointerCapture(event.pointerId); startGrab(object.id, point); } }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const point = pointerPoint(event); if (point) moveGrab(point); } }} onPointerUp={endGrab} onPointerCancel={endGrab}>
        <button className="stage-ink-move" aria-label={`Move writing ${index + 1}`} data-air-ink-move data-air-grab={`ink-${object.id}`} onKeyDown={event => keyMove(event, object)} onPointerDown={event => { if (event.button !== 0) return; const point = pointerPoint(event); if (point) { event.currentTarget.setPointerCapture(event.pointerId); startGrab(object.id, point); } }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const point = pointerPoint(event); if (point) moveGrab(point); } }} onPointerUp={endGrab} onPointerCancel={endGrab}>⋮⋮ Move ink</button>
      </div>;
    })}
    <div className="stage-ink-hint">{writing ? `${tool === "eraser" ? "Erase" : "Write"} anywhere · release pinch between strokes · choose pointer to move ink` : objects.length ? "Pinch or drag Move ink to reposition writing" : "Choose pen to write anywhere on the stage"}</div>
  </div>;
}
