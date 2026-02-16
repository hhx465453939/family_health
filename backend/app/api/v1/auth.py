from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_roles
from app.core.response import error, ok, trace_id_from_request
from app.core.security import decode_token
from app.models.user import User
from app.schemas.auth import (
    BootstrapOwnerRequest,
    CreateUserRequest,
    LoginRequest,
    RegisterRequest,
    RefreshRequest,
    UpdateRoleRequest,
    UpdateStatusRequest,
)
from app.services.auth_service import (
    AuthError,
    bootstrap_owner,
    create_user,
    login,
    logout,
    register_user,
    rotate_refresh_token,
)

router = APIRouter()


@router.post("/bootstrap-owner")
def bootstrap_owner_api(
    payload: BootstrapOwnerRequest, request: Request, db: Session = Depends(get_db)
):
    trace_id = trace_id_from_request(request)
    try:
        user = bootstrap_owner(
            db, payload.username, payload.password, payload.display_name, trace_id
        )
    except AuthError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok({"id": user.id, "username": user.username, "role": user.role}, trace_id)


@router.post("/login")
def login_api(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    trace_id = trace_id_from_request(request)
    try:
        result = login(db, payload.username, payload.password, trace_id, payload.device_label)
    except AuthError as exc:
        return error(exc.code, exc.message, trace_id, status_code=401)
    return ok(result, trace_id)


@router.post("/register")
def register_api(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    trace_id = trace_id_from_request(request)
    try:
        user = register_user(
            db,
            trace_id=trace_id,
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
        )
    except AuthError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok({"id": user.id, "username": user.username, "role": user.role}, trace_id)


@router.post("/refresh")
def refresh_api(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    trace_id = trace_id_from_request(request)
    try:
        token = decode_token(payload.refresh_token)
    except Exception:  # noqa: BLE001
        return error(2004, "Invalid refresh token", trace_id, status_code=401)
    if token.get("type") != "refresh":
        return error(2004, "Invalid refresh token", trace_id, status_code=401)
    try:
        result = rotate_refresh_token(db, trace_id, token.get("sub"), payload.refresh_token)
    except AuthError as exc:
        return error(exc.code, exc.message, trace_id, status_code=401)
    return ok(result, trace_id)


@router.post("/logout")
def logout_api(
    payload: RefreshRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    logout(db, trace_id, user.id, payload.refresh_token)
    return ok({"logged_out": True}, trace_id)


@router.post("/users")
def create_user_api(
    payload: CreateUserRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    try:
        user = create_user(
            db, trace_id, payload.username, payload.password, payload.display_name, payload.role
        )
    except AuthError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok({"id": user.id, "username": user.username, "role": user.role}, trace_id)


@router.patch("/users/{user_id}/role")
def update_user_role_api(
    user_id: str,
    payload: UpdateRoleRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        return error(2001, "User not found", trace_id, status_code=404)
    target.role = payload.role.lower()
    db.commit()
    return ok({"id": target.id, "role": target.role}, trace_id)


@router.patch("/users/{user_id}/status")
def update_user_status_api(
    user_id: str,
    payload: UpdateStatusRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("owner", "admin")),
):
    trace_id = trace_id_from_request(request)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        return error(2001, "User not found", trace_id, status_code=404)
    target.status = payload.status
    db.commit()
    return ok({"id": target.id, "status": target.status}, trace_id)
