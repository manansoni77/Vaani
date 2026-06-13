import logging
import os
from typing import List

from openai import APIConnectionError, DefaultHttpxClient, OpenAI
from backend.config import OPENAI_API_KEY, EMBEDDING_MODEL



log = logging.getLogger(__name__)

_client = None
_client_verify = None


def _resolve_ca_bundle():
    try:
        import certifi

        return certifi.where()
    except Exception:  # pragma: no cover
        return None


def _has_cert_verify_failed(err: BaseException) -> bool:
    needle = "CERTIFICATE_VERIFY_FAILED"
    seen = set()
    cur: BaseException | None = err

    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if needle in str(cur):
            return True
        cur = cur.__cause__ or cur.__context__

    return False


def get_client(*, verify):
    global _client
    global _client_verify

    if _client is None or _client_verify != verify:
        _client = OpenAI(
            api_key=OPENAI_API_KEY,
            http_client=DefaultHttpxClient(
                trust_env=False,
                verify=verify,
            ),
        )
        _client_verify = verify

    return _client


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of strings. Returns a list of float vectors in the same order.

    Batches automatically — safe to pass thousands of texts at once.
    """
    if not texts:
        return []

    # OpenAI allows up to 2048 inputs per call; we batch at 512 to stay safe
    batch_size = 512
    vectors: List[List[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        log.info(f"Embedding batch {i // batch_size + 1} ({len(batch)} texts)")
        force_insecure_ssl = os.getenv("OPENAI_INSECURE_SSL", "0") not in ("0", "false", "no")
        ca_bundle = _resolve_ca_bundle()
        verify = False if force_insecure_ssl else (ca_bundle or True)

        try:
            response = get_client(verify=verify).embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
            )
        except APIConnectionError as e:
            if force_insecure_ssl or not _has_cert_verify_failed(e):
                raise

            log.warning(
                "OpenAI SSL verification failed; retrying with verify=False. "
                "Set OPENAI_INSECURE_SSL=1 to force this explicitly, or fix local CA certs."
            )
            response = get_client(verify=False).embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
            )

        # response.data is ordered to match input
        vectors.extend([item.embedding for item in response.data])

    return vectors


def embed_query(text: str) -> List[float]:
    """
    Embed a single query string.
    Separate function so query-time code is explicit.
    """
    force_insecure_ssl = os.getenv("OPENAI_INSECURE_SSL", "0") not in ("0", "false", "no")
    ca_bundle = _resolve_ca_bundle()
    verify = False if force_insecure_ssl else (ca_bundle or True)

    try:
        response = get_client(verify=verify).embeddings.create(
            model=EMBEDDING_MODEL,
            input=[text],
        )
    except APIConnectionError as e:
        if force_insecure_ssl or not _has_cert_verify_failed(e):
            raise
        response = get_client(verify=False).embeddings.create(
            model=EMBEDDING_MODEL,
            input=[text],
        )
    return response.data[0].embedding
