import time
import logging
import urllib3
import os

from pinecone import Pinecone, ServerlessSpec
from backend.config import PINECONE_API_KEY, PINECONE_INDEX_NAME, PINECONE_REGION, EMBEDDING_DIM

try:
    import certifi
except Exception:  # pragma: no cover
    certifi = None

_FORCE_INSECURE_SSL = os.getenv("PINECONE_INSECURE_SSL", "0") not in ("0", "false", "no")

if _FORCE_INSECURE_SSL:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

log = logging.getLogger(__name__)

_index = None


def get_index():
    """
    Connect to Pinecone and return a ready Index object.

    Creates the index if it does not exist yet.
    Blocks until the index is ready (Pinecone initialisation takes ~30s on first run).
    """
    global _index

    if _index is not None:
        return _index

    if not PINECONE_API_KEY:
        raise EnvironmentError("PINECONE_API_KEY is not set.")

    ssl_ca_certs = certifi.where() if certifi is not None else None

    def _make_pc(ssl_verify: bool) -> Pinecone:
        return Pinecone(
            api_key=PINECONE_API_KEY,
            ssl_verify=ssl_verify,
            ssl_ca_certs=ssl_ca_certs,
        )

    if _FORCE_INSECURE_SSL:
        pc = _make_pc(ssl_verify=False)
    else:
        try:
            pc = _make_pc(ssl_verify=True)
            pc.list_indexes()
        except Exception as e:  # pragma: no cover
            if "CERTIFICATE_VERIFY_FAILED" not in str(e):
                raise
            log.warning(
                "Pinecone SSL verification failed; falling back to ssl_verify=False. "
                "Set PINECONE_INSECURE_SSL=1 to force this explicitly, or fix local CA certs."
            )
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            pc = _make_pc(ssl_verify=False)

    existing = [i.name for i in pc.list_indexes()]

    if PINECONE_INDEX_NAME not in existing:
        log.info(f"Index '{PINECONE_INDEX_NAME}' not found — creating.")
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region=PINECONE_REGION,
            ),
        )
        # wait until ready
        while not pc.describe_index(PINECONE_INDEX_NAME).status["ready"]:
            log.info("Waiting for index to be ready...")
            time.sleep(3)

        log.info(f"Index '{PINECONE_INDEX_NAME}' created and ready.")
    else:
        log.info(f"Index '{PINECONE_INDEX_NAME}' already exists.")

    _index = pc.Index(PINECONE_INDEX_NAME)
    return _index
