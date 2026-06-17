import html
import re

_ARROW_RE = re.compile(r"[→=>➤►]+")
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")

_NOT_APPLICABLE = {
    "not applicable",
    "not applicable.",
    "na",
    "n/a",
    "ಅನ್ವಯಿಸುವುದಿಲ್ಲ",
}


def clean_text(value) -> str:
    if not isinstance(value, str):
        return ""
    text = html.unescape(value)
    text = _TAG_RE.sub(" ", text)
    text = _ARROW_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    normalized = text.lower().strip()
    if normalized in _NOT_APPLICABLE:
        return ""

    return text

def clean_record(record: dict) -> dict:
    return {k: clean_text(v) if isinstance(v, str) else v for k, v in record.items()}
