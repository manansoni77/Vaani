import logging
from pathlib import Path
from typing import List

from .embedder import embed_texts
from .pinecone_client import get_index

from config import UPSERT_BATCH_SIZE

log = logging.getLogger(__name__)


def upsert_chunks(chunks: List[dict]) -> None:
    """
    Embed and upsert a list of chunks to the Pinecone index.

    Each chunk must have:
        "id"       → unique string ID
        "text"     → text to embed
        "metadata" → dict stored alongside the vector

    Processes in batches of cfg.upsert_batch_size to avoid
    Pinecone's 4MB per-request payload limit.
    """
    if not chunks:
        log.warning("upsert_chunks called with empty list — nothing to do")
        return

    index = get_index()
    total = len(chunks)
    upserted = 0

    for batch_start in range(0, total, UPSERT_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + UPSERT_BATCH_SIZE]

        texts = [c["text"] for c in batch]
        vectors = embed_texts(texts)

        # Pinecone upsert expects: [(id, vector, metadata), ...]
        pinecone_vectors = [
            {
                "id":       chunk["id"],
                "values":   vector,
                "metadata": chunk["metadata"],
            }
            for chunk, vector in zip(batch, vectors)
        ]

        index.upsert(vectors=pinecone_vectors)

        upserted += len(batch)
        batch_no = batch_start // UPSERT_BATCH_SIZE + 1
        log.info(f"Upserted batch {batch_no} ({len(batch)} vectors)")

    log.info(f"Done. {upserted} vectors upserted to index")


def delete_all() -> None:
    """
    Wipe all vectors from the index. Use before a full re-index to avoid stale vectors.
    """
    index = get_index()
    index.delete(delete_all=True)
    log.info("All vectors cleared from index")
