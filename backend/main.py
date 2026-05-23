import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import R2_ACCOUNT_ID, R2_BUCKET_NAME
from constants import LOG_ENTITIES
from logging_module.logger import get_logger, setup_logging
from routers import call_router, datasets_router, logs_router, sessions_router

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

app.include_router(call_router)
app.include_router(logs_router)
app.include_router(sessions_router)
app.include_router(datasets_router)
