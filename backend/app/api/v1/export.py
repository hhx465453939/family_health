from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_roles
from app.core.response import error, ok, trace_id_from_request
from app.models.user import User
from app.schemas.export import ExportCreateRequest
from app.services.export_service import (
    ExportError,
    build_download_response,
    create_export_job,
    delete_export_job,
    get_export_job,
    list_export_jobs,
)

router = APIRouter()


@router.post("/exports/jobs")
def create_export_job_api(
    payload: ExportCreateRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    job = create_export_job(
        db,
        user_id=user.id,
        member_scope=payload.member_scope,
        export_types=payload.export_types,
        include_raw_file=payload.include_raw_file,
        include_sanitized_text=payload.include_sanitized_text,
        filters=payload.filters,
    )
    return ok({"id": job.id, "status": job.status, "archive_path": job.archive_path}, trace_id)


@router.get("/exports/jobs")
def list_export_jobs_api(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": list_export_jobs(db, user_id=user.id)}, trace_id)


@router.get("/exports/jobs/{job_id}")
def get_export_job_api(
    job_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        data = get_export_job(db, user_id=user.id, job_id=job_id)
    except ExportError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok(data, trace_id)


@router.get("/exports/jobs/{job_id}/download")
def download_export_job_api(
    job_id: str,
    _: User = Depends(require_roles("owner", "admin", "member", "viewer")),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    try:
        return build_download_response(db, user_id=user.id, job_id=job_id)
    except ExportError as exc:
        return error(exc.code, exc.message, trace_id="download", status_code=404)


@router.delete("/exports/jobs/{job_id}")
def delete_export_job_api(
    job_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_export_job(db, user_id=user.id, job_id=job_id)
    except ExportError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)
