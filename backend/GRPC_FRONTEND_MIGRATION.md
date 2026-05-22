# gRPC-Web Frontend Migration Guide

The backend now exposes a gRPC-Web transport alongside the existing WebSocket endpoints. This document is a complete reference for migrating or adding the gRPC path in the browser client.

---

## What changed on the backend

| Old (WebSocket) | New (gRPC-Web) |
|---|---|
| `WS /call` | `POST /grpc/vaani.CallService/StreamCall` |
| `WS /sessions/{id}/audio` | `POST /grpc/vaani.AgentService/StreamAgentAudio` |

The **WebSocket endpoints are unchanged and still work.** gRPC-Web runs alongside them on the same host and port.

---

## Browser compatibility

| Browser | Support |
|---|---|
| Chrome 105+ | Full bidirectional streaming |
| Firefox 110+ | Full bidirectional streaming |
| Safari < 16.4 | **Not supported** — use the WebSocket endpoint |
| Safari 16.4+ | Works, but test before relying on it |

For Safari users, keep the WebSocket path as a fallback.

---

## ⚠️ Critical: use gRPC-Web, NOT native gRPC

**`ERR_ALPN_NEGOTIATION_FAILED`** means the client is trying to use native gRPC,
which requires HTTP/2. The backend runs on uvicorn (HTTP/1.1 only) and speaks
**gRPC-Web** — a different wire protocol that works over HTTP/1.1.

The two libraries look similar but are incompatible:

| Library | Protocol | Works here? |
|---|---|---|
| `grpc-web` (Google) | gRPC-Web over HTTP/1.1 | ✅ |
| `@improbable-eng/grpc-web` | gRPC-Web over HTTP/1.1 | ✅ |
| `@grpc/grpc-js` | Native gRPC over HTTP/2 | ❌ |
| `grpc` (Node.js) | Native gRPC over HTTP/2 | ❌ |

If you see `ERR_ALPN_NEGOTIATION_FAILED`, you are using one of the ❌ libraries.
Switch to `grpc-web` and regenerate your stubs.

---

## Step 1 — Install tooling

```bash
npm install grpc-web google-protobuf
npm install --save-dev protoc-gen-grpc-web
```

You also need `protoc` on your PATH ([download](https://github.com/protocolbuffers/protobuf/releases)).

---

## Step 2 — Quick smoke-test (verify transport before writing app code)

With the server running (`python run.py`), open Chrome DevTools console and paste:

```js
// Confirm the /grpc path responds to gRPC-Web framing.
// Expect: HTTP 200 with Content-Type: application/grpc-web+proto
fetch('http://localhost:8000/grpc/vaani.CallService/StreamCall', {
  method: 'POST',
  headers: { 'Content-Type': 'application/grpc-web+proto', 'X-Grpc-Web': '1' },
  body: new Uint8Array([0, 0, 0, 0, 0]),  // empty gRPC-Web frame
})
  .then(r => console.log('status:', r.status, 'ct:', r.headers.get('content-type')))
  .catch(e => console.error(e));
```

Expected output: `status: 200 ct: application/grpc-web+proto`

If you see a **network error or ALPN error** here (before adding any library), the backend
is not running or the `/grpc` path is unreachable — fix that first.

---

## Step 3 — Generate JS/TS client stubs

Copy `proto/vaani.proto` from this repo into your frontend project, then run:

```bash
protoc \
  --js_out=import_style=commonjs,binary:./src/proto \
  --grpc-web_out=import_style=typescript,mode=grpcwebtext:./src/proto \
  -I ./proto \
  vaani.proto
```

This produces:
- `src/proto/vaani_pb.js` + `vaani_pb.d.ts` — message classes
- `src/proto/VaaniServiceClientPb.ts` — typed client stubs

**`mode=grpcwebtext`** (base64 over HTTP/1.1) is the safest choice — works everywhere
`grpc-web` is supported. `mode=grpcweb` (binary) is smaller but requires Chrome 105+
with streaming `fetch` request bodies.

---

## Step 4 — Wire protocol

### Message types

Every frame is a typed protobuf message. Use `.hasAudio()`, `.hasVad()`, etc. to check which `oneof` field is set.

```
CallClientMessage  (client → server)
  .audio     AudioChunk    { pcm_data: Uint8Array }   ← raw PCM16LE 16 kHz
  .vad       VadSignal     { speaking: boolean }

CallServerMessage  (server → client)
  .metadata  SessionMetadata { session_id: string }   ← sent ONCE on connect
  .audio     AudioChunk    { pcm_data: Uint8Array }   ← TTS PCM16LE 16 kHz
  .end_call  EndCall        {}                        ← call is complete

AgentClientMessage (client → server, human-agent stream)
  .audio     AudioChunk
  .vad       VadSignal

AgentServerMessage (server → client, human-agent stream)
  .audio     AudioChunk    ← caller audio forwarded to agent
```

### Audio format

Both directions use **raw PCM16LE, 16 kHz, mono** — no WAV header, no encoding. Pass chunks directly to/from a `ScriptProcessor` or `AudioWorklet`.

---

## Step 5 — Caller flow (`StreamCall`)

### 5a. Open the stream and receive session_id

```ts
import { CallServiceClient } from './proto/VaaniServiceClientPb';
import { CallClientMessage, CallServerMessage, AudioChunk, VadSignal } from './proto/vaani_pb';

// Use http:// (not https://) — the backend is plain HTTP/1.1.
// The grpc-web library handles the gRPC-Web framing over HTTP/1.1 automatically.
const client = new CallServiceClient('http://localhost:8000/grpc');

const stream = client.streamCall({} /* metadata headers */);

let sessionId: string | null = null;

stream.on('data', (msg: CallServerMessage) => {
  if (msg.hasMetadata()) {
    sessionId = msg.getMetadata()!.getSessionId();
    console.log('session started:', sessionId);
  } else if (msg.hasAudio()) {
    const pcm = msg.getAudio()!.getPcmData_asU8();
    playAudio(pcm);             // feed to AudioContext
  } else if (msg.hasEndCall()) {
    console.log('call ended by server');
    stream.cancel();
  }
});

stream.on('error', (err) => console.error('stream error:', err));
stream.on('end', () => console.log('stream closed'));
```

### 5b. Send audio chunks

```ts
function sendAudioChunk(pcm: Uint8Array) {
  const chunk = new AudioChunk();
  chunk.setPcmData(pcm);

  const msg = new CallClientMessage();
  msg.setAudio(chunk);

  stream.write(msg);
}
```

### 5c. Send VAD signals

The browser's VAD (e.g. from `@ricky0123/vad-web`) should send speaking state changes:

```ts
function sendVad(speaking: boolean) {
  const vad = new VadSignal();
  vad.setSpeaking(speaking);

  const msg = new CallClientMessage();
  msg.setVad(vad);

  stream.write(msg);
}

// Example hook-up with @ricky0123/vad-web
vad.on('speechstart', () => sendVad(true));
vad.on('speechend',   () => sendVad(false));
```

### 5d. Full session lifecycle

```ts
// On page unload / hang-up button
function endCall() {
  stream.cancel();
}
```

---

## Step 6 — Human agent flow (`StreamAgentAudio`)

The human agent flow requires two extra headers: `session-id` and `agent-id`. The `session-id` comes from claiming the call via `POST /sessions/{id}/takeover`.

```ts
import { AgentServiceClient } from './proto/VaaniServiceClientPb';
import { AgentClientMessage, AgentServerMessage, AudioChunk, VadSignal } from './proto/vaani_pb';

const agentClient = new AgentServiceClient('http://localhost:8000/grpc');

const metadata = {
  'session-id': claimedSessionId,   // from takeover response
  'agent-id':   myAgentId,
};

const stream = agentClient.streamAgentAudio(metadata);

stream.on('data', (msg: AgentServerMessage) => {
  if (msg.hasAudio()) {
    const pcm = msg.getAudio()!.getPcmData_asU8();
    playCallerAudio(pcm);   // caller audio piped to agent's speakers
  }
});

// Send agent mic audio to caller
function sendAgentAudio(pcm: Uint8Array) {
  const chunk = new AudioChunk();
  chunk.setPcmData(pcm);
  const msg = new AgentClientMessage();
  msg.setAudio(chunk);
  stream.write(msg);
}

// Send agent VAD
function sendAgentVad(speaking: boolean) {
  const vad = new VadSignal();
  vad.setSpeaking(speaking);
  const msg = new AgentClientMessage();
  msg.setVad(vad);
  stream.write(msg);
}
```

---

## Step 7 — Audio plumbing (PCM16LE ↔ AudioContext)

### Receiving TTS audio (server → speakers)

```ts
const audioCtx = new AudioContext({ sampleRate: 16000 });

function playAudio(pcm: Uint8Array) {
  // PCM16LE to Float32
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const float32 = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32[i] = samples[i] / 32768;
  }

  const buffer = audioCtx.createBuffer(1, float32.length, 16000);
  buffer.copyToChannel(float32, 0);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start();
}
```

### Capturing mic audio (mic → server)

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const micCtx  = new AudioContext({ sampleRate: 16000 });
const source  = micCtx.createMediaStreamSource(stream);

// AudioWorklet is preferred; ScriptProcessor shown here for brevity
const processor = micCtx.createScriptProcessor(1024, 1, 1);
source.connect(processor);
processor.connect(micCtx.destination);

processor.onaudioprocess = (e) => {
  const float32 = e.inputBuffer.getChannelData(0);

  // Float32 to PCM16LE
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }

  sendAudioChunk(new Uint8Array(int16.buffer));
};
```

---

## Migrating from WebSocket: diff summary

| Concern | WebSocket | gRPC-Web |
|---|---|---|
| Connect | `new WebSocket(url)` | `client.streamCall({})` |
| Session ID | received as `{"type":"metadata","session_id":"..."}` JSON text frame | first `CallServerMessage` has `.hasMetadata()` set |
| Send audio | `ws.send(pcmBytes)` (binary frame) | `stream.write(msg)` with `msg.setAudio(chunk)` |
| Send VAD | `ws.send(JSON.stringify({type:"vad",speaking:bool}))` (text frame) | `stream.write(msg)` with `msg.setVad(vad)` |
| Receive TTS audio | `ws.onmessage` — binary frame | `stream.on('data')` → `msg.hasAudio()` |
| End-of-call signal | JSON text frame `{"type":"END_CALL"}` | `msg.hasEndCall()` |
| Disconnect | `ws.close()` | `stream.cancel()` |
| Human agent headers | WebSocket query params `?agent_id=` | gRPC metadata headers `session-id`, `agent-id` |

---

## Error handling

```ts
stream.on('error', (err: grpcWeb.RpcError) => {
  switch (err.code) {
    case grpcWeb.StatusCode.NOT_FOUND:
      // session_id not found (agent flow)
      break;
    case grpcWeb.StatusCode.PERMISSION_DENIED:
      // agent not authorized (agent flow)
      break;
    case grpcWeb.StatusCode.DEADLINE_EXCEEDED:
      // grpc-timeout header hit
      break;
    default:
      console.error('gRPC error', err.code, err.message);
  }
});
```

---

## CORS

CORS is enabled automatically by sonora for all `/grpc/*` paths. No extra configuration needed in the browser.

---

## Troubleshooting

### `ERR_ALPN_NEGOTIATION_FAILED`
**Cause:** Client is using native gRPC (HTTP/2) instead of gRPC-Web (HTTP/1.1).  
**Fix:** Replace `@grpc/grpc-js` or `grpc` with the `grpc-web` npm package. Regenerate stubs with `protoc-gen-grpc-web`.

### `ERR_FAILED` / connection refused
**Cause:** Backend not running, wrong port, or CORS blocked.  
**Fix:** Run the smoke-test `fetch` in Step 2 to confirm the `/grpc` path is reachable.

### `status: 404` on the smoke-test fetch
**Cause:** Server is running but gRPC sub-app is not mounted.  
**Fix:** Restart the backend — `make_grpc_asgi_app()` is called at startup in `main.py`.

### `status: 400` on real requests
**Cause:** `Content-Type` header is missing or wrong.  
**Fix:** The `grpc-web` library sets this automatically. If you're making raw `fetch` calls, set `Content-Type: application/grpc-web+proto` (binary) or `application/grpc-web-text+proto` (base64).

### `stream.on('data')` never fires
**Cause:** The server may be waiting for more request frames before it sends back metadata.  
**Fix:** The server sends `SessionMetadata` immediately on connection without waiting for audio. If `data` never fires, check that `stream.cancel()` isn't being called before the first frame arrives.

### Mixed content error (HTTPS frontend → HTTP backend)
**Cause:** A secure origin (HTTPS) cannot make requests to an insecure origin (HTTP) in Chrome.  
**Fix:** Either serve the backend over HTTPS too, or run the frontend on `http://localhost` (not `https://`) during development.

---

## Verification checklist

- [ ] Proto stubs generated and importable
- [ ] `stream.on('data')` receives a `SessionMetadata` message within ~100 ms of opening stream
- [ ] Sending a `VadSignal(speaking=true)` followed by audio chunks + `VadSignal(speaking=false)` triggers a server TTS response
- [ ] TTS audio arrives as `CallServerMessage.audio` chunks and plays correctly
- [ ] After the AI dialogue completes, `CallServerMessage.end_call` is received
- [ ] `WS /call` still works (WebSocket regression)
- [ ] Safari users fall back to WebSocket path
