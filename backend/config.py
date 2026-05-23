from dotenv import load_dotenv

load_dotenv()

import os

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