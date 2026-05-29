from enum import Enum


class PRERECORDED_AUDIO(Enum):
    """Fixed agent phrases that are cached as WAV files after first synthesis.

    Each member carries the exact text yielded by DialogueFlow so the cache
    lookup can match by string equality in _synthesise_sentence.
    """

    GREETING = (
        "greeting",
        "Hello! Thank you for calling Vaani. How can I assist you today?",
    )
    CAPTURE_ESCALATE = (
        "capture_escalate",
        "It seems I am not able to understand your query, let me connect you to a human agent for better assistance.",
    )
    DECISION_RESOLVED = (
        "decision_resolved",
        "Thankyou for confirming. Your query has been noted, we will look into it.",
    )
    DECISION_ESCALATE = (
        "decision_escalate",
        "Apologies, let me connect you to a human agent for assistance.",
    )

    def __init__(self, slug: str, text: str) -> None:
        self.slug = slug
        self.text = text

    @classmethod
    def from_text(cls, text: str) -> "PRERECORDED_AUDIO | None":
        for member in cls:
            if member.text == text:
                return member
        return None
