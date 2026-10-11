# AirBoard LiveLab

![AirBoard — Draw ideas in the air](public/og.png)

AirBoard LiveLab is a gesture-powered executable classroom canvas for computer-science teaching. It combines spatial ink and PDFs with runnable code, computer-architecture circuits, system-design diagrams, and interactive OS/CN demonstrations.

## What it does

- Pinch thumb and index finger to draw
- Hold up two fingers to erase
- Open your hand to pause safely
- Draw with a mouse or touch when a camera is unavailable
- Undo, clear, change colors and brush size, and export the board as a PNG
- Mirror drawing updates between tabs on the same origin with `BroadcastChannel`
- Play a built-in showcase demo without granting camera permission
- Write code on the Air Ink canvas, convert it to a reviewable candidate, and explicitly commit it before execution
- Run the visual assembly processor, JavaScript, TypeScript, HTML, Python, and SQL lesson cells
- Dismantle an exploded CPU, inspect its ALU/register/cache/bus objects, and animate live signals
- Switch to a semiconductor cross-section and apply gate voltage to reveal the conducting channel
- Build system-design models and step through network routing, CPU scheduling, and paging
- Join a teacher or student room using a shared code; lesson state is relayed by the local Next.js server
- Grant and revoke student editing, then export the complete lesson state as JSON

Hand landmark detection runs in the browser with MediaPipe Tasks Vision. Camera frames are not uploaded by this app.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), allow camera access, raise one hand, and pinch to draw.

For a two-device classroom rehearsal on the same network, open the printed `Network` address on the teacher device, press **Copy invite link**, and open that link on the student device. For a deployed URL, set `NEXT_PUBLIC_APP_URL` to the public origin so copied invitations always use the correct host.

## Deploy on Vercel

Import this repository into Vercel and keep the detected defaults:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: Next.js default

No environment variables are required. HTTPS is required for camera access outside localhost.

Judge0 is required for C/C++/Java execution in the floating editor. Add these server-only settings to `.env.local`, then restart the application:

```bash
JUDGE0_BASE_URL=https://your-judge0-host
JUDGE0_API_KEY=optional-token
```

When configured, LiveLab loads the server's runtime catalogue and executes those languages through the sandboxed `/api/execute` adapter. The unified floating editor guarantees JavaScript execution only without a compiler; C/C++/Java editing and source projection still work. No shared public compiler is chosen automatically. A hosted or self-hosted service must be configured before native execution can be tested. For a RapidAPI-backed Judge0 service, also set `JUDGE0_RAPIDAPI_HOST` to the host provided in its dashboard; `JUDGE0_API_KEY` is then sent through RapidAPI headers instead of `X-Auth-Token`. Keys are never exposed to the browser. Check the connection in the editor after restarting. Program input is available under **Program input (stdin)**.

## Local gesture trial

**Learn gestures** in the top bar opens a field guide with supported actions, what to avoid, and a safe confirmation-practice button that never runs code. Pinch the floating editor's header to move it; pinch its text area briefly to focus it, then type with the keyboard. Use the visible JS/C/C++/Java buttons for gesture language selection. A short, low-motion pinch released inside an ordinary button activates it. Code execution requires a steady pinch held over Run for 900 ms, with progress feedback; moving off the target cancels it. Release before a second execution. Mouse click or Ctrl/Command + Enter in the editor remains available. Pinch close/release hysteresis filters isolated noisy frames. The classroom header and side margins are smaller to keep the presenter stage large. These changes still require physical-camera rehearsal on the teaching laptop.

## Production build

```bash
npm run build
npm start
```

The repository also retains `npm run build:sites` for the existing Cloudflare/Sites deployment path.

## Current scope

This release is a polished classroom prototype. Shared lesson objects synchronize through an in-memory Next.js room relay, so two devices work while connected to the same running deployment. Room state resets when the server restarts. Production deployments should replace this relay with persistent realtime storage and add a managed WebRTC classroom provider.

## Stack

- Next.js 16 and React 19
- MediaPipe Tasks Vision
- Canvas 2D
- Pyodide and sql.js browser runtimes
- Prototype room relay with `BroadcastChannel` fast-path
- TypeScript and CSS
# Holographic classroom subjects

The unified scene keeps camera, floating code editor, function studio and ink together. **Show tools** is now the single drawer for subjects, visual settings and docked objects. Hold a tracked closed fist for 850 ms to show or hide it.

- Coding supports JavaScript, C, C++ and Java editing, with separate drafts preserved when switching languages. Project source displays it without execution. JavaScript runs in a time-limited browser worker (not a hardened sandbox for untrusted student code). C/C++/Java run only through a configured Judge0 service; actual runtime IDs come from its catalogue. Missing configuration disables Run with a recovery message. Never compile native code in Next.js. Numeric successful output creates particle columns; compiler failures remain diagnostics.
- Mathematics samples functions across x ∈ [−2π, 2π]. Enter `sin(x)`, `exp(-x^2/4)*cos(4*x)`, or import text containing a single expression / JSON containing `{"formula":"sin(x)"}`. File limit: 32 KB; expression limit: 500 characters. Explicit multiplication is required (`3*x`). Expressions use a restricted parser. Images/PDFs are not recognized as functions.
- OS demonstrates round-robin scheduling with three processes, quantum one, and step/reset controls.
- COA demonstrates a one-bit ALU, input registers, ADD/AND/OR/XOR and carry output. The explosion slider separates its particle components.
- Pinch a card header or the visualization itself to move it. A V sign held over a floating object for one second docks it into Show tools (one activation per hold); release before docking another. Two open palms must remain over the focused object for 220 ms before zoom arms. Zoom uses span noise rejection and damping. Fist hold opens tools; quick pinch activates visible buttons. Physical recognition still needs laptop rehearsal.
- Drag the visual's Move handle or canvas with mouse/touch, use its +/- buttons, scroll over the floating visual, or focus it and use arrow keys. Docked objects scroll normally (Ctrl+wheel zooms the docked visual). Brightness is adjustable from 70–180%, with a cyan halo and soft dark shadow for contrast. Float restores saved object positions; Dock all moves objects into the same tools drawer.

Source text, language/drafts, selected subject, committed card and model poses, brightness, maths function, ALU inputs and scheduling steps use classroom snapshot synchronization. Dock layout is personal to each viewer. The server is an in-memory prototype with polling for separate devices, not authenticated production infrastructure. The compiler adapter polls asynchronous jobs, disables job networking, limits CPU/wall/memory/output, and applies a coarse 10-jobs/minute guard; authenticated execution permissions and production per-user limits are still required before exposing it publicly.

Run `npm run test:lesson` for parser, ALU and scheduling tests. Physical gesture accuracy and camera performance must be rehearsed on the presentation laptop.
