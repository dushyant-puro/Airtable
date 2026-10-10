# AirBoard

![AirBoard — Draw ideas in the air](public/og.png)

AirBoard is a gesture-powered meeting canvas. It uses your webcam and on-device hand tracking to turn a pinch gesture into a live drawing tool—no wearable hardware required.

## What it does

- Pinch thumb and index finger to draw
- Hold up two fingers to erase
- Open your hand to pause safely
- Draw with a mouse or touch when a camera is unavailable
- Undo, clear, change colors and brush size, and export the board as a PNG
- Mirror drawing updates between tabs on the same origin with `BroadcastChannel`
- Play a built-in showcase demo without granting camera permission

Hand landmark detection runs in the browser with MediaPipe Tasks Vision. Camera frames are not uploaded by this app.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), allow camera access, raise one hand, and pinch to draw.

## Deploy on Vercel

Import this repository into Vercel and keep the detected defaults:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: Next.js default

No environment variables are required. HTTPS is required for camera access outside localhost.

## Production build

```bash
npm run build
npm start
```

The repository also retains `npm run build:sites` for the existing Cloudflare/Sites deployment path.

## Current scope

This release is a polished interaction prototype. Drawing synchronization currently works between browser tabs on the same device. Cross-device rooms, signaling, and real meeting audio/video need a shared realtime backend or WebRTC signaling service.

## Stack

- Next.js 16 and React 19
- MediaPipe Tasks Vision
- Canvas 2D
- TypeScript and CSS
