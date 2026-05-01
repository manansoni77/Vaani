# Vaani — AI Voice Intelligence for 1092 Citizen Helpline

> Confidence-aware, human-in-the-loop voice platform for multilingual emergency citizen services.

---

## What it does

Vaani replaces rigid IVR menus and overloaded human operators on India's 1092 citizen helpline with an AI-native voice pipeline that:

- **Understands** — Transcribes Kannada, Hindi, and English (including regional dialects) using Sarvam AI, then extracts intent, entities, and a confidence score via LLM
- **Verifies** — Restates the citizen's query before acting; only responds autonomously if confidence ≥ 80%
- **Escalates** — Routes low-confidence or complex calls instantly to a human operator with full transcript and context pre-loaded

Every call is logged end-to-end: audio recording, transcript, decision trail, and confidence scores at each step.

---

## Why it exists

| | Human agents | Traditional IVR | Vaani |
|---|---|---|---|
| Handle time | 5–8 min | 3–5 min | 45–90 sec |
| Capacity (per operator/hr) | 7–12 calls | — | 3–4× via AI assist |
| Call abandonment | 8–15% | ~15% | < 3% |
| FCR rate | 65–75% | 40–55% | 85–92% |
| Dialect support | Operator-dependent | None | Native (Sarvam AI) |
| Audit trail | Manual notes | Call logs only | 100% digital |

---

## Tech stack

**Frontend** — Next.js · TypeScript · Tailwind CSS · WebSockets

**Backend** — FastAPI · Python 3.9+ · SQLAlchemy · Pydantic · Gunicorn

**AI/ML** — Sarvam AI (multilingual STT/TTS) · OpenAI API (LLM) · spaCy (NER) · NLTK

**Storage** — SQLite · Cloudflare R2 (audio) · Redis (sessions/cache)

---

## How it works

```
Caller → Audio call (webapp / WhatsApp API)
       → Sarvam AI: speech-to-text with dialect support
       → LLM: intent + entities + confidence score
       → Confidence is high?
            Yes → AI restates query → Caller confirms → TTS response → Audit log
                Caller rejects → Escalate to Human operator
            No  → Human operator alerted with full context
```

---

## Key features

- **Dialogue loop** — up to 3 clarification turns before escalation
- **Live dashboard** — real-time transcript, confidence indicators, and human alert panel for operators
- **Audit page** — complete call history with word-level audio playback
- **Continuous learning** — human corrections feed back into confidence threshold calibration and model retraining