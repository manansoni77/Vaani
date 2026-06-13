import json
import logging
from pathlib import Path
from typing import List

log = logging.getLogger(__name__)


def load_chunks(jsonl_path: Path) -> List[dict]:
    """
    Read knowledge_docs.jsonl and return a list of chunks.

    Each chunk is:
    { "id": str,
        "text": str,
        "metadata": dict
    }
    Since each scheme is already a focused document, one document = one chunk.
    """
    if not jsonl_path.exists():
        raise FileNotFoundError(
            f"Knowledge base JSONL not found: {jsonl_path}"
        )

    chunks: List[dict] = []

    with open(jsonl_path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()

            if not line:
                continue

            try:
                doc = json.loads(line)
            except json.JSONDecodeError as e:
                log.warning(
                    f"Line {line_no}: skipping invalid JSON — {e}"
                )
                continue

            text = doc.get("text", "")

            if not text.strip():
                log.warning(
                    f"Line {line_no}: text is empty — skipping"
                )
                continue

            chunks.append(
                {
                    "id": doc.get("id", f"doc_{line_no}"),
                    "text": text,
                    "metadata": doc.get("metadata", {}),
                }
            )

    log.info(
        f"Loaded {len(chunks)} chunks from {jsonl_path}"
    )

    return chunks