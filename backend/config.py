import os
from pathlib import Path

from dotenv import load_dotenv

# Always load the backend-local `.env`, regardless of the current working directory.
# This fixes ingestion scripts (run from `Scripts/ingestion/`) not picking up backend env vars.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

PRERECORDED_DIR = os.path.join(os.path.dirname(__file__), "prerecorded")

PCM_CHUNK_SIZE = 8192  # bytes per chunk when streaming cached PCM
PCM_SAMPLE_RATE = 16000  # Hz — must match AudioContext sampleRate on frontend

R2_ACCOUNT_ID        = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID     = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME       = os.getenv("R2_BUCKET_NAME", "vaani")
R2_PUBLIC_URL        = os.getenv("R2_PUBLIC_URL", "https://pub-0eafe6c1b8bf435d8cc1ea73caed3e2e.r2.dev")

# Change DB_URL to switch backends — no other code needs to change.
# SQLite:     sqlite:///application.db
# PostgreSQL: postgresql://user:pass@host/dbname
# MySQL:      mysql+pymysql://user:pass@host/dbname

DB_URL = os.getenv("DB_URL", "sqlite:///application.db")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_SPEAKER_PROFILE = os.getenv("SARVAM_SPEAKER_PROFILE", "ishita")

STT_PROVIDER = os.getenv("STT_PROVIDER", "sarvam")
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "sarvam")

# When True, audio is only forwarded to Sarvam STT while the frontend VAD reports speaking=true.
# When False (default), all audio is forwarded and Sarvam's internal VAD handles filtering.
VAD_GATE_STT: bool = os.getenv("VAD_GATE_STT", "0") not in ("0", "false", "no")

# Auth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")                       # Google OAuth2 client ID — required for /auth/google
JWT_SECRET       = os.getenv("JWT_SECRET", "change-me-in-production")  # HMAC secret for signing app JWTs
JWT_ALGORITHM    = "HS256"
JWT_EXPIRE_SECS  = int(os.getenv("JWT_EXPIRE_SECS", "3600"))

# Pinecone
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "vaani")
PINECONE_REGION = os.getenv("PINECONE_REGION") or os.getenv("PINECONE_ENVIRONMENT") or "us-east-1"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# Ingestion & Retrieval
UPSERT_BATCH_SIZE = int(os.getenv("UPSERT_BATCH_SIZE", "100"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
TOP_K = int(os.getenv("TOP_K", "3"))
SCORE_THRESHOLD = float(os.getenv("SCORE_THRESHOLD", "0.75"))
