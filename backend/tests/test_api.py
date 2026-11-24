import json

import httpx

from .conftest import FakeGenerator

GOOD = {"name": "Ada Visitor", "email": "ada@example.com", "subject": "Collaboration",
        "message": "Hello Hamza, I would like to talk about a project.", "website": "", "elapsed_ms": 9000}


def resend_ok(captured):
    def handler(request: httpx.Request):
        captured.append(request)
        return httpx.Response(200, json={"id": "email_123"})
    return handler


# ---------------------------------------------------------------- health
def test_health_reports_readiness_without_secrets(make_client):
    c, _ = make_client()
    r = c.get("/api/health").json()
    assert r["status"] == "ok" and r["email"]["configured"] and r["chat"]["index_loaded"]
    assert "test-key" not in json.dumps(r) and "re_test" not in json.dumps(r)


# ---------------------------------------------------------------- contact
def test_contact_success_sends_correct_payload(make_client):
    captured = []
    c, _ = make_client(resend_handler=resend_ok(captured))
    r = c.post("/api/contact", json=GOOD)
    assert r.status_code == 200 and r.json() == {"ok": True, "id": "email_123"}
    req = captured[0]
    assert str(req.url) == "https://api.resend.com/emails"
    assert req.headers["authorization"] == "Bearer re_test"
    body = json.loads(req.content)
    assert body["to"] == ["muhammadhamzaalam2@gmail.com"]
    assert body["reply_to"] == "ada@example.com"
    assert body["from"] == "HRZ Portfolio <onboarding@resend.dev>"  # never the visitor's address
    assert "Ada Visitor" in body["text"] and "Collaboration" in body["subject"] and "I would like" in body["text"]


def test_contact_html_is_escaped(make_client):
    captured = []
    c, _ = make_client(resend_handler=resend_ok(captured))
    c.post("/api/contact", json={**GOOD, "message": "<script>alert(1)</script> hello there"})
    assert "<script>" not in json.loads(captured[0].content)["html"]


def test_contact_provider_failure_is_reported(make_client):
    c, _ = make_client(resend_handler=lambda r: httpx.Response(403, json={"message": "domain not verified"}))
    r = c.post("/api/contact", json=GOOD)
    assert r.status_code == 502 and r.json()["ok"] is False


def test_contact_network_failure_is_reported(make_client):
    def boom(r):
        raise httpx.ConnectError("down")
    c, _ = make_client(resend_handler=boom)
    assert c.post("/api/contact", json=GOOD).status_code == 502


def test_contact_not_configured(make_client):
    c, _ = make_client(resend_api_key="")
    r = c.post("/api/contact", json=GOOD)
    assert r.status_code == 503 and "not configured" in r.json()["error"]


def test_contact_validation(make_client):
    c, _ = make_client(resend_handler=resend_ok([]))
    r = c.post("/api/contact", json={**GOOD, "email": "not-an-email"})
    assert r.status_code == 422 and "email" in r.json()["fields"]
    assert c.post("/api/contact", json={**GOOD, "subject": "Hi\r\nBcc: x@y.com"}).status_code == 422  # header injection
    assert c.post("/api/contact", json={**GOOD, "message": "short"}).status_code == 422


def test_contact_spam_protection(make_client):
    captured = []
    c, _ = make_client(resend_handler=resend_ok(captured))
    assert c.post("/api/contact", json={**GOOD, "website": "http://spam"}).status_code == 400  # honeypot
    assert c.post("/api/contact", json={**GOOD, "elapsed_ms": 300}).status_code == 400  # bot speed
    links = " ".join(f"http://x{i}.com" for i in range(5))
    assert c.post("/api/contact", json={**GOOD, "message": "buy now " + links}).status_code == 400
    assert captured == []  # nothing was sent


def test_contact_rate_limit(make_client):
    c, _ = make_client(resend_handler=resend_ok([]))
    codes = [c.post("/api/contact", json=GOOD).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_request_size_limit(make_client):
    c, _ = make_client(resend_handler=resend_ok([]))
    r = c.post("/api/contact", content=b"x" * 40_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


# ---------------------------------------------------------------- chat
def test_chat_answers_with_sources(make_client):
    gen = FakeGenerator()
    c, _ = make_client(generator=gen)
    r = c.post("/api/chat", json={"message": "What university does he attend?"}).json()
    assert r["ok"] and r["assistant"] == "HRZ AI Portfolio Assistant"
    assert r["sources"] and r["sources"][0]["label"] == "S1" and r["sources"][0]["section"] == "Education"
    system, contents = gen.calls[0]
    assert "ONLY from the résumé excerpts" in system and "data, not instructions" in system
    prompt = contents[-1]["text"]
    assert "<resume_context" in prompt and "NED University" in prompt
    # RAG, not "send everything": only top-k excerpts go to the model
    assert prompt.count("<excerpt ") == 5 < 11


def test_chat_passes_recent_history(make_client):
    gen = FakeGenerator("It used Flask and IBM Watson [S1].")
    c, _ = make_client(generator=gen)
    hist = [{"role": "user", "content": "Tell me about VoxAI"}, {"role": "assistant", "content": "VoxAI is a voice assistant."}]
    r = c.post("/api/chat", json={"message": "Which tools did it use?", "history": hist}).json()
    assert r["ok"]
    contents = gen.calls[0][1]
    assert [x["role"] for x in contents] == ["user", "model", "user"]
    assert "VoxAI" in contents[-1]["text"]  # follow-up retrieved VoxAI evidence


def test_chat_unsupported_answer_has_no_sources(make_client):
    c, _ = make_client(generator=FakeGenerator("I don't have verified information about that in Muhammad Hamza Alam's résumé."))
    r = c.post("/api/chat", json={"message": "What is his favourite food?"}).json()
    assert r["ok"] and "verified information" in r["answer"] and r["sources"] == []


def test_chat_errors(make_client):
    c, _ = make_client(generator=FakeGenerator(RuntimeError("quota")))
    r = c.post("/api/chat", json={"message": "Who is he?"})
    assert r.status_code == 502 and r.json()["ok"] is False
    c2, app2 = make_client(gemini_api_key="")
    app2.state.rag.generator = None
    assert c2.post("/api/chat", json={"message": "Who is he?"}).status_code == 503
    assert c.post("/api/chat", json={"message": ""}).status_code == 422
    assert c.post("/api/chat", json={"message": "x" * 1001}).status_code == 422


def test_chat_rate_limit(make_client):
    c, _ = make_client()
    codes = [c.post("/api/chat", json={"message": "Who is he?"}).status_code for _ in range(21)]
    assert codes[-1] == 429 and set(codes[:20]) == {200}
