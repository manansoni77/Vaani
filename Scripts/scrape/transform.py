import json
from pathlib import Path

from clean import clean_record

_FIELD_MAP = {
    "dept_id": "dept_id",
    "line_dept_service_id": "service_id",
    "scheme_id": "scheme_id",
    "dk_deptName_eng": "department_eng",
    "dk_deptName_kan": "department_kan",
    "sk_serviceName_eng": "service_eng",
    "sk_serviceName_kan": "service_kan",
    "sk_schemeName_eng": "scheme_eng",
    "sk_schemeName_kan": "scheme_kan",
    "kd_Procedure_eng": "procedure_eng",
    "kd_Procedure_kan": "procedure_kan",
    "kd_Eligibility_eng": "eligibility_eng",
    "kd_Eligibility_kan": "eligibility_kan",
    "kd_Document_eng": "documents_eng",
    "kd_Document_kan": "documents_kan",
    "kd_officer_eng": "officer_eng",
    "kd_officer_kan": "officer_kan",
    "kd_Prescribed_eng": "prescribed_eng",
    "kd_Prescribed_kan": "prescribed_kan",
    "dk_is_active": "dept_active",
    "sk_is_active": "service_active",
}
_INT_FIELDS = {"dept_id", "service_id", "scheme_id"}


def to_canonical(raw: dict) -> dict:
    cleaned = clean_record(raw)

    doc = {}

    for src, dst in _FIELD_MAP.items():
        val = cleaned.get(src, "")

        if dst in _INT_FIELDS:
            doc[dst] = raw.get(src)
        else:
            doc[dst] = val if val else ""

    # Stable document ID
    doc["id"] = (
        f"{doc.get('dept_id')}_"
        f"{doc.get('service_id')}_"
        f"{doc.get('scheme_id')}"
    )

    return doc


def to_nl_text(doc: dict) -> str:
    parts = []

    if doc.get("department_eng"):
        parts.append(f"Department: {doc['department_eng']}")

    if doc.get("service_eng"):
        parts.append(f"Service: {doc['service_eng']}")

    if doc.get("scheme_eng"):
        parts.append(f"Scheme: {doc['scheme_eng']}")

    if doc.get("procedure_eng"):
        parts.append(f"Procedure: {doc['procedure_eng']}")

    if doc.get("eligibility_eng"):
        parts.append(f"Eligibility: {doc['eligibility_eng']}")

    if doc.get("documents_eng"):
        parts.append(f"Required Documents: {doc['documents_eng']}")

    if doc.get("officer_eng"):
        parts.append(f"Contact Officer: {doc['officer_eng']}")

    if doc.get("prescribed_eng"):
        parts.append(
            f"Prescribed Information: {doc['prescribed_eng']}"
        )

    return "\n".join(parts)


def add_metadata(doc: dict) -> None:
    doc["metadata"] = {
        # IDs
        "dept_id": doc.get("dept_id"),
        "service_id": doc.get("service_id"),
        "scheme_id": doc.get("scheme_id"),
        # English
        "department_eng": doc.get("department_eng"),
        "service_eng": doc.get("service_eng"),
        "scheme_eng": doc.get("scheme_eng"),
        "procedure_eng": doc.get("procedure_eng"),
        "eligibility_eng": doc.get("eligibility_eng"),
        "documents_eng": doc.get("documents_eng"),
        "officer_eng": doc.get("officer_eng"),
        "prescribed_eng": doc.get("prescribed_eng"),
        # Kannada
        "department_kan": doc.get("department_kan"),
        "service_kan": doc.get("service_kan"),
        "scheme_kan": doc.get("scheme_kan"),
        "procedure_kan": doc.get("procedure_kan"),
        "eligibility_kan": doc.get("eligibility_kan"),
        "documents_kan": doc.get("documents_kan"),
        "officer_kan": doc.get("officer_kan"),
        "prescribed_kan": doc.get("prescribed_kan"),

        # Full context
        "text": doc.get("text", ""),
    }


def save_knowledge_docs(records: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
