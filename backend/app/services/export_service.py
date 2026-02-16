from __future__ import annotations

import json
import zipfile
from pathlib import Path
from uuid import uuid4

from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.paths import sanitized_workspace_root
from app.models.chat_message import ChatMessage
from app.models.export_item import ExportItem
from app.models.export_job import ExportJob
from app.models.kb_document import KbDocument


class ExportError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _job_to_dict(row: ExportJob) -> dict:
    return {
        "id": row.id,
        "status": row.status,
        "member_scope": row.member_scope,
        "export_types": json.loads(row.export_types_json),
        "archive_path": row.archive_path,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


def _add_export_item(
    db: Session, job_id: str, item_type: str, item_id: str, sanitized_path: str | None, meta: dict
):
    db.add(
        ExportItem(
            id=str(uuid4()),
            job_id=job_id,
            item_type=item_type,
            item_id=item_id,
            sanitized_path=sanitized_path,
            meta_json=json.dumps(meta, ensure_ascii=False),
        )
    )


def create_export_job(
    db: Session,
    user_id: str,
    member_scope: str,
    export_types: list[str],
    include_raw_file: bool,
    include_sanitized_text: bool,
    filters: dict,
) -> ExportJob:
    job = ExportJob(
        id=str(uuid4()),
        created_by=user_id,
        member_scope=member_scope,
        export_types_json=json.dumps(export_types, ensure_ascii=False),
        include_raw_file=include_raw_file,
        include_sanitized_text=include_sanitized_text,
        filters_json=json.dumps(filters, ensure_ascii=False),
        status="processing",
    )
    db.add(job)
    db.flush()

    if "chat" in export_types:
        rows = (
            db.query(ChatMessage)
            .order_by(ChatMessage.created_at.desc())
            .limit(int(filters.get("chat_limit", 200)))
            .all()
        )
        for row in rows:
            _add_export_item(
                db,
                job_id=job.id,
                item_type="chat_message",
                item_id=row.id,
                sanitized_path=None,
                meta={"role": row.role, "content": row.content},
            )

    if "kb" in export_types:
        rows = db.query(KbDocument).filter(KbDocument.masked_path.is_not(None)).all()
        for row in rows:
            _add_export_item(
                db,
                job_id=job.id,
                item_type="kb_document",
                item_id=row.id,
                sanitized_path=row.masked_path,
                meta={"status": row.status},
            )

    out_dir = sanitized_workspace_root() / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    archive_path = out_dir / f"{job.id}.zip"

    items = db.query(ExportItem).filter(ExportItem.job_id == job.id).all()
    manifest = {
        "job_id": job.id,
        "member_scope": member_scope,
        "export_types": export_types,
        "item_count": len(items),
    }

    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for item in items:
            meta = json.loads(item.meta_json)
            if item.item_type == "chat_message":
                zf.writestr(
                    f"chat/{item.item_id}.json",
                    json.dumps(meta, ensure_ascii=False, indent=2),
                )
            elif item.item_type == "kb_document" and include_sanitized_text and item.sanitized_path:
                path = Path(item.sanitized_path)
                if path.exists():
                    zf.write(path, f"kb/{path.name}")

    job.status = "done"
    job.archive_path = str(archive_path)
    db.commit()
    db.refresh(job)
    return job


def list_export_jobs(db: Session, user_id: str) -> list[dict]:
    rows = (
        db.query(ExportJob)
        .filter(ExportJob.created_by == user_id)
        .order_by(ExportJob.created_at.desc())
        .all()
    )
    return [_job_to_dict(row) for row in rows]


def get_export_job(db: Session, user_id: str, job_id: str) -> dict:
    row = (
        db.query(ExportJob).filter(ExportJob.id == job_id, ExportJob.created_by == user_id).first()
    )
    if not row:
        raise ExportError(8001, "Export job not found")
    items = db.query(ExportItem).filter(ExportItem.job_id == job_id).all()
    data = _job_to_dict(row)
    data["items"] = [
        {
            "id": item.id,
            "item_type": item.item_type,
            "item_id": item.item_id,
            "sanitized_path": item.sanitized_path,
        }
        for item in items
    ]
    return data


def delete_export_job(db: Session, user_id: str, job_id: str) -> None:
    row = (
        db.query(ExportJob).filter(ExportJob.id == job_id, ExportJob.created_by == user_id).first()
    )
    if not row:
        raise ExportError(8001, "Export job not found")
    if row.archive_path:
        path = Path(row.archive_path)
        if path.exists():
            path.unlink()
    db.query(ExportItem).filter(ExportItem.job_id == job_id).delete()
    db.delete(row)
    db.commit()


def build_download_response(db: Session, user_id: str, job_id: str) -> FileResponse:
    row = (
        db.query(ExportJob).filter(ExportJob.id == job_id, ExportJob.created_by == user_id).first()
    )
    if not row:
        raise ExportError(8001, "Export job not found")
    if row.status != "done" or not row.archive_path:
        raise ExportError(8002, "Export archive not ready")
    path = Path(row.archive_path)
    if not path.exists():
        raise ExportError(8002, "Export archive not found")
    return FileResponse(path=path, filename=path.name, media_type="application/zip")
