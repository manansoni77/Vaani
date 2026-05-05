import asyncio
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

import uuid
from audio_utils import R2_ACCOUNT_ID, R2_BUCKET_NAME
from constants import LOG_ENTITIES
# from llm_pipeline import ConversationState
from logger import get_logger, setup_logging
from logs_router import router as logs_router
from session import CallSession


_app_log = get_logger(LOG_ENTITIES.APP)


@asynccontextmanager
async def lifespan(_: FastAPI):
    print_logs = os.getenv("PRINT_LOGS", "1") not in ("0", "false", "no")
    setup_logging(print_logs=print_logs)
    _app_log.info("starting up")
    if R2_ACCOUNT_ID and R2_BUCKET_NAME:
        _app_log.info(f"R2 storage configured: bucket={R2_BUCKET_NAME}")
    else:
        _app_log.warning("R2 storage NOT configured — audio will be discarded")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(logs_router)


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
    await session.run()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)