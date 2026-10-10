"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { LineRect, extractLineRects } from "../utils/pdfExtractor";

export interface Highlight {
  id: string;
  page: number;
  rect: LineRect;
  color: string;
}

interface PdfPresenterProps {
  doc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
  offset: { x: number; y: number };
  highlights: Highlight[];
  activeLine: LineRect | null;
  laserPoint: { x: number; y: number } | null;
  onLinesExtracted: (lines: LineRect[]) => void;
  onPointerMove: (docX: number, docY: number) => void;
  onPointerClick: (docX: number, docY: number) => void;
}

export default function PdfPresenter({
  doc,
  pageNum,
  scale,
  offset,
  highlights,
  activeLine,
  laserPoint,
  onLinesExtracted,
  onPointerMove,
  onPointerClick,
}: PdfPresenterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let renderTask: any = null;

    const render = async () => {
      const page = await doc.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;

      // Extract line bounding boxes for snapping
      const lines = await extractLineRects(page, viewport);
      onLinesExtracted(lines);
    };

    render();

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [doc, pageNum, onLinesExtracted]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const docX = (e.clientX - rect.left) / scale;
    const docY = (e.clientY - rect.top) / scale;
    onPointerMove(docX, docY);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const docX = (e.clientX - rect.left) / scale;
    const docY = (e.clientY - rect.top) / scale;
    onPointerClick(docX, docY);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const canvas = canvasRef.current;
          if (canvas) onPointerClick(canvas.width / 2, canvas.height / 2);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="PDF page"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        transformOrigin: "center center",
      }}
      className="relative rounded-lg shadow-2xl overflow-hidden bg-white cursor-crosshair transition-transform duration-75"
    >
      {/* Base PDF Canvas */}
      <canvas ref={canvasRef} className="block" />

      {/* SVG Highlight Overlay Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Saved Highlights */}
        {highlights
          .filter((h) => h.page === pageNum)
          .map((h) => (
            <rect
              key={h.id}
              x={h.rect.left}
              y={h.rect.top}
              width={h.rect.width}
              height={h.rect.height}
              fill={h.color}
              opacity={0.4}
              rx={2}
              style={{ mixBlendMode: "multiply" }}
            />
          ))}

        {/* Dynamic Snap Line Hover Preview */}
        {activeLine && (
          <rect
            x={activeLine.left}
            y={activeLine.top}
            width={activeLine.width}
            height={activeLine.height}
            fill="#38BDF8"
            opacity={0.3}
            rx={2}
            style={{ mixBlendMode: "multiply" }}
          />
        )}
      </svg>

      {/* Glowing Laser Pointer Indicator */}
      {laserPoint && (
        <div
          style={{
            left: `${laserPoint.x}px`,
            top: `${laserPoint.y}px`,
            transform: "translate(-50%, -50%)",
          }}
          className="absolute pointer-events-none w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)] z-40"
        />
      )}
    </div>
  );
}
