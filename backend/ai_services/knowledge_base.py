import logging
import random
from typing import List

from .retrieval import retrieve

log = logging.getLogger(__name__)

_KB: dict[str, List[str]] = {
    "lpg": [
        "To get a new LPG connection, you need an Aadhaar card, a recent passport-size photo, and a proof of address such as a voter ID or utility bill.",
        "LPG cylinder delivery requests can be placed via the IVRS number 1800-233-3555 or through the official Indane, HP Gas, or Bharat Gas mobile apps.",
        "Subsidy on LPG cylinders is credited directly to your linked bank account under the PAHAL (DBTL) scheme within 7 working days of delivery.",
    ],
    "ration": [
        "To apply for a new ration card, visit your nearest Fair Price Shop or the District Supply Office with Aadhaar, income certificate, and a family photo.",
        "Existing ration cardholders can update family member details at the State Food Portal or at the block-level supply office.",
        "Under the National Food Security Act, eligible households receive 5 kg of grain per person per month at subsidized prices.",
    ],
    "water": [
        "For a new water connection, submit an application at the Jal Board office along with property tax receipt, Aadhaar, and a site plan.",
        "Water quality complaints can be registered at the State Pollution Control Board helpline or at the local municipal water department.",
        "Non-functional water connections can be reported to the 1916 Jal Jeevan Mission helpline, which operates 24x7.",
    ],
    "electricity": [
        "For a new electricity connection, apply at your local DISCOM office or on their website with Aadhaar, property documents, and a recent photo.",
        "Electricity bill disputes can be raised by calling the consumer helpline printed on the back of your bill or by visiting the nearest sub-division office.",
        "Outage complaints can be registered on the URJA Mitra app or by calling the DISCOM control room number for your area.",
    ],
    "pension": [
        "To apply for the Old Age Pension Scheme, visit the District Social Welfare Office with age proof (birth certificate or Aadhaar), bank passbook, and income certificate.",
        "Widow pension applications require the death certificate of the spouse, Aadhaar of the applicant, and a bank account in the applicant's name.",
        "Pension amounts and status can be checked on the National Social Assistance Programme portal at nsap.nic.in.",
    ],
    "scholarship": [
        "The National Scholarship Portal (scholarships.gov.in) lists all central and state scholarships. You will need a valid Aadhaar, bank account, and academic records to apply.",
        "For SC/ST scholarships, applications are submitted at the District Social Welfare Office or through the e-district portal of your state.",
        "Income certificates for scholarship applications are issued by the Tehsildar or Revenue Officer of your taluk.",
    ],
    "property": [
        "Property registration is done at the Sub-Registrar Office. Required documents include the sale deed, property tax receipt, Aadhaar of both buyer and seller, and two witnesses.",
        "Encumbrance certificates can be obtained from the Sub-Registrar Office or via the state's online property registration portal.",
        "Circle rates and stamp duty rates for property registration are published on the state's revenue or registration department website.",
    ],
    "hospital": [
        "Government hospitals under the Ayushman Bharat scheme offer free treatment up to 5 lakh rupees per year. Bring your Ayushman card or Aadhaar for admission.",
        "Referrals to district or state hospitals are issued by Primary Health Centre doctors and are required for free specialist care.",
        "PM Jan Arogya Yojana (PMJAY) beneficiaries can check empanelled hospitals on the mera.pmjay.gov.in website.",
    ],
    "default": [
        "For detailed information on this topic, please visit your nearest District Collectorate or call the state helpline.",
        "I was unable to find specific information on this query in our knowledge base. You may contact the relevant department directly for accurate guidance.",
    ],
}


def _keyword_match(query: str) -> List[str]:
    query_lower = query.lower()
    for keyword, entries in _KB.items():
        if keyword == "default":
            continue
        if keyword in query_lower:
            return entries
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
    Falls back to keyword matching if retrieval fails or returns no results.
    """
    log.info("Fetching KB results for query: '%s'", query)
    query = query.strip()
    if not query:
        return _KB["default"]

    try:
        docs = retrieve(query, 5)
        if docs:
            passages = [p for p in (_format_result_as_passage(doc) for doc in docs) if p]
            if passages:
                return passages
    except Exception:
        log.warning("KB retrieval failed, falling back to keyword matcher")

    results = _keyword_match(query)
    return results[:2] if len(results) <= 2 else random.sample(results, 2)
