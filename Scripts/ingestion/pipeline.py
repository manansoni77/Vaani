import argparse
import logging
from pathlib import Path

from .chunker import load_chunks
from .indexer import delete_all, upsert_chunks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")

# path to the JSONL produced by transform.py → save_knowledge_docs()
KNOWLEDGE_JSONL = Path(__file__).resolve().parents[2] / "Scripts/scrape/output/knowledge_docs.jsonl"


def run(reindex: bool = False) -> None:
    log.info("=== Vaani knowledge base pipeline ===")

    if not KNOWLEDGE_JSONL.exists():
        log.error(f"Input file not found: {KNOWLEDGE_JSONL}")
        log.error("Run the scraper first: python -m scripts.scrape.transform")
        exit(1)

    if reindex:
        log.info("--reindex flag set: clearing existing namespace")
        delete_all()

    log.info(f"Loading chunks from {KNOWLEDGE_JSONL}")
    chunks = load_chunks(KNOWLEDGE_JSONL)
    log.info(f"{len(chunks)} chunks ready to embed and upsert")

    upsert_chunks(chunks)

    log.info("=== Pipeline complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Vaani Pinecone index")
    parser.add_argument(
        "--reindex",
        action="store_true",
        help="Wipe the namespace before upserting (full rebuild)",
    )
    args = parser.parse_args()
    run(reindex=args.reindex)