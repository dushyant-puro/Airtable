"use client";

import { useEffect, useRef, useState } from "react";

export function GestureGuide({ open, spatial, cameraActive, onClose }: { open: boolean; spatial: boolean; cameraActive: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [practiced, setPracticed] = useState(false);
  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!panel.open) panel.showModal();
    return () => { panel.close(); previous?.focus(); };
  }, [open]);
  return <dialog ref={dialog} className="learn-gestures-dialog" aria-labelledby="gesture-guide-title" onCancel={onClose}>
    <header><div><span>CLASSROOM FIELD GUIDE</span><h2 id="gesture-guide-title">Learn gestures</h2></div><button onClick={onClose} aria-label="Close gesture guide">×</button></header>
    <p className="gesture-guide-intro">{spatial ? "Learn these six actions for floating code and visualizations. Start with move and zoom; execution is always deliberate." : "PDF controls are different from floating-object controls. Select your pen, highlighter or pointer before starting."}</p>
    <div className="guide-camera-state" role="status">{cameraActive ? "Camera on · keep your whole hand visible" : "Camera off · close this guide and choose Enable hand control to practise"}</div>
    <ol className="gesture-lesson-grid">
      {spatial ? <>
        <li><b>01 · Move code</b><strong>Pinch the editor header, then move</strong><p>Point at LIVE CODE, bring index and thumb together, and hold while moving. Release to place it. The text area is for typing, not dragging.</p></li>
        <li><b>02 · Zoom a card</b><strong>Two open palms, then spread or bring together</strong><p>Point at the code card or model first. Keep both palms open for a brief hold, then change their distance gradually. Release either hand to stop.</p></li>
        <li><b>03 · Choose a language</b><strong>Short pinch on JS, C, C++ or Java</strong><p>Use the visible language buttons. A short pinch inside the text area focuses it; use your laptop keyboard to write actual code.</p></li>
        <li><b>04 · Run code safely</b><strong>Hold a pinch on Run for 0.9 seconds</strong><p>Keep the cursor inside Run + visualize until its progress fills. Moving off cancels. Release before running again. Mouse click and Ctrl/⌘ + Enter also work.</p></li>
        <li><b>05 · Show tools</b><strong>Closed fist, hold for 0.85 seconds</strong><p>Hold still to open or close the tools drawer. Relax your hand before toggling it again.</p></li>
        <li><b>06 · Dock an object</b><strong>V sign over the object, hold for one second</strong><p>Point two raised fingers at the floating card. It moves into Show tools. Choose Float to return it to its saved position.</p></li>
      </> : <>
        <li><b>01 · Write</b><strong>Choose pen, then pinch and move</strong><p>Keep index and thumb together to write. Release between strokes. Use highlighter for text and eraser to remove ink.</p></li>
        <li><b>02 · Turn a page</b><strong>Open palm, hold, then swipe sideways</strong><p>Let the page-swipe indicator arm first. Keep your hand open through the swipe; small writing movements will not turn pages.</p></li>
        <li><b>03 · Zoom the PDF</b><strong>Two hands, then change their distance</strong><p>Move slowly after the zoom arms. The + / − buttons offer a precise alternative.</p></li>
        <li><b>04 · Research a passage</b><strong>Point at a line, then hold a fist</strong><p>The selected text opens in Quick Look. Review the search query before opening web results.</p></li>
      </>}
    </ol>
    <section className="gesture-do-avoid"><div><h3>Do this</h3><p>Face the camera. Use even front lighting. Keep the entire hand in frame. Start with one action at a time. Release between actions.</p></div><div><h3>Don’t learn these as shortcuts</h3><p>No clap or finger-snap detection. Air handwriting does not automatically become reliable code. No ambiguous gesture runs or deletes code. Page swipes are for PDFs, not floating cards.</p></div></section>
    {spatial && <div className="gesture-practice"><div><strong>Safe confirmation practice</strong><p>This button never runs your code. Try holding a pinch on it, or click to preview the result.</p></div><button data-air-confirm onClick={()=>setPracticed(true)}>{practiced ? "Practice complete · no code executed" : "Practice pinch hold"}</button></div>}
    <footer><span>Mouse, touch and keyboard remain available. Gesture accuracy depends on your camera and lighting.</span><button onClick={onClose}>Back to classroom</button></footer>
  </dialog>;
}
