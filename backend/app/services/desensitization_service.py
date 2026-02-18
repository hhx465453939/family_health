from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.crypto import encrypt_text
from app.models.desensitization_rule import DesensitizationRule
from app.models.pii_mapping_vault import PiiMappingVault


class DesensitizationError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


_HIGH_RISK_PATTERNS = [
    re.compile(r"\b1\d{10}\b"),
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\b\d{15,18}[\dXx]\b"),
]


def _record_mapping(db: Session, user_id: str, original: str, replacement_token: str) -> None:
    db.add(
        PiiMappingVault(
            id=str(uuid4()),
            user_id=user_id,
            mapping_key=str(uuid4()),
            original_value_encrypted=encrypt_text(original),
            replacement_token=replacement_token,
            hash_fingerprint=hashlib.sha256(original.encode("utf-8")).hexdigest(),
        )
    )


def create_rule(
    db: Session,
    user_id: str,
    member_scope: str,
    rule_type: str,
    pattern: str,
    replacement_token: str,
    enabled: bool,
) -> DesensitizationRule:
    normalized_type = rule_type.lower()
    if normalized_type not in {"literal", "regex"}:
        raise DesensitizationError(5001, "Unsupported rule_type")
    if normalized_type == "regex":
        try:
            re.compile(pattern)
        except re.error as exc:
            raise DesensitizationError(5003, "Invalid regex pattern") from exc
    row = DesensitizationRule(
        id=str(uuid4()),
        user_id=user_id,
        member_scope=member_scope,
        rule_type=normalized_type,
        pattern=pattern,
        replacement_token=replacement_token,
        enabled=enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_rules(db: Session, user_id: str) -> list[DesensitizationRule]:
    query = db.query(DesensitizationRule).filter(
        DesensitizationRule.user_id == user_id,
        DesensitizationRule.enabled.is_(True),
    )
    return query.order_by(DesensitizationRule.updated_at.asc()).all()


def _replace_with_mapping(
    pattern: re.Pattern, text: str, replacement_token: str, on_match: Callable[[str], None]
) -> str:
    def repl(match: re.Match) -> str:
        matched = match.group(0)
        on_match(matched)
        return replacement_token

    return pattern.sub(repl, text)


def sanitize_text(db: Session, user_scope: str, text: str) -> tuple[str, int]:
    rules = list_rules(db, user_id=user_scope)
    sanitized = text
    replacements = 0

    for rule in rules:
        try:
            regex = (
                re.compile(re.escape(rule.pattern))
                if rule.rule_type == "literal"
                else re.compile(rule.pattern)
            )
        except re.error as exc:
            raise DesensitizationError(5003, "Invalid regex pattern") from exc

        def on_match(matched: str) -> None:
            nonlocal replacements
            replacements += 1
            _record_mapping(db, user_scope, matched, rule.replacement_token)

        sanitized = _replace_with_mapping(regex, sanitized, rule.replacement_token, on_match)

    # Strong gate: potentially sensitive patterns are not allowed into AI workspace when no masking happened.
    if replacements == 0 and any(pattern.search(sanitized) for pattern in _HIGH_RISK_PATTERNS):
        raise DesensitizationError(5002, "Potential PII detected; add desensitization rules first")

    db.flush()
    return sanitized, replacements
