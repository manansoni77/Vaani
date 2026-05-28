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
| `STT_PROVIDER` | STT provider to use (default: `sarvam`) |
| `TTS_PROVIDER` | TTS provider to use (default: `sarvam`) |

## Architecture

### Request Flow

```
Browser/Caller  →  WS /call  →  CallSession (sessions/session.py)
                                   ├── receive_loop()   # buffers audio, handles VAD signals
                                   ├── stt_task()       # STT provider → transcript
                                   └── tts_task()       # LLM response → TTS provider → audio chunks back to caller
                                         ↑
                                   DialogueFlow (ai_services/dialogue.py)
                                         ↑
                                   LLMClient (ai_services/llm.py)
```

### Dialogue State Machine (`ai_services/dialogue.py`)

Five phases: `GREETING → CAPTURE → VALIDATION → DECISION → COMPLETE`

Each phase runs a different prompt (`ai_services/prompts.py`) and returns a structured `SemanticMemory` (`ai_services/schemas.py`) that persists across turns: `summary`, `intent`, `key_details`, `sentiment`, `urgency_level`, `human_requested`, `agent_confidence`.

Confidence levels:
- `GREEN` — resolve autonomously
- `YELLOW` — needs review
- `RED` — escalate to human

### STT/TTS Provider System (`ai_services/stt_tts/`)

Abstract base classes (`base.py`) define `BaseSTTClient` and `BaseTTSClient`. Factory functions in `__init__.py` dispatch on `STT_PROVIDER`/`TTS_PROVIDER` env vars. Currently only Sarvam is implemented (`sarvam.py`).

### Human Takeover Flow

1. Admin/human agent calls `POST /sessions/{session_id}/takeover` — session is "claimed" in `sessions/registry.py`
2. Human connects to `WS /sessions/{session_id}/audio` — handled by `HumanAgentSession` (`sessions/human.py`)
3. `HumanAgentSession` forwards human audio to caller's WebSocket and runs parallel STT to produce `"human:"` transcript turns
4. `CallSession` detects `human_agent_ws` is set and bypasses the LLM pipeline

### Pub/Sub Broadcasters

Both `SessionBroadcaster` (`sessions/broadcaster.py`) and `LogBroadcaster` (`loggers/broadcaster.py`) use `asyncio.Queue` with a `maxsize`. Slow consumers are dropped (queue full → skip) rather than blocked — this keeps the call path non-blocking.

Admin dashboard connects to:
- `WS /sessions/stream` — live session status events
- `WS /logs/stream` — live log entries (filterable by `entity` and `level`)

### Logging System (`loggers/`)

Log entities defined in `loggers/entities.py` (exported via `loggers`): `APP`, `CALL`, `SARVAM_STT`, `SARVAM_TTS`, `OPENAI_LLM`, `DIALOGUE_FLOW`, `HUMAN_AGENT`

Logs are written to:
1. Database (`LogEntry` table in PostgreSQL/SQLite)
2. `LogBroadcaster` for live streaming
3. Console (suppressed with `--no-print-logs`)

### Database (`database/`)

- `database/engine.py` — `Base` (DeclarativeBase) and `get_engine()` lazy singleton; keeps Base separate to avoid circular imports
- `database/__init__.py` — pure re-export of `Base`, `get_engine`, `LogEntry`, `CallSessionRecord`, `save_call_session`
- `database/models.py` — `LogEntry` (all app logs) and `CallSessionRecord` (completed call metadata)
- `database/save.py` — `save_call_session()` helper used at call end

In production uses Supabase PostgreSQL; locally falls back to `application.db` (SQLite). Set `DB_URL` to switch — no other code changes needed.

### Audio Pipeline (`audio/`)

- **Incoming**: Raw PCM16LE audio chunks from browser at 16 kHz
- **STT**: Chunks accumulated and sent to STT provider when VAD signals end-of-speech
- **TTS**: LLM text response sent to TTS provider; audio chunks streamed back over WebSocket
- **Recording**: All call audio (user + TTS events) is mixed into a WAV file and uploaded to Cloudflare R2 via `audio/utils.py`
- **Cache**: Pre-recorded phrases cached as WAV files under `prerecorded/` via `audio/cache.py` to avoid redundant TTS calls
- **Phrases**: `PRERECORDED_AUDIO` enum lives in `audio/phrases.py`, exported via `audio`

### Datasets (`datasets.py`)

Defines `DATASETS` — a registry of named ML dataset configurations (summarization, intent classification, sentiment, urgency, escalation prediction, etc.) built from `CallSessionRecord` rows. Served via `GET /datasets` routes for fine-tuning data export.

## Package Structure

```
backend/
├── main.py                        # FastAPI app, lifespan, CORS, router registration
├── config.py                      # All env vars and runtime config (DB_URL, R2, Sarvam, VAD)
├── constants.py                   # Business enums only: PHASE, CONFIDENCE_LEVEL, SENTIMENT, URGENCY_LEVEL, QUERY_TYPE, SERVICE_TYPE
├── datasets.py                    # ML dataset registry for fine-tuning data export
├── run.py                         # CLI entry point (uvicorn launcher with --reload, --host, etc.)
│
├── ai_services/
│   ├── __init__.py                # Re-exports DialogueFlow
│   ├── dialogue.py                # DialogueFlow — phase state machine, semantic memory
│   ├── llm.py                     # LLMClient wrapping AsyncOpenAI (streaming + structured JSON)
│   ├── prompts.py                 # Per-phase system prompts
│   ├── schemas.py                 # Pydantic models: SemanticMemory, CaptureAndValidationResponse, DecisionResponse
│   └── stt_tts/
│       ├── __init__.py            # Factory functions: get_caller_stt_client(), get_agent_stt_client(), get_tts_client()
│       ├── base.py                # Abstract blueprints: BaseSTTClient, BaseTTSClient
│       └── sarvam.py              # Sarvam STT/TTS implementations
│
├── audio/
│   ├── __init__.py                # Re-exports PRERECORDED_AUDIO, cache helpers, utils
│   ├── phrases.py                 # PRERECORDED_AUDIO enum — fixed agent phrases
│   ├── cache.py                   # Load/save pre-recorded phrase WAVs; pcm_chunks() helper
│   └── utils.py                   # WAV encoding, audio mixing, R2 upload
│
├── database/
│   ├── __init__.py                # Pure re-export: Base, get_engine, models, save_call_session
│   ├── engine.py                  # Base (DeclarativeBase) + get_engine() singleton
│   ├── models.py                  # LogEntry, CallSessionRecord ORM models
│   └── save.py                    # save_call_session() helper
│
├── loggers/
│   ├── __init__.py                # Re-exports: get_logger, setup_logging, LogBroadcaster, LOG_ENTITIES, etc.
│   ├── entities.py                # LOG_ENTITIES enum
│   ├── logger.py                  # Multi-handler logger (DB + broadcast + console)
│   └── broadcaster.py             # Log entry pub/sub (asyncio.Queue, drops slow consumers)
│
├── routers/
│   ├── __init__.py                # Re-exports all routers
│   ├── call.py                    # WS /call — caller WebSocket entry point
│   ├── datasets.py                # GET /datasets — ML dataset export
│   ├── logs.py                    # HTTP + WS routes for log querying and streaming
│   └── sessions.py                # HTTP + WS routes for session management and human takeover
│
└── sessions/
    ├── __init__.py                # Re-exports CallSession, HumanAgentSession, registry helpers, broadcaster
    ├── session.py                 # CallSession dataclass + receive/STT/TTS async tasks
    ├── human.py                   # HumanAgentSession — audio bridge + STT for human agent
    ├── broadcaster.py             # Session status pub/sub (asyncio.Queue, drops slow consumers)
    └── registry.py                # In-memory dict of active CallSessions + claimed_by tracking
```
