import hashlib
import re
from pathlib import Path

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.rag.store import VectorIndex

RESUME = Path(__file__).resolve().parents[1] / "data" / "resume.pdf"
STOP = set("a an the of and or to in on for with what is are was were his he him does did which who where how has have it its".split())


class HashEmbedder:
    """Deterministic bag-of-words embedder: lets tests exercise real retrieval without network calls."""

    model = "test-hash-embedder"
    D = 4096
    idf: dict = {}

    @staticmethod
    def _words(text):
        return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 1]

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(self.D, dtype=np.float32)
        for w in self._words(text):
            v[int(hashlib.md5(w.encode()).hexdigest(), 16) % self.D] += HashEmbedder.idf.get(w, 2.5)
        n = np.linalg.norm(v)
        return v / n if n else v

    def embed_documents(self, items):
        docs = [set(self._words(t + " " + x)) for t, x in items]
        for w in set().union(*docs):
            HashEmbedder.idf[w] = float(np.log((1 + len(docs)) / (1 + sum(w in d for d in docs))) + 1)
        return np.vstack([self._vec(t + " " + x) for t, x in items])

    def embed_query(self, text):
        return self._vec(text)


class FakeGenerator:
    def __init__(self, reply="He studies at NED University of Engineering and Technology [S1]."):
        self.reply = reply
        self.calls = []

    def generate(self, system, contents):
        self.calls.append((system, contents))
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


@pytest.fixture(scope="session")
def index():
    return VectorIndex.build(RESUME, HashEmbedder())


def make_settings(**kw):
    base = dict(gemini_api_key="test-key", resend_api_key="re_test", recipient="muhammadhamzaalam2@gmail.com",
                from_address="HRZ Portfolio <onboarding@resend.dev>", embedding_model="test-hash-embedder")
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def make_client(index):
    def _make(resend_handler=None, generator=None, **settings_kw):
        app = create_app(make_settings(**settings_kw))
        app.state.rag.index = index
        app.state.rag.embedder = HashEmbedder()
        app.state.rag.generator = generator or FakeGenerator()
        if resend_handler:
            app.state.email_client = httpx.Client(transport=httpx.MockTransport(resend_handler))
        return TestClient(app), app
    return _make
