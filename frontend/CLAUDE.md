# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠ Non-standard Next.js version

This project uses **Next.js 16.2.4**, which has breaking changes — APIs, conventions, and file structure differ from commonly known versions. **Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.** Heed deprecation notices.

## Commands

```bash
pnpm dev        # Start dev server (http://localhost:3000)
pnpm build      # Production build
pnpm start      # Run production build
pnpm lint       # Run ESLint
```

There are no tests configured.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend REST base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | Backend WebSocket base URL |

Both are exported from `lib/config.ts` as `API_BASE` and `WS_BASE` and imported by all pages.

## Architecture

### App structure

Uses **Next.js App Router** (`app/` directory). Every page is a client component (`"use client"`). There are no server components, server actions, or API routes in this frontend — all data fetching goes to the external backend.

```
app/
  page.tsx        — Home: navigation hub
  layout.tsx      — Root layout (Geist fonts, Tailwind globals)
  call/page.tsx   — Real-time caller audio session
  admin/page.tsx  — Operator dashboard (live sessions + history)
  audit/page.tsx  — System audit log viewer
  dataset/page.tsx — ML training dataset browser
lib/
  config.ts       — API_BASE / WS_BASE from env vars
public/
  audio-processor.worklet.js — AudioWorklet (runs off main thread)
```

### Real-time audio pipeline (`/call`)

The call page implements a full duplex audio session over a single WebSocket (`WS_BASE/call`):

- **Microphone capture**: `getUserMedia` → `AudioContext` (16 kHz) → `GainNode` (mute gate) → `AnalyserNode` (VAD) + `AudioWorkletNode` (encoder)
- **Encoding**: The worklet (`public/audio-processor.worklet.js`) accumulates 2048-sample chunks (128 ms at 16 kHz) and posts `Float32Array` to the main thread, which converts to `Int16Array` and sends as binary WebSocket frames.
- **VAD**: Frequency bin average over 85–255 Hz compared against `VAD_SILENCE_THRESHOLD = 100`. A JSON frame `{ type: "vad", speaking: bool }` is sent alongside every audio frame.
- **Mute**: Implemented as `GainNode.gain = 0`, not mic stop — the worklet and VAD still run but forward silence.
- **TTS playback**: Binary frames received from server are Int16 PCM at 16 kHz. They are decoded and queued as `AudioBufferSourceNode` instances scheduled via `nextPlayTimeRef` for gapless playback.
- **Barge-in**: When the user starts speaking while the agent is playing TTS, `stopAgentAudio()` cancels all queued `AudioBufferSourceNode`s.

### Admin dashboard (`/admin`)

Two tabs sharing a resizable detail panel:

- **Live tab**: Subscribes to `WS_BASE/sessions/stream` for real-time `SessionEvent` updates (`session_started`, `session_updated`, `session_ended`). Bootstrapped on mount from `GET API_BASE/sessions`.
- **History tab**: Paginated fetch from `API_BASE/sessions/history` with date/order/query_type filters.
- **Human takeover**: An operator posts to `POST API_BASE/sessions/{id}/takeover` with their `agent_id`. Once claimed, the `DetailPanel` opens a second WebSocket (`WS_BASE/sessions/{id}/audio?agent_id=…`) for bidirectional audio using a `ScriptProcessorNode` + push-to-talk VAD.

### Session data model

Key fields on the `Session` type:
- `phase`: `GREETING → CAPTURE → VALIDATION → DECISION → COMPLETE`
- `sentiment`: `neutral | calm | anxious | angry`
- `urgency_level`: `none | low | medium | high`
- `query_type`: `EMERGENCY | MUNICIPALITY | GENERAL`
- `service_type` (emergency only): `police | medical | fire | disaster_relief`
- `human_requested`, `human_takeover`, `claimed_by`: human escalation flags

### Styling

Uses **Tailwind CSS v4** (PostCSS plugin `@tailwindcss/postcss`). v4 syntax differs from v3 — e.g., use `bg-linear-to-br` not `bg-gradient-to-br`. Check Tailwind v4 docs before using utility classes.

### Path aliases

`@/` resolves to the project root (e.g., `import { API_BASE } from "@/lib/config"`).
