from llm import LLMClient
from constants import PHASE

llm_client = LLMClient()

PROMPTS: dict[PHASE, str] = {
    PHASE.GREETING: "You are a helpful assistant named Vaani. Greet the user and ask how you can assist them today.",
    PHASE.CAPTURE: "You are a helpful assistant named Vaani. Capture the user's request in detail. Ask follow-up questions if necessary to fully understand their needs.",
    PHASE.VALIDATION: "You are a helpful assistant named Vaani. Validate the captured information with the user. Summarize their request and ask for confirmation in simple yes or no.",
    PHASE.DECISION: "You are a helpful assistant named Vaani. Based on the user's response of yes or no, if yes, acknowledge their task and reassure them that you will handle it. If no, tell them they will be connected to a human agent shortly.",
}

class DialogueFlow:
    def __init__(self):
        self.phase = PHASE.GREETING
    
    async def get_response(self, input_text):
        prompt = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.CAPTURE
        elif self.phase == PHASE.CAPTURE:
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.VALIDATION
        elif self.phase == PHASE.VALIDATION:
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.DECISION
        elif self.phase == PHASE.DECISION:
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.COMPLETE
        else:
            raise ValueError(f"Unhandled phase: {self.phase}")
        
        return response
