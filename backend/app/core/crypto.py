from __future__ import annotations

import base64
from itertools import cycle

from app.core.config import settings


def _xor_bytes(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ k for b, k in zip(data, cycle(key), strict=False))


def encrypt_text(plain: str) -> str:
    data = plain.encode("utf-8")
    key = settings.secret_key.encode("utf-8")
    encrypted = _xor_bytes(data, key)
    return base64.urlsafe_b64encode(encrypted).decode("utf-8")


def decrypt_text(cipher: str) -> str:
    data = base64.urlsafe_b64decode(cipher.encode("utf-8"))
    key = settings.secret_key.encode("utf-8")
    plain = _xor_bytes(data, key)
    return plain.decode("utf-8")
