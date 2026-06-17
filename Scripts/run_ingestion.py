import argparse

from ingestion.pipeline import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Vaani Pinecone index")
    parser.add_argument(
        "--reindex",
        action="store_true",
        help="Wipe the namespace before upserting (full rebuild)",
    )
    args = parser.parse_args()
    run(reindex=args.reindex)
