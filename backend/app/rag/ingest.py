"""PDF -> clean text -> section-aware chunks with metadata (section, entry, source, pages)."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pypdf

SECTIONS = ["PROFESSIONAL SUMMARY", "EDUCATION", "EXPERIENCE", "PROJECTS", "TECHNICAL SKILLS", "CERTIFICATIONS"]
# sections whose entries each start with a "Title ... | ..." line followed by bullets
ENTRY_SECTIONS = {"EXPERIENCE", "PROJECTS"}


@dataclass
class Chunk:
    id: str
    section: str
    title: str
    text: str
    pages: list[int]
    source: str
    links: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def clean(text: str) -> str:
    text = text.replace(" ", " ")
    text = re.sub(r"(\w) -(\w)", r"\1-\2", text)  # "Qwen3 -4B" -> "Qwen3-4B" (pypdf spacing artefact)
    text = re.sub(r"(\d) -(image|epoch)", r"\1-\2", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([,.;:])", r"\1", text)
    return text


def extract_links(reader: pypdf.PdfReader) -> list[dict]:
    """Hyperlinks embedded in the PDF (label text is resolved from the line they sit on)."""
    out = []
    for pno, page in enumerate(reader.pages, start=1):
        for a in page.get("/Annots") or []:
            a = a.get_object()
            action = a.get("/A")
            uri = action.get("/URI") if action else None
            if uri:
                rect = [float(x) for x in a["/Rect"]]
                out.append({"page": pno, "y": rect[1], "x": rect[0], "url": str(uri)})
    return out


def read_pdf(path: Path) -> tuple[list[tuple[int, str]], list[dict]]:
    reader = pypdf.PdfReader(str(path))
    pages = [(i + 1, clean(p.extract_text() or "")) for i, p in enumerate(reader.pages)]
    return pages, extract_links(reader)


def _lines_with_pages(pages: list[tuple[int, str]]) -> list[tuple[int, str]]:
    out = []
    for pno, text in pages:
        for line in text.splitlines():
            line = line.strip()
            if line:
                out.append((pno, line))
    return out


def _is_entry_header(line: str) -> bool:
    return "|" in line and not line.startswith("•")


def chunk_resume(path: Path) -> list[Chunk]:
    pages, links = read_pdf(path)
    lines = _lines_with_pages(pages)
    source = path.name

    # --- header (before the first section heading) = identity / contact
    first = next(i for i, (_, l) in enumerate(lines) if l.upper() in SECTIONS)
    header = lines[:first]
    # --- split remaining lines by section heading
    sections: list[tuple[str, list[tuple[int, str]]]] = []
    for pno, line in lines[first:]:
        if line.upper() in SECTIONS:
            sections.append((line.upper(), []))
        else:
            sections[-1][1].append((pno, line))

    chunks: list[Chunk] = []

    def add(section: str, title: str, body: list[tuple[int, str]], extra_links: list[dict] | None = None):
        text = _join(body)
        if not text:
            return
        cid = f"{section.lower().replace(' ', '-')}-{len(chunks):02d}"
        chunks.append(Chunk(cid, section.title(), title, text, sorted({p for p, _ in body}), source, extra_links or []))

    # identity chunk: name + contact + summary, with real profile links from the PDF
    name = header[0][1].title() if header else "Muhammad Hamza Alam"
    profile_links = [{"label": "LinkedIn" if "linkedin" in l["url"] else "GitHub" if "github" in l["url"] else "Link", "url": l["url"]}
                     for l in links if l["page"] == 1 and l["y"] > 700]
    summary = next((b for s, b in sections if s == "PROFESSIONAL SUMMARY"), [])
    link_lines = [(1, f"{pl['label']}: {pl['url']}") for pl in profile_links]
    add("PROFESSIONAL SUMMARY", f"{name} — profile and summary", header + link_lines + summary, profile_links)

    cert_links = sorted([l for l in links if l["page"] == 2 and l["y"] < 200], key=lambda l: -l["y"])
    for section, body in sections:
        if section == "PROFESSIONAL SUMMARY":
            continue
        if section in ENTRY_SECTIONS:
            entry: list[tuple[int, str]] = []
            for pno, line in body:
                if _is_entry_header(line) and entry and any(l.startswith("•") for _, l in entry):
                    add(section, _title(entry[0][1]), entry)
                    entry = []
                entry.append((pno, line))
            if entry:
                add(section, _title(entry[0][1]), entry)
        elif section == "CERTIFICATIONS":
            # attach each "Verify Credential" link (ordered top-to-bottom) to its bullet
            bullets = [(p, l) for p, l in body if l.startswith("•")]
            enriched, cl = [], []
            for i, (p, l) in enumerate(bullets):
                url = cert_links[i]["url"] if i < len(cert_links) else None
                l = l.replace("| Verify Credential", "").strip()
                if url:
                    l += f" | Verification link: {url}"
                    cl.append({"label": "Verify credential", "url": url})
                enriched.append((p, l))
            add(section, "Certifications", enriched, cl)
        else:
            add(section, section.title(), body)
    return chunks


def _title(line: str) -> str:
    return line.split("|")[0].strip(" •—-")


def _join(body: list[tuple[int, str]]) -> str:
    """Re-flow wrapped lines: a line continues the previous one unless it starts a bullet/entry/label."""
    out: list[str] = []
    for _, line in body:
        starts_new = line.startswith("•") or _is_entry_header(line) or re.match(r"^[A-Z][A-Za-z &/]+:", line)
        if out and not starts_new:
            out[-1] = out[-1].rstrip() + " " + line
        else:
            out.append(line)
    return "\n".join(out).strip()
