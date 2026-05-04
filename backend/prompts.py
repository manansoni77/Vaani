from typing import Callable
from constants import PHASE, SemanticMemory

PromptTuple = tuple[str, str]


def greeting_prompt() -> PromptTuple:
    return (
        "You are a helpful assistant named Vaani. Greet the user and ask how you can assist them today.",
        "",
    )


def capture_prompt(input_text: str, semantic_memory: SemanticMemory) -> PromptTuple:
    return (
        "You are a helpful assistant named Vaani. Capture the user's request in detail. Ask follow-up questions if necessary to fully understand their needs. Keep the response short and human conversation like.",
        f"Current conversation summary: {semantic_memory.summary}\n\nUser: {input_text}",
    )


def validation_prompt(input_text: str, semantic_memory: SemanticMemory) -> PromptTuple:
    return (
        "You are a helpful assistant named Vaani. Validate the captured information with the user. Summarize their request and ask for confirmation in simple yes or no.",
        f"Current conversation summary: {semantic_memory.summary}\n\nIdentified Intent: {semantic_memory.intent}\n\nUser: {input_text}",
    )


def decision_prompt(input_text: str) -> PromptTuple:
    return (
        "You are a helpful assistant named Vaani. Based on the user's response of yes or no, if yes, acknowledge their task and reassure them that you will handle it. If no, tell them they will be connected to a human agent shortly.",
        f"User: {input_text}",
    )


PROMPTS: dict[PHASE, Callable[..., PromptTuple]] = {
    PHASE.GREETING: greeting_prompt,
    PHASE.CAPTURE: capture_prompt,
    PHASE.VALIDATION: validation_prompt,
    PHASE.DECISION: decision_prompt,
}
