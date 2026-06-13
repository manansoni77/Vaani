import logging
from typing import List

from openai import OpenAI
from pinecone import Pinecone

from config import (
    OPENAI_API_KEY,
    PINECONE_API_KEY,
    PINECONE_INDEX_NAME,
    EMBEDDING_MODEL,
    TOP_K,
    SCORE_THRESHOLD,
)

log = logging.getLogger(__name__)

_oa = None
_index = None


def get_openai_client() -> OpenAI:
    """
    Lazily initialize and reuse the OpenAI client.
    """
    global _oa

    if _oa is None:
        _oa = OpenAI(api_key=OPENAI_API_KEY)

    return _oa


def get_pinecone_index():
    """
    Lazily initialize and reuse the Pinecone index.
    """
    global _index

    if _index is None:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        _index = pc.Index(PINECONE_INDEX_NAME)

    return _index


def embed_query(text: str) -> List[float]:
    """
    Embed a query string using OpenAI.
    """
    response = get_openai_client().embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )

    return response.data[0].embedding


def retrieve(query: str, top_k: int | None = None) -> List[dict]:
    """
    Retrieve the most relevant government service documents.

    Returns metadata stored in Pinecone along with:
        score : similarity score
        id    : vector ID
    """

    if top_k is None:
        top_k = TOP_K

    query = query.strip()

    if not query:
        return []

    vector = embed_query(query)

    response = get_pinecone_index().query(
        vector=vector,
        top_k=top_k,
        include_metadata=True,
    )

    results = []

    for match in response.matches:

        if match.score < SCORE_THRESHOLD:
            continue

        metadata = dict(match.metadata or {})

        results.append(
            {
                **metadata,
                "score": round(match.score, 4),
                "id": match.id,
            }
        )

    log.info(
        "Retrieved %d documents for query '%s'",
        len(results),
        query,
    )

    return results


def format_context(docs: List[dict]) -> str:
    """
    Convert retrieved documents into a context block
    for LLM prompt injection.
    """

    if not docs:
        return ""

    lines = ["[Relevant Government Services]"]

    fields = [
        ("Procedure", "procedure_eng"),
        ("Eligibility", "eligibility_eng"),
        ("Required Documents", "documents_eng"),
        ("Contact Officer", "officer_eng"),
        ("Prescribed Information", "prescribed_eng"),
    ]

    for idx, doc in enumerate(docs, start=1):

        header = (
            f"{idx}. "
            f"{doc.get('scheme_eng', '')}"
            f" ({doc.get('service_eng', '')})"
            f" - {doc.get('department_eng', '')}"
        )

        lines.append(header)

        for label, key in fields:

            value = doc.get(key)

            if value:
                lines.append(f"{label}: {value}")

        lines.append("")

    return "\n".join(lines).strip()

