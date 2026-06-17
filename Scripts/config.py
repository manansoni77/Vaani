import os
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

# Pinecone
PINECONE_API_KEY    = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "vaani")
PINECONE_REGION     = os.getenv("PINECONE_REGION") or os.getenv("PINECONE_ENVIRONMENT") or "us-east-1"
EMBEDDING_MODEL     = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# Ingestion
UPSERT_BATCH_SIZE = int(os.getenv("UPSERT_BATCH_SIZE", "100"))
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
EMBEDDING_DIM     = int(os.getenv("EMBEDDING_DIM", "1536"))
