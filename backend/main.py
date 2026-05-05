import asyncio
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

import uuid
from audio_utils import AUDIO_DIR
from constants import LOG_ENTITIES
# from llm_pipeline import ConversationState
from logger import get_logger, setup_logging
from logs_router import router as logs_router
from session import CallSession
from sessions_router import router as sessions_router


_app_log = get_logger(LOG_ENTITIES.APP)

os.makedirs(AUDIO_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    print_logs = os.getenv("PRINT_LOGS", "1") not in ("0", "false", "no")
    setup_logging(print_logs=print_logs)
    _app_log.info("starting up")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(logs_router)
app.include_router(sessions_router)


@app.websocket("/call")
async def call(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    # conversationState = ConversationState(call_id=session_id)
    loop = asyncio.get_running_loop()
    
    session = CallSession(
        session_id=session_id,
        websocket=websocket,
        loop=loop,
        session_start=loop.time(),
        # conversationState=conversationState
    )
    session._emit_status("session_started")
    try:
        await session.run()
    finally:
        session._emit_status("session_ended")
