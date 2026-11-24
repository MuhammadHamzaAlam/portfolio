from app.rag.ingest import chunk_resume
from app.rag.chat import ChatRequest, Turn, retrieval_query

from .conftest import RESUME, HashEmbedder


def test_section_aware_chunks_cover_every_section():
    chunks = chunk_resume(RESUME)
    sections = {c.section for c in chunks}
    assert {"Professional Summary", "Education", "Experience", "Projects", "Technical Skills", "Certifications"} <= sections
    titles = " ".join(c.title for c in chunks)
    for project in ["TerraTrace AI", "RAG Document QA", "VoxAI", "NexoRa", "Data Engineering Pipelines"]:
        assert project in titles
    assert len([c for c in chunks if c.section == "Experience"]) == 2
    assert all(c.pages and c.source == "resume.pdf" for c in chunks)


def test_pdf_spacing_artifacts_are_repaired():
    text = " ".join(c.text for c in chunk_resume(RESUME))
    assert "Qwen3-4B" in text and "Scikit-learn" in text and "128-image" in text


def test_real_pdf_links_attached_to_certifications():
    cert = next(c for c in chunk_resume(RESUME) if c.section == "Certifications")
    assert len(cert.links) == 6
    assert "coursera.org/account/accomplishments/specialization/SYKY1UUPNW98" in cert.text
    assert "RgJSahZbumZRcuEoF" in cert.text and "theforage.com" in cert.text


def test_phone_number_is_not_indexed_by_default(index):
    blob = " ".join(c["text"] for c in index.chunks)
    assert "8408017" not in blob and "[phone number omitted]" in blob
    assert "muhammadhamzaalam2@gmail.com" in blob


def test_index_roundtrip(tmp_path, index):
    from app.rag.store import VectorIndex

    p = tmp_path / "idx.json"
    index.save(p)
    again = VectorIndex.load(p)
    assert again.meta["count"] == index.meta["count"] == len(again.chunks)
    assert again.vectors.shape == index.vectors.shape


def _top(index, q):
    return index.search(HashEmbedder().embed_query(q), k=1)[0].chunk


def test_retrieval_finds_the_right_chunk(index):
    assert _top(index, "What university does he attend?")["section"] == "Education"
    assert "VoxAI" in _top(index, "What technologies did he use for VoxAI?")["title"]
    assert "NexoRa" in _top(index, "What is NexoRa?")["title"]
    assert "TerraTrace" in _top(index, "Explain TerraTrace AI")["title"]
    assert _top(index, "Which certifications has he earned?")["section"] == "Certifications"
    assert "Skyline" in _top(index, "Where did he do his data analyst internship?")["title"]


def test_follow_up_retrieval_includes_previous_question(index):
    req = ChatRequest(message="Which tools did it use?", history=[Turn(role="user", content="Tell me about VoxAI"),
                                                                  Turn(role="assistant", content="VoxAI is a voice assistant [S1].")])
    q = retrieval_query(req)
    assert "VoxAI" in q and "tools" in q
    assert "VoxAI" in _top(index, q)["title"]
