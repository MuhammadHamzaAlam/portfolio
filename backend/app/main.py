"""HRZ portfolio backend: contact email + résumé RAG chatbot.

Endpoints:  GET /api/health · POST /api/contact · POST /api/chat
In production it also serves the built frontend from ../dist.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .email_service import (ContactRequest, EmailDeliveryError, EmailNotConfigured, SpamRejected, send_contact_email,
                            spam_check)
from .rag.chat import ASSISTANT_NAME, ChatRequest, GeminiGenerator, answer
from .rag.embeddings import GeminiEmbedder
from .rag.store import VectorIndex, file_sha256
from .security import BodySizeLimitMiddleware, RateLimiter, client_ip

log = logging.getLogger("hrz")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class RagState:
    """Lazily-created Gemini clients + loaded index (tests inject fakes here)."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.index: VectorIndex | None = None
        self.embedder = None
        self.generator = None
        self.load_error: str | None = None

    def ensure(self) -> None:
        s = self.settings
        if self.index is None:
            if not s.index_path.exists():
                self.load_error = "Résumé index not built. Run: python -m app.cli index"
                return
            self.index = VectorIndex.load(s.index_path)
            if self.index.meta.get("embedding_model") != s.embedding_model:
                self.load_error = (f"Index was built with {self.index.meta.get('embedding_model')} but "
                                   f"GEMINI_EMBEDDING_MODEL={s.embedding_model}. Re-run: python -m app.cli index")
                self.index = None
                return
            self.load_error = None
        if self.embedder is None and s.gemini_configured:
            self.embedder = GeminiEmbedder(s.gemini_api_key, s.embedding_model, s.embedding_dim)
        if self.generator is None and s.gemini_configured:
            self.generator = GeminiGenerator(s.gemini_api_key, s.chat_model, s.chat_fallbacks)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="HRZ Portfolio API", docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.state.rag = RagState(settings)
    app.state.contact_limiter = RateLimiter(limit=3, window_seconds=600)  # 3 messages / 10 min / IP
    app.state.chat_limiter = RateLimiter(limit=20, window_seconds=60)  # 20 questions / min / IP
    app.state.email_client = None  # tests inject an httpx.Client with a mock transport

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=32_000)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = {}
        for e in exc.errors():
            loc = [str(x) for x in e.get("loc", []) if x != "body"]
            fields[".".join(loc) or "request"] = e.get("msg", "invalid")
        return JSONResponse({"ok": False, "error": "Please check the highlighted fields.", "fields": fields}, status_code=422)

    # ------------------------------------------------------------------ health
    @app.get("/api/health")
    def health():
        rag: RagState = app.state.rag
        try:
            rag.ensure()
        except Exception as exc:  # corrupt index etc.
            rag.load_error = f"index load failed: {type(exc).__name__}"
        idx = rag.index
        stale = bool(idx and settings.resume_pdf.exists() and idx.meta.get("source_sha256") != file_sha256(settings.resume_pdf))
        return {
            "status": "ok",
            "email": {"configured": settings.email_configured, "provider": "resend", "recipient_set": bool(settings.recipient)},
            "chat": {
                "assistant": ASSISTANT_NAME,
                "gemini_configured": settings.gemini_configured,
                "chat_model": settings.chat_model,
                "embedding_model": settings.embedding_model,
                "index_loaded": idx is not None,
                "chunks": idx.meta.get("count") if idx else 0,
                "index_stale": stale,
                "problem": rag.load_error,
            },
        }

    # ------------------------------------------------------------------ contact
    @app.post("/api/contact")
    def contact(body: ContactRequest, request: Request):
        ip = client_ip(request)
        ok, retry = app.state.contact_limiter.allow(ip)
        if not ok:
            return JSONResponse({"ok": False, "error": f"Too many messages. Please try again in {retry // 60 + 1} minutes."},
                                status_code=429, headers={"Retry-After": str(retry)})
        try:
            spam_check(body)
        except SpamRejected as exc:
            log.warning("contact rejected as spam (%s) from %s", exc, ip)
            return JSONResponse({"ok": False, "error": "Your message could not be accepted. Please email directly."}, status_code=400)
        try:
            sent = send_contact_email(body, settings, client=app.state.email_client)
        except EmailNotConfigured:
            log.error("contact: email provider not configured (RESEND_API_KEY missing)")
            return JSONResponse({"ok": False, "error": "Email delivery is not configured yet. Please email directly."}, status_code=503)
        except EmailDeliveryError as exc:
            log.error("contact: delivery failed: %s", exc)
            return JSONResponse({"ok": False, "error": "The message could not be sent right now. Please try again or email directly."},
                                status_code=502)
        log.info("contact: delivered via %s id=%s", sent.provider, sent.id)
        return {"ok": True, "id": sent.id}

    # ------------------------------------------------------------------ chat
    @app.post("/api/chat")
    def chat(body: ChatRequest, request: Request):
        ok, retry = app.state.chat_limiter.allow(client_ip(request))
        if not ok:
            return JSONResponse({"ok": False, "error": "Too many questions at once. Please wait a moment."}, status_code=429,
                                headers={"Retry-After": str(retry)})
        rag: RagState = app.state.rag
        if not settings.gemini_configured and rag.generator is None:
            return JSONResponse({"ok": False, "error": "The assistant is not configured yet (missing Gemini API key)."}, status_code=503)
        try:
            rag.ensure()
        except Exception as exc:
            log.exception("chat: init failed")
            return JSONResponse({"ok": False, "error": "The assistant is unavailable right now."}, status_code=503)
        if rag.index is None:
            log.error("chat: %s", rag.load_error)
            return JSONResponse({"ok": False, "error": "The assistant's knowledge index is not ready yet."}, status_code=503)
        try:
            result = answer(body, rag.index, rag.embedder, rag.generator, top_k=settings.top_k)
        except Exception as exc:
            log.error("chat: Gemini request failed: %s: %s", type(exc).__name__, str(exc)[:300])
            status = getattr(exc, "code", None)
            msg = "The assistant is busy right now. Please try again shortly." if status in (429, 503) else \
                  "The assistant could not answer right now. Please try again."
            return JSONResponse({"ok": False, "error": msg}, status_code=502)
        used = getattr(rag.generator, "last_model_used", None)
        if used and used != settings.chat_model:
            log.info("chat: answered with fallback model %s", used)
        return {"ok": True, "assistant": ASSISTANT_NAME, "answer": result.answer, "sources": result.sources}

    # ------------------------------------------------------------------ built frontend (production)
    dist: Path = settings.frontend_dist
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
        for sub in ("models", "fonts"):
            if (dist / sub).exists():
                app.mount(f"/{sub}", StaticFiles(directory=dist / sub), name=sub)

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
            f = (dist / path).resolve()
            if path and f.is_file() and dist.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
