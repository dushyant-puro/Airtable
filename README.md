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

Optional Judge0 integration:

```bash
JUDGE0_BASE_URL=https://your-judge0-host
JUDGE0_API_KEY=optional-token
```

When configured, LiveLab loads the server's runtime catalogue and executes those languages through the sandboxed `/api/execute` adapter. Without it, the six browser runtimes remain available.

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
