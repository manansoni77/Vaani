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
Browser/Caller  →  WS /call  →  CallSession (sessions/session.py)
                                   ├── receive_loop()   # buffers audio, handles VAD signals
                                   ├── stt_task()       # Sarvam STT → transcript
                                   └── tts_task()       # LLM response → Sarvam TTS → audio chunks back to caller
                                         ↑
                                   DialogueFlow (ai_services/dialogue_flow.py)
                                         ↑
                                   LLMClient (ai_services/llm_client.py)
```

### Dialogue State Machine (`ai_services/dialogue_flow.py`)

Five phases: `GREETING → CAPTURE → VALIDATION → DECISION → COMPLETE`

Each phase runs a different prompt (`ai_services/prompts.py`) and returns a structured `SemanticMemory` that persists across turns: `summary`, `intent`, `key_details`, `sentiment`, `urgency_level`, `human_requested`, `agent_confidence`.

Confidence levels:
- `GREEN` — resolve autonomously
- `YELLOW` — needs review
- `RED` — escalate to human

### Human Takeover Flow

1. Admin/human agent calls `POST /sessions/{session_id}/takeover` — session is "claimed" in `sessions/session_registry.py`
2. Human connects to `WS /sessions/{session_id}/audio` — handled by `HumanAgentSession` (`sessions/human_session.py`)
3. `HumanAgentSession` forwards human audio to caller's WebSocket and runs parallel STT to produce `"human:"` transcript turns
4. `CallSession` detects `human_agent_ws` is set and bypasses the LLM pipeline

### Pub/Sub Broadcasters

Both `SessionBroadcaster` (`sessions/session_broadcaster.py`) and `LogBroadcaster` (`logging_module/log_broadcaster.py`) use `asyncio.Queue` with a `maxsize`. Slow consumers are dropped (queue full → skip) rather than blocked — this keeps the call path non-blocking.

Admin dashboard connects to:
- `WS /sessions/stream` — live session status events
- `WS /logs/stream` — live log entries (filterable by `entity` and `level`)

### Logging System (`logging_module/logger.py`)

Log entities: `APP`, `CALL`, `SARVAM_STT`, `SARVAM_TTS`, `OPENAI_LLM`, `DIALOGUE_FLOW`, `HUMAN_AGENT`

Logs are written to:
1. Database (`LogEntry` table in PostgreSQL/SQLite)
2. `LogBroadcaster` for live streaming
3. Console (suppressed with `--no-print-logs`)

### Database (`database/`)

- `database/__init__.py` — `get_engine()` lazy-initialises a sync SQLAlchemy engine and runs `create_all`
- `database/models.py` — `LogEntry` (all app logs) and `CallSessionRecord` (completed call metadata)
- `database/save_fn.py` — `save_call_session()` helper used at call end

In production uses Supabase PostgreSQL; locally falls back to `application.db` (SQLite). Set `DB_URL` to switch — no other code changes needed.

### Audio Pipeline (`audio/`)

- **Incoming**: Raw PCM16LE audio chunks from browser at 16 kHz
- **STT**: Chunks accumulated and sent to Sarvam STT when VAD signals end-of-speech
- **TTS**: LLM text response sent to Sarvam TTS; audio chunks streamed back over WebSocket
- **Recording**: All call audio (user + TTS events) is mixed into a WAV file and uploaded to Cloudflare R2 via `audio/audio_utils.py`
- **Cache**: Pre-recorded phrases (e.g. greeting) are cached as WAV files under `prerecorded/` via `audio/audio_cache.py` to avoid redundant TTS calls

### Datasets (`datasets.py`)

Defines `DATASETS` — a registry of named ML dataset configurations (summarization, intent classification, sentiment, urgency, escalation prediction, etc.) built from `CallSessionRecord` rows. Served via `GET /datasets` routes for fine-tuning data export.

## Package Structure

```
backend/
├── main.py                        # FastAPI app, lifespan, CORS, router registration
├── config.py                      # All env vars and constants (DB_URL, R2, Sarvam, VAD)
├── constants.py                   # Enums (Phase, Confidence, Sentiment, Urgency), Pydantic models
├── datasets.py                    # ML dataset registry for fine-tuning data export
├── run.py                         # CLI entry point (uvicorn launcher with --reload, --host, etc.)
│
├── ai_services/
│   ├── dialogue_flow.py           # DialogueFlow — phase state machine, semantic memory
│   ├── llm_client.py              # LLMClient wrapping AsyncOpenAI (streaming + structured JSON)
│   └── prompts.py                 # Per-phase system prompts
│
├── audio/
│   ├── audio_cache.py             # Load/save pre-recorded phrase WAVs; pcm_chunks() helper
│   └── audio_utils.py             # WAV encoding, audio mixing, R2 upload
│
├── database/
│   ├── __init__.py                # get_engine() — lazy sync SQLAlchemy engine + create_all
│   ├── models.py                  # LogEntry, CallSessionRecord ORM models
│   └── save_fn.py                 # save_call_session() helper
│
├── logging_module/
│   ├── logger.py                  # Multi-handler logger (DB + broadcast + console)
│   └── log_broadcaster.py         # Log entry pub/sub (asyncio.Queue, drops slow consumers)
│
├── routers/
│   ├── router_call.py             # WS /call — caller WebSocket entry point
│   ├── router_datasets.py         # GET /datasets — ML dataset export
│   ├── router_logs.py             # HTTP + WS routes for log querying and streaming
│   └── router_sessions.py         # HTTP + WS routes for session management and human takeover
│
└── sessions/
    ├── session.py                 # CallSession dataclass + receive/STT/TTS async tasks
    ├── human_session.py           # HumanAgentSession — audio bridge + STT for human agent
    ├── session_broadcaster.py     # Session status pub/sub (asyncio.Queue, drops slow consumers)
    └── session_registry.py        # In-memory dict of active CallSessions + claimed_by tracking
```
