from dataclasses import dataclass, field
from typing import List


@dataclass
class DepartmentInfo:
    name: str
    description: str
    keywords: List[str]
    example_queries: List[str]
    phones: List[str]       # spoken as "dial X" or "call X"
    email: str | None = None
    address: str | None = None
    working_hours: str | None = None
    # When True: Vaani immediately redirects the caller during CAPTURE and does
    # not process the query itself. The caller is told to contact this dept directly.
    redirect_on_match: bool = False


DEPARTMENTS: List[DepartmentInfo] = [
    DepartmentInfo(
        name="Police & Emergency Services",
        description="Handles law enforcement, fire emergencies, medical emergencies, and all urgent safety situations.",
        keywords=[
            "police", "emergency", "fire", "ambulance", "crime", "accident",
            "robbery", "theft", "assault", "missing", "danger", "attack",
            "fire brigade", "fire station", "100", "101", "102", "112",
        ],
        example_queries=[
            "I need police help",
            "There is a fire in my building",
            "Someone is injured in a road accident",
            "I want to report a theft",
            "I need an ambulance urgently",
            "There is a missing child",
        ],
        phones=["100 for Police", "101 for Fire Brigade", "102 for Ambulance", "112 for all emergencies"],
        working_hours="24x7",
        redirect_on_match=True,
    ),
    DepartmentInfo(
        name="COVID-19 Helpline",
        description="Handles COVID-19 related queries including vaccination, quarantine guidelines, test results, and health advice.",
        keywords=[
            "covid", "covid19", "covid-19", "coronavirus", "corona",
            "vaccination", "vaccine", "booster", "quarantine", "isolat",
            "positive test", "pcr", "rt-pcr", "antigen", "oximeter",
            "oxygen", "cowin", "aarogya setu",
        ],
        example_queries=[
            "How do I book a COVID vaccine appointment?",
            "I tested positive for COVID, what should I do?",
            "What are the quarantine guidelines?",
            "Where can I get a free COVID test?",
            "My CoWIN certificate is not generated",
        ],
        phones=["1075 (National COVID-19 Helpline)", "011-23978046"],
        email="ncov2019@gov.in",
        working_hours="24x7",
        redirect_on_match=True,
    ),
]


def match_department(query: str) -> DepartmentInfo | None:
    """
    Keyword-based department matching against the combined query string.
    Returns the first matching department, or None if no match.

    Replace with embedding similarity when a real vector store is available.
    """
    query_lower = query.lower()
    for dept in DEPARTMENTS:
        if any(kw in query_lower for kw in dept.keywords):
            return dept
    return None


def match_redirect_department(query: str) -> DepartmentInfo | None:
    """
    Like match_department but restricted to departments with redirect_on_match=True.
    Used during CAPTURE to immediately redirect callers to external departments
    that Vaani does not process internally.
    """
    query_lower = query.lower()
    for dept in DEPARTMENTS:
        if dept.redirect_on_match and any(kw in query_lower for kw in dept.keywords):
            return dept
    return None


def format_department_contact(dept: DepartmentInfo, language: str = "en-IN") -> str:
    """Returns a spoken contact-info string for the matched department."""
    phone_list = ", ".join(dept.phones)

    templates = {
        "en-IN": (
            f"This query relates to {dept.name}. "
            f"You can reach them directly by calling {phone_list}."
            + (f" They are available {dept.working_hours}." if dept.working_hours else "")
        ),
        "hi-IN": (
            f"यह मामला {dept.name} से संबंधित है। "
            f"आप उनसे सीधे {phone_list} पर संपर्क कर सकते हैं।"
            + (f" वे {dept.working_hours} उपलब्ध हैं।" if dept.working_hours else "")
        ),
        "kn-IN": (
            f"ಈ ವಿಷಯ {dept.name} ಗೆ ಸಂಬಂಧಿಸಿದೆ. "
            f"ನೀವು ನೇರವಾಗಿ {phone_list} ಗೆ ಕರೆ ಮಾಡಿ ಅವರನ್ನು ಸಂಪರ್ಕಿಸಬಹುದು।"
            + (f" ಅವರು {dept.working_hours} ಲಭ್ಯರಿದ್ದಾರೆ।" if dept.working_hours else "")
        ),
    }
    return templates.get(language, templates["en-IN"])
