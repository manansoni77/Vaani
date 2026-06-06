from .auth import router as auth_router
from .call import router as call_router
from .datasets import router as datasets_router
from .departments import router as departments_router
from .logs import router as logs_router
from .sessions import router as sessions_router
from .tickets import router as tickets_router
from .users import router as users_router

__all__ = ["auth_router", "call_router", "datasets_router", "departments_router", "logs_router", "sessions_router", "tickets_router", "users_router"]
