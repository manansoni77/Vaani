# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vaani** is a voice-based AI helpline backend. Callers connect over WebSocket, speak to an LLM-powered agent (via Sarvam STT → OpenAI GPT-4o-mini → Sarvam TTS), and can be escalated to a human agent who claims the session and speaks directly to the caller.

## Development Commands

```bash
# Run dev server (hot-reload)
python run.py --reload

# Run without console log output
python run.py --no-print-logs

# Custom host/port
python run.py --host 0.0.0.0 --port 8000

# Install dependencies (uses UV)
uv sync

# Docker build & run
docker build -t vaani-backend .
docker run -p 8080:8080 --env-file .env vaani-backend
```

No test suite exists in this project.

## Environment Variables

Copy `.env` and fill in:

| Variable | Purpose |
|----------|---------|
| `SARVAM_API_KEY` | Sarvam STT/TTS API |
| `OPENAI_KEY` | OpenAI (gpt-4o-mini) |
| `DB_URL` | PostgreSQL (Supabase) — falls back to SQLite `application.db` |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 for audio storage |
| `VAD_GATE_STT` | `1` to enable client-side VAD filtering before STT |
| `SARVAM_SPEAKER_PROFILE` | TTS voice profile (e.g. `ishita`) |

## Architecture

### Request Flow

```
Browser/Caller  →  WS /call  →  CallSession
                                   ├── receive_loop()   # buffers audio, handles VAD signals
                                   ├── stt_task()       # Sarvam STT → transcript
                                   └── tts_task()       # LLM response → Sarvam TTS → audio chunks back to caller
                                         ↑
                                   DialogueFlow (LLM pipeline)
                                         ↑
                                   llm.py (AsyncOpenAI wrapper)
```

### Dialogue State Machine (`llm_pipeline.py`)

Five phases: `GREETING → CAPTURE → VALIDATION → DECISION → COMPLETE`

Each phase runs a different prompt (`prompts.py`) and returns a structured `SemanticMemory` that persists across turns: `summary`, `intent`, `key_details`, `sentiment`, `urgency_level`, `human_requested`, `agent_confidence`.

Confidence levels:
- `GREEN` — resolve autonomously
- `YELLOW` — needs review
- `RED` — escalate to human

### Human Takeover Flow

1. Admin/human agent calls `POST /sessions/{session_id}/takeover` — session is "claimed" in `session_registry.py`
2. Human connects to `WS /sessions/{session_id}/audio` — handled by `HumanAgentSession` (`human_session.py`)
3. `HumanAgentSession` forwards human audio to caller's WebSocket and runs parallel STT to produce `"human:"` transcript turns
4. `CallSession` detects `human_agent_ws` is set and bypasses the LLM pipeline

### Pub/Sub Broadcasters

Both `SessionBroadcaster` (`session_broadcaster.py`) and `LogBroadcaster` (`log_broadcaster.py`) use `asyncio.Queue` with a `maxsize`. Slow consumers are dropped (queue full → skip) rather than blocked — this keeps the call path non-blocking.

Admin dashboard connects to:
- `WS /sessions/stream` — live session status events
- `WS /logs/stream` — live log entries (filterable by `entity` and `level`)

### Logging System (`logger.py`)

Log entities: `APP`, `CALL`, `SARVAM_STT`, `SARVAM_TTS`, `OPENAI_LLM`, `DIALOGUE_FLOW`, `HUMAN_AGENT`

Logs are written to:
1. Database (`LogEntry` table in PostgreSQL/SQLite)
2. `LogBroadcaster` for live streaming
3. Console (suppressed with `--no-print-logs`)

### Database Models

- `LogEntry` — all application logs (entity, level, session_id, message, timestamp)
- `CallSessionRecord` — completed call metadata (duration, phase reached, sentiment, urgency, human_requested, transcript)

SQLAlchemy with async engine. In production uses Supabase PostgreSQL; locally falls back to `application.db` (SQLite).

### Audio Pipeline

- **Incoming**: Raw PCM16LE audio chunks from browser at 16 kHz
- **STT**: Chunks accumulated and sent to Sarvam STT when VAD signals end-of-speech
- **TTS**: LLM text response sent to Sarvam TTS; audio chunks streamed back over WebSocket
- **Recording**: All call audio (user + TTS events) is mixed into a WAV file and uploaded to Cloudflare R2 via `audio_utils.py`

## Key Files

| File | Role |
|------|------|
| `main.py` | FastAPI app, lifespan (DB init, broadcaster setup), CORS, router registration |
| `session.py` | `CallSession` dataclass + three async tasks (receive, STT, TTS) |
| `llm_pipeline.py` | `DialogueFlow` — phase state machine, semantic memory accumulation |
| `llm.py` | `LLMClient` wrapping AsyncOpenAI (streaming + JSON structured output) |
| `prompts.py` | Per-phase system prompts |
| `constants.py` | Enums (`Phase`, `Confidence`, `Sentiment`, `Urgency`) and Pydantic response models |
| `human_session.py` | `HumanAgentSession` — audio bridge + STT for human agent |
| `session_registry.py` | In-memory dict of active `CallSession`s + claimed_by tracking |
| `sessions_router.py` | HTTP + WebSocket routes for session management and human takeover |
| `logs_router.py` | HTTP + WebSocket routes for log querying and streaming |
| `audio_utils.py` | WAV encoding, audio mixing, R2 upload |
| `logger.py` | Multi-handler logger (DB + broadcast + console) |
| `session_broadcaster.py` | Session status pub/sub |
| `log_broadcaster.py` | Log entry pub/sub |
