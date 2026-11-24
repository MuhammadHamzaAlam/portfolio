"""Gemini embeddings (google-genai SDK).

gemini-embedding-2 does not accept task_type; the docs instead prescribe text prefixes:
  query:    "task: search result | query: {content}"
  document: "title: {title} | text: {content}"
It also aggregates a list of inputs into ONE vector, so each text is embedded in its own call.
gemini-embedding-001 (legacy) uses task_type and needs manual normalisation below 3072 dims.
"""
from __future__ import annotations

from typing import Protocol

import numpy as np


class Embedder(Protocol):
    model: str

    def embed_documents(self, items: list[tuple[str, str]]) -> np.ndarray: ...  # (title, text)

    def embed_query(self, text: str) -> np.ndarray: ...


def _normalise(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n == 0, 1, n)


class GeminiEmbedder:
    def __init__(self, api_key: str, model: str, dim: int = 768):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.dim = dim
        self.legacy = model.startswith(("gemini-embedding-001", "text-embedding"))

    def _embed(self, text: str, task: str) -> np.ndarray:
        from google.genai import types

        if self.legacy:
            cfg = types.EmbedContentConfig(task_type=task, output_dimensionality=self.dim)
        else:
            cfg = types.EmbedContentConfig(output_dimensionality=self.dim)
        res = self.client.models.embed_content(model=self.model, contents=text, config=cfg)
        return np.asarray(res.embeddings[0].values, dtype=np.float32)

    def embed_documents(self, items: list[tuple[str, str]]) -> np.ndarray:
        vecs = []
        for title, text in items:
            payload = text if self.legacy else f"title: {title or 'none'} | text: {text}"
            vecs.append(self._embed(payload, "RETRIEVAL_DOCUMENT"))
        return _normalise(np.vstack(vecs))

    def embed_query(self, text: str) -> np.ndarray:
        payload = text if self.legacy else f"task: search result | query: {text}"
        return _normalise(self._embed(payload, "RETRIEVAL_QUERY"))
