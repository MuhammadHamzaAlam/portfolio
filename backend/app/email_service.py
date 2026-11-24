"""Contact form: validation, anti-spam checks and delivery through Resend.

The visitor's address is only ever used as Reply-To. The From address is always the configured,
provider-verified sender (never spoofed as the visitor).
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

import httpx
from pydantic import BaseModel, Field, field_validator

from .config import Settings

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
MIN_FILL_MS = 3000  # humans need more than 3 s to fill four fields
MAX_LINKS = 3


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    subject: str = Field(min_length=3, max_length=150)
    message: str = Field(min_length=10, max_length=5000)
    website: str = Field(default="", max_length=200)  # honeypot: must stay empty
    elapsed_ms: int = Field(default=0, ge=0)  # time between form render and submit

    @field_validator("name", "subject")
    @classmethod
    def single_line(cls, v: str) -> str:
        v = v.strip()
        if re.search(r"[\r\n]", v):  # header-injection guard
            raise ValueError("must be a single line")
        return v

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        v = v.strip()
        if not EMAIL_RE.match(v) or re.search(r"[\r\n]", v):
            raise ValueError("is not a valid email address")
        return v

    @field_validator("message")
    @classmethod
    def strip_message(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("is too short")
        return v


class SpamRejected(Exception):
    pass


def spam_check(req: ContactRequest) -> None:
    if req.website:
        raise SpamRejected("honeypot")
    if req.elapsed_ms < MIN_FILL_MS:
        raise SpamRejected("too fast")
    if len(re.findall(r"https?://", req.message, re.I)) > MAX_LINKS:
        raise SpamRejected("too many links")


class EmailNotConfigured(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


@dataclass
class SentEmail:
    provider: str
    id: str


def build_email(req: ContactRequest, settings: Settings) -> dict:
    subject = f"[HRZ Portfolio] {req.subject}"
    text = (
        f"New message from the HRZ portfolio contact form\n\n"
        f"Name: {req.name}\nEmail: {req.email}\nSubject: {req.subject}\n\n{req.message}\n\n"
        f"— Reply to this email to answer {req.name} directly."
    )
    e = html.escape
    body_html = (
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#111\">"
        "<p style=\"color:#666\">New message from the HRZ portfolio contact form</p>"
        f"<p><b>Name:</b> {e(req.name)}<br><b>Email:</b> {e(req.email)}<br><b>Subject:</b> {e(req.subject)}</p>"
        f"<p style=\"white-space:pre-wrap;border-left:3px solid #D6B58A;padding-left:10px\">{e(req.message)}</p>"
        f"<p style=\"color:#666\">Reply to this email to answer {e(req.name)} directly.</p></div>"
    )
    return {
        "from": settings.from_address,
        "to": [settings.recipient],
        "reply_to": req.email,
        "subject": subject,
        "text": text,
        "html": body_html,
    }


def send_contact_email(req: ContactRequest, settings: Settings, client: httpx.Client | None = None) -> SentEmail:
    if not settings.email_configured:
        raise EmailNotConfigured("RESEND_API_KEY is not set")
    payload = build_email(req, settings)
    own = client is None
    client = client or httpx.Client(timeout=15)
    try:
        r = client.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )
    except httpx.HTTPError as exc:
        raise EmailDeliveryError(f"network error contacting Resend: {type(exc).__name__}") from exc
    finally:
        if own:
            client.close()
    if r.status_code >= 300:
        # Resend returns {"name": ..., "message": ...}; log it server-side, never echo secrets
        try:
            detail = r.json().get("message", "")
        except ValueError:
            detail = r.text[:200]
        raise EmailDeliveryError(f"Resend rejected the message ({r.status_code}): {detail}")
    data = r.json()
    if not data.get("id"):
        raise EmailDeliveryError("Resend response did not include a message id")
    return SentEmail(provider="resend", id=data["id"])
