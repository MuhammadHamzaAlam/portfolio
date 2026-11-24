"""Command line tools.

  python -m app.cli index            # (re)build the résumé vector index from RESUME_PDF_PATH
  python -m app.cli index --pdf X    # index a different PDF (copy it to backend/data/resume.pdf to keep it)
  python -m app.cli chunks           # show the section-aware chunks (no API calls)
  python -m app.cli models           # list Gemini models your key can use
  python -m app.cli ask "question"   # ask the chatbot from the terminal
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import get_settings


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("index")
    pi.add_argument("--pdf", type=Path)
    sub.add_parser("chunks")
    sub.add_parser("models")
    pa = sub.add_parser("ask")
    pa.add_argument("question")
    a = p.parse_args(argv)
    s = get_settings()

    if a.cmd == "chunks":
        from .rag.ingest import chunk_resume

        for c in chunk_resume(a.pdf if getattr(a, "pdf", None) else s.resume_pdf):
            print(f"[{c.id}] {c.section} / {c.title} (pages {c.pages})\n{c.text}\n")
        return 0

    if not s.gemini_configured:
        print("GEMINI_API_KEY is not set in the project .env file.", file=sys.stderr)
        return 2

    if a.cmd == "models":
        from google import genai

        client = genai.Client(api_key=s.gemini_api_key)
        for m in client.models.list():
            actions = getattr(m, "supported_actions", None) or []
            if any(x in actions for x in ("generateContent", "embedContent")):
                print(f"{m.name:55s} {','.join(actions)}")
        return 0

    if a.cmd == "index":
        from .rag.embeddings import GeminiEmbedder
        from .rag.store import VectorIndex

        pdf = a.pdf or s.resume_pdf
        if not pdf.exists():
            print(f"Résumé PDF not found: {pdf}", file=sys.stderr)
            return 1
        emb = GeminiEmbedder(s.gemini_api_key, s.embedding_model, s.embedding_dim)
        idx = VectorIndex.build(pdf, emb)
        idx.save(s.index_path)
        print(f"Indexed {idx.meta['count']} chunks from {pdf.name} with {s.embedding_model} "
              f"({idx.meta['dim']} dims) -> {s.index_path}")
        return 0

    if a.cmd == "ask":
        from .rag.chat import ChatRequest, GeminiGenerator, answer
        from .rag.embeddings import GeminiEmbedder
        from .rag.store import VectorIndex

        idx = VectorIndex.load(s.index_path)
        res = answer(ChatRequest(message=a.question), idx, GeminiEmbedder(s.gemini_api_key, s.embedding_model, s.embedding_dim),
                     GeminiGenerator(s.gemini_api_key, s.chat_model, s.chat_fallbacks), top_k=s.top_k)
        print(res.answer)
        for src in res.sources:
            print(f"  [{src['label']}] {src['section']} — {src['title']} (page {', '.join(map(str, src['pages']))})")
        return 0
    return 1


def run() -> int:
    try:
        return main()
    except Exception as exc:  # friendly message for API/auth/quota errors
        code = getattr(exc, "code", "")
        hint = {401: "check GEMINI_API_KEY in .env", 403: "the key lacks access to this model",
                404: "model not found — run `python -m app.cli models` and update GEMINI_*_MODEL in .env",
                429: "quota/rate limit reached — wait and retry"}.get(code, "")
        print(f"Error: {type(exc).__name__} {code} {str(exc)[:240]}" + (f"\nHint: {hint}" if hint else ""), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
