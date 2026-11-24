"""Persistent local vector index (a single JSON file) + cosine-similarity retrieval."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .embeddings import Embedder
from .ingest import Chunk, chunk_resume

PHONE_RE = re.compile(r"\+?\d[\d\s-]{8,}\d")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass
class Hit:
    chunk: dict
    score: float


class VectorIndex:
    def __init__(self, meta: dict, chunks: list[dict], vectors: np.ndarray):
        self.meta = meta
        self.chunks = chunks
        self.vectors = vectors  # (n, d), L2-normalised

    # ---------------------------------------------------------------- build / persist
    @classmethod
    def build(cls, pdf: Path, embedder: Embedder) -> "VectorIndex":
        chunks: list[Chunk] = chunk_resume(pdf)
        if os.getenv("RAG_INCLUDE_PHONE") != "1":
            for c in chunks:  # keep the phone number out of a public chatbot by default
                c.text = PHONE_RE.sub("[phone number omitted]", c.text)
        vectors = embedder.embed_documents([(f"{c.section} — {c.title}", c.text) for c in chunks])
        meta = {
            "source": pdf.name,
            "source_sha256": file_sha256(pdf),
            "embedding_model": embedder.model,
            "dim": int(vectors.shape[1]),
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "count": len(chunks),
        }
        return cls(meta, [c.to_dict() for c in chunks], vectors)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {"meta": self.meta, "chunks": self.chunks, "vectors": self.vectors.round(6).tolist()}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(path)

    @classmethod
    def load(cls, path: Path) -> "VectorIndex":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(data["meta"], data["chunks"], np.asarray(data["vectors"], dtype=np.float32))

    # ---------------------------------------------------------------- query
    def search(self, qvec: np.ndarray, k: int = 5) -> list[Hit]:
        scores = self.vectors @ qvec
        order = np.argsort(-scores)[:k]
        return [Hit(self.chunks[i], float(scores[i])) for i in order]
