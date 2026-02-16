from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_token, hash_password, verify_password
from app.models.auth_audit_log import AuthAuditLog
from app.models.user import User
from app.models.user_session import UserSession


class AuthError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _audit(
    db: Session,
    trace_id: str,
    action: str,
    result: str,
    user_id: str | None = None,
    ip_addr: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.add(
        AuthAuditLog(
            id=str(uuid4()),
            user_id=user_id,
            action=action,
            result=result,
            ip_addr=ip_addr,
            user_agent=user_agent,
            trace_id=trace_id,
        )
    )


def bootstrap_owner(
    db: Session, username: str, password: str, display_name: str, trace_id: str
) -> User:
    owner_exists = db.query(User).filter(User.role == "owner").first()
    if owner_exists:
        raise AuthError(2001, "Owner already initialized")

    if db.query(User).filter(User.username == username).first():
        raise AuthError(2002, "Username already exists")

    user = User(
        id=str(uuid4()),
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
        role="owner",
        status="active",
    )
    db.add(user)
    _audit(db, trace_id, "bootstrap_owner", "success", user_id=user.id)
    db.commit()
    db.refresh(user)
    return user


def _ensure_login_allowed(user: User) -> None:
    now = datetime.now(timezone.utc)
    if user.status != "active":
        raise AuthError(4003, "User disabled")
    lock_until = user.lock_until
    if lock_until and lock_until.tzinfo is None:
        # SQLite commonly returns naive datetime even when timezone=True.
        lock_until = lock_until.replace(tzinfo=timezone.utc)
    if lock_until and lock_until > now:
        raise AuthError(4004, "User temporarily locked")


def login(
    db: Session,
    username: str,
    password: str,
    trace_id: str,
    device_label: str | None = None,
) -> dict:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        _audit(db, trace_id, "login", "failed")
        db.commit()
        raise AuthError(2003, "Invalid username or password")

    _ensure_login_allowed(user)

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_lock_max_attempts:
            user.lock_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.login_lock_minutes
            )
            user.failed_login_attempts = 0
        _audit(db, trace_id, "login", "failed", user_id=user.id)
        db.commit()
        raise AuthError(2003, "Invalid username or password")

    user.failed_login_attempts = 0
    user.lock_until = None
    user.last_login_at = datetime.now(timezone.utc)

    access_token = create_token(user.id, "access", settings.access_token_expire_minutes)
    refresh_minutes = settings.refresh_token_expire_days * 24 * 60
    refresh_token = create_token(user.id, "refresh", refresh_minutes)

    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        refresh_token_hash=_hash_refresh_token(refresh_token),
        device_label=device_label,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=refresh_minutes),
    )
    db.add(session)
    _audit(db, trace_id, "login", "success", user_id=user.id)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
    }


def rotate_refresh_token(db: Session, trace_id: str, user_id: str, refresh_token: str) -> dict:
    token_hash = _hash_refresh_token(refresh_token)
    now = datetime.now(timezone.utc)
    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token_hash == token_hash,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .first()
    )
    if not session or session.user_id != user_id:
        _audit(db, trace_id, "refresh", "failed", user_id=user_id)
        db.commit()
        raise AuthError(2004, "Invalid refresh token")

    session.revoked_at = now

    access_token = create_token(user_id, "access", settings.access_token_expire_minutes)
    refresh_minutes = settings.refresh_token_expire_days * 24 * 60
    new_refresh_token = create_token(user_id, "refresh", refresh_minutes)
    db.add(
        UserSession(
            id=str(uuid4()),
            user_id=user_id,
            refresh_token_hash=_hash_refresh_token(new_refresh_token),
            device_label=session.device_label,
            expires_at=now + timedelta(minutes=refresh_minutes),
        )
    )
    _audit(db, trace_id, "refresh", "success", user_id=user_id)
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


def logout(db: Session, trace_id: str, user_id: str, refresh_token: str) -> None:
    token_hash = _hash_refresh_token(refresh_token)
    session = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.refresh_token_hash == token_hash)
        .first()
    )
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
    _audit(db, trace_id, "logout", "success", user_id=user_id)
    db.commit()


def create_user(
    db: Session, trace_id: str, username: str, password: str, display_name: str, role: str
) -> User:
    if db.query(User).filter(User.username == username).first():
        raise AuthError(2002, "Username already exists")
    user = User(
        id=str(uuid4()),
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
        role=role.lower(),
        status="active",
    )
    db.add(user)
    _audit(db, trace_id, "create_user", "success", user_id=user.id)
    db.commit()
    db.refresh(user)
    return user


def register_user(
    db: Session, trace_id: str, username: str, password: str, display_name: str
) -> User:
    return create_user(
        db=db,
        trace_id=trace_id,
        username=username,
        password=password,
        display_name=display_name,
        role="member",
    )
