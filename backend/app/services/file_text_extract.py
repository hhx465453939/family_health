from __future__ import annotations

import re
import zipfile
from io import BytesIO
from pathlib import Path


def decode_text_with_fallback(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="ignore")


def _strip_xml_tags(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_text_from_file(file_name: str, file_bytes: bytes) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".txt", ".md", ".markdown", ".json", ".csv", ".log", ".xml", ".yaml", ".yml"}:
        return decode_text_with_fallback(file_bytes)

    if suffix == ".docx":
        with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
            xml_payload = zf.read("word/document.xml").decode("utf-8", errors="ignore")
            return _strip_xml_tags(xml_payload)

    return decode_text_with_fallback(file_bytes)


def safe_storage_name(name: str, fallback: str = "file") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name).strip().strip(".")
    if not cleaned:
        cleaned = fallback
    return cleaned[:180]
