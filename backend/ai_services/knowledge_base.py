import logging
from typing import List

from services.retrieval import retrieve

log = logging.getLogger(__name__)

_KB: dict[str, List[str]] = {
    "default": [
        "For detailed information on this topic, please visit your nearest District Collectorate or call the state helpline.",
        "I was unable to find specific information on this query in our knowledge base. You may contact the relevant department directly for accurate guidance.",
    ],
}


def _fallback_kb_results(query: str) -> List[str]:
    query_lower = query.lower()

    if "lpg" in query_lower or "cylinder" in query_lower or "gas" in query_lower:
        return [
            "To get a new LPG connection, you need an Aadhaar card, a recent passport-size photo, and a proof of address such as a voter ID or utility bill.",
            "LPG cylinder delivery requests can be placed via the IVRS number 1800-233-3555 or through the official Indane, HP Gas, or Bharat Gas mobile apps.",
        ]

    if "ration" in query_lower or "food" in query_lower:
        return [
            "To apply for a new ration card, visit your nearest Fair Price Shop or the District Supply Office with Aadhaar, income certificate, and a family photo.",
            "Under the National Food Security Act, eligible households receive 5 kg of grain per person per month at subsidized prices.",
        ]

    if "water" in query_lower or "jal" in query_lower:
        return [
            "For a new water connection, submit an application at the Jal Board office along with property tax receipt, Aadhaar, and a site plan.",
            "Water quality complaints can be registered at the State Pollution Control Board helpline or at the local municipal water department.",
        ]

    if "electricity" in query_lower or "bill" in query_lower or "power" in query_lower:
        return [
            "For a new electricity connection, apply at your local DISCOM office or on their website with Aadhaar, property documents, and a recent photo.",
            "Outage complaints can be registered on the URJA Mitra app or by calling the DISCOM control room number for your area.",
        ]

    if "pension" in query_lower:
        return [
            "To apply for the Old Age Pension Scheme, visit the District Social Welfare Office with age proof (birth certificate or Aadhaar), bank passbook, and income certificate.",
            "Widow pension applications require the death certificate of the spouse, Aadhaar of the applicant, and a bank account in the applicant's name.",
        ]

    return _KB["default"]


def _format_result_as_passage(result: dict) -> str:
    if not result:
        return ""

    lines = []

    title = []
    if result.get("scheme_eng"):
        title.append(result["scheme_eng"])
    if result.get("service_eng"):
        title.append(result["service_eng"])
    if result.get("department_eng"):
        title.append(result["department_eng"])

    if title:
        lines.append(" - ".join(title))

    for label, key in [
        ("Procedure", "procedure_eng"),
        ("Eligibility", "eligibility_eng"),
        ("Required Documents", "documents_eng"),
        ("Contact Officer", "officer_eng"),
        ("Prescribed Information", "prescribed_eng"),
    ]:
        value = result.get(key)
        if value:
            lines.append(f"{label}: {value}")

    if not lines:
        metadata_text = ", ".join(
            f"{k}={v}" for k, v in result.items() if k not in {"score", "id"} and isinstance(v, str)
        )
        return metadata_text or ""

    return "\n".join(lines)


async def fetch_kb_results(query: str) -> List[str]:
    """
    Retrieve knowledge base passages using the production retrieval service.
    """
    query = query.strip()
    if not query:
        return _KB["default"]

    try:
        docs = retrieve(query)
    except Exception:  # pragma: no cover
        log.exception("KB retrieval failed, falling back to keyword matcher")
        return _fallback_kb_results(query)

    if not docs:
        return _fallback_kb_results(query)

    passages = [p for p in (_format_result_as_passage(doc) for doc in docs) if p]
    if passages:
        return passages[:2]

    return _fallback_kb_results(query)
