import argparse
import json
from pathlib import Path

import requests
import urllib3
from .department import DEPARTMENT_IDS
from .transform import add_metadata, save_knowledge_docs, to_canonical, to_nl_text

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://ipgrs.karnataka.gov.in/knowlegde"
SERVICELIST_URL = f"{BASE_URL}/GetServicelist"
SERVICE_SCHEME_URL = f"{BASE_URL}/GetServiceScheme"
REPORT_URL = f"{BASE_URL}/KnowledgebasedReportList"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
}


def _make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(_HEADERS)
    return session


def fetch_json(session: requests.Session, method: str, url: str, params=None, data=None, timeout: int = 20):
    if method.lower() == "get":
        response = session.get(url, params=params, timeout=timeout, verify=False)
    elif method.lower() == "post":
        response = session.post(url, data=data, timeout=timeout, verify=False)
    else:
        raise ValueError(f"Unsupported method: {method}")
    response.raise_for_status()
    return response.json()


def fetch_services(session: requests.Session, dept_id: int) -> list[dict]:
    result = fetch_json(session, "get", SERVICELIST_URL, params={"dept": dept_id})
    if not isinstance(result, list):
        raise RuntimeError(f"Expected list for services (dept {dept_id}), got {type(result)}")
    return result


def fetch_schemes(session: requests.Session, dept_id: int, service_id: int) -> list[dict]:
    result = fetch_json(
        session, "get", SERVICE_SCHEME_URL, params={"dept": dept_id, "line_dept": service_id}
    )
    if not isinstance(result, list):
        raise RuntimeError(f"Expected list for schemes (service {service_id}), got {type(result)}")
    return result


def fetch_details(session: requests.Session, dept_id: int, service_id: int, scheme_id: int) -> list[dict]:
    result = fetch_json(
        session, "post", REPORT_URL, data={"dept": dept_id, "service": service_id, "scheme": scheme_id}
    )
    if result is None:
        return []
    if isinstance(result, dict):
        return [result]
    if isinstance(result, list):
        return result
    raise RuntimeError(f"Unexpected detail response type: {type(result)}")


def save_raw(dept_id: int, data: dict, output_dir: Path) -> None:
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"dept_{dept_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Raw data saved to {path}")


def build_knowledge_base(dept_ids: list[int], output_dir: Path) -> list[dict]:
    session = _make_session()
    raw_records = []

    for dept_id in dept_ids:
        print(f"Fetching dept {dept_id}...")
        services = fetch_services(session, dept_id)
        dept_raw = {"dept_id": dept_id, "services": []}

        for service in services:
            service_id = service.get("sk_serviceId")
            if service_id is None:
                raise RuntimeError(f"Missing service id in service record: {service}")
            if not isinstance(service_id, int):
                try:
                    service_id = int(service_id)
                except (TypeError, ValueError):
                    raise RuntimeError(f"Invalid service id value: {service_id!r}")

            service_name_eng = service.get("sk_serviceName_eng", "")
            service_name_kan = service.get("sk_serviceName_kan", "")
            print(f"  Service {service_id}: {service_name_eng}")

            schemes = fetch_schemes(session, dept_id, service_id)
            service_raw = {"service": service, "schemes": []}

            for scheme in schemes:
                scheme_id = scheme.get("sk_schemeId")
                if scheme_id is None:
                    raise RuntimeError(f"Missing scheme id in scheme record: {scheme}")
                if not isinstance(scheme_id, int):
                    try:
                        scheme_id = int(scheme_id)
                    except (TypeError, ValueError):
                        raise RuntimeError(f"Invalid scheme id value: {scheme_id!r}")

                scheme_name_eng = scheme.get("sk_schemeName_eng", "")
                scheme_name_kan = scheme.get("sk_schemeName_kan", "")
                print(f"    Scheme {scheme_id}: {scheme_name_eng}")

                details = fetch_details(session, dept_id, service_id, scheme_id)
                service_raw["schemes"].append({"scheme": scheme, "details": details})

                base = {
                    "dept_id": dept_id,
                    "line_dept_service_id": service_id,
                    "line_dept_service_name_eng": service_name_eng,
                    "line_dept_service_name_kan": service_name_kan,
                    "scheme_id": scheme_id,
                    "scheme_name_eng": scheme_name_eng,
                    "scheme_name_kan": scheme_name_kan,
                }

                if not details:
                    raw_records.append(base)
                else:
                    for detail in details:
                        row = {**base}
                        if isinstance(detail, dict):
                            row.update(detail)
                        raw_records.append(row)

            dept_raw["services"].append(service_raw)

        save_raw(dept_id, dept_raw, output_dir)

    return raw_records


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Karnataka IPGRS knowledge base data")
    parser.add_argument(
        "dept_ids",
        nargs="*",
        type=int,
        default=DEPARTMENT_IDS,
        help="Department IDs to scrape",
    )
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Directory for all output files",
    )
    args = parser.parse_args()
    output_dir = Path(args.output_dir)

    raw_records = build_knowledge_base(args.dept_ids, output_dir)
    print(f"\nFetched {len(raw_records)} raw records across {len(args.dept_ids)} department(s)")

    docs = []
    for record in raw_records:
        canonical = to_canonical(record)
        canonical["text"] = to_nl_text(canonical)
        add_metadata(canonical)
        docs.append(canonical)

    output_path = output_dir / "knowledge_docs.jsonl"
    save_knowledge_docs(docs, output_path)
    print(f"Saved {len(docs)} knowledge docs to {output_path}")


if __name__ == "__main__":
    main()
