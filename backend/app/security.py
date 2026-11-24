"""Small, dependency-free protections: in-memory rate limiting and request-size limiting."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimiter:
    """Sliding-window limiter keyed by client id (IP). Fine for a single-process prototype."""

    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry = int(self.window - (now - q[0])) + 1
                return False, retry
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    # Behind a trusted reverse proxy, set TRUST_PROXY=1 to use X-Forwarded-For.
    import os

    if os.getenv("TRUST_PROXY") == "1":
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejects API requests whose declared or actual body exceeds max_bytes."""

    def __init__(self, app, max_bytes: int = 32_000):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH"):
            declared = request.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > self.max_bytes:
                return JSONResponse({"ok": False, "error": "Request is too large."}, status_code=413)
            body = await request.body()
            if len(body) > self.max_bytes:
                return JSONResponse({"ok": False, "error": "Request is too large."}, status_code=413)
        return await call_next(request)
