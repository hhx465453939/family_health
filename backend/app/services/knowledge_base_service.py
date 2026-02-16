from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.paths import sanitized_workspace_root
from app.models.kb_chunk import KbChunk
from app.models.kb_document import KbDocument
from app.models.knowledge_base import KnowledgeBase
from app.services.desensitization_service import sanitize_text


class KbError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def kb_to_dict(row: KnowledgeBase) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "member_scope": row.member_scope,
        "chunk_size": row.chunk_size,
        "chunk_overlap": row.chunk_overlap,
        "top_k": row.top_k,
        "rerank_top_n": row.rerank_top_n,
        "embedding_model_id": row.embedding_model_id,
        "reranker_model_id": row.reranker_model_id,
        "status": row.status,
        "updated_at": row.updated_at.isoformat(),
    }


def create_kb(
    db: Session,
    user_id: str,
    name: str,
    member_scope: str,
    chunk_size: int,
    chunk_overlap: int,
    top_k: int,
    rerank_top_n: int,
    embedding_model_id: str | None,
    reranker_model_id: str | None,
) -> KnowledgeBase:
    if (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.user_id == user_id, KnowledgeBase.name == name)
        .first()
    ):
        raise KbError(7001, "Knowledge base name already exists")
    row = KnowledgeBase(
        id=str(uuid4()),
        user_id=user_id,
        name=name,
        member_scope=member_scope,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        top_k=top_k,
        rerank_top_n=rerank_top_n,
        embedding_model_id=embedding_model_id,
        reranker_model_id=reranker_model_id,
        status="draft",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_kb(db: Session, user_id: str) -> list[KnowledgeBase]:
    return (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.user_id == user_id)
        .order_by(KnowledgeBase.updated_at.desc())
        .all()
    )


def _split_chunks(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    step = max(chunk_size - chunk_overlap, 1)
    while start < len(text):
        chunks.append(text[start : start + chunk_size])
        start += step
    return chunks


def _ensure_kb(db: Session, kb_id: str, user_id: str) -> KnowledgeBase:
    row = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id)
        .first()
    )
    if not row:
        raise KbError(7002, "Knowledge base not found")
    return row


def build_kb(
    db: Session, kb_id: str, user_id: str, documents: list[dict], clear_existing: bool
) -> dict:
    kb = _ensure_kb(db, kb_id, user_id=user_id)
    kb.status = "building"

    if clear_existing:
        doc_ids = [
            row.id for row in db.query(KbDocument.id).filter(KbDocument.kb_id == kb_id).all()
        ]
        if doc_ids:
            db.query(KbChunk).filter(KbChunk.document_id.in_(doc_ids)).delete()
        db.query(KbDocument).filter(KbDocument.kb_id == kb_id).delete()
        db.flush()

    if not documents:
        kb.status = "ready"
        db.commit()
        return {"documents": 0, "chunks": 0}

    base_dir = sanitized_workspace_root() / "knowledge_bases" / kb_id
    base_dir.mkdir(parents=True, exist_ok=True)

    total_chunks = 0
    for item in documents:
        doc = KbDocument(
            id=str(uuid4()),
            kb_id=kb_id,
            member_id=user_id,
            source_type="manual",
            status="processing",
        )
        db.add(doc)
        db.flush()

        try:
            sanitized_text, _ = sanitize_text(db, user_scope=user_id, text=item["content"])
            masked_path = base_dir / f"{doc.id}_{item['title']}.md"
            masked_path.write_text(sanitized_text, encoding="utf-8")
            doc.masked_path = str(masked_path)
            doc.status = "indexed"

            for idx, chunk_text in enumerate(
                _split_chunks(sanitized_text, kb.chunk_size, kb.chunk_overlap)
            ):
                total_chunks += 1
                db.add(
                    KbChunk(
                        id=str(uuid4()),
                        kb_id=kb_id,
                        document_id=doc.id,
                        member_id=user_id,
                        chunk_text=chunk_text,
                        chunk_order=idx,
                        token_count=max(len(chunk_text) // 4, 1),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            doc.status = "error"
            doc.error_message = str(exc)

    has_error = (
        db.query(KbDocument).filter(KbDocument.kb_id == kb_id, KbDocument.status == "error").count()
        > 0
    )
    kb.status = "failed" if has_error else "ready"
    db.commit()

    doc_count = db.query(KbDocument).filter(KbDocument.kb_id == kb_id).count()
    return {"documents": doc_count, "chunks": total_chunks, "status": kb.status}


def retry_failed_documents(db: Session, kb_id: str, user_id: str) -> int:
    _ensure_kb(db, kb_id, user_id=user_id)
    rows = (
        db.query(KbDocument).filter(KbDocument.kb_id == kb_id, KbDocument.status == "error").all()
    )
    for row in rows:
        row.status = "pending"
        row.error_message = None
    db.commit()
    return len(rows)


def retrieve_from_kb(
    db: Session, kb_id: str, user_id: str, query: str, top_k: int | None
) -> list[dict]:
    kb = _ensure_kb(db, kb_id, user_id=user_id)
    if kb.status not in {"ready", "building", "failed"}:
        raise KbError(7003, "Knowledge base not ready")

    query_rows = db.query(KbChunk).filter(KbChunk.kb_id == kb_id)
    for term in query.split():
        query_rows = query_rows.filter(KbChunk.chunk_text.like(f"%{term}%"))

    limit = top_k or kb.top_k
    rows = query_rows.order_by(KbChunk.created_at.desc()).limit(limit).all()

    result: list[dict] = []
    for row in rows:
        doc = db.query(KbDocument).filter(KbDocument.id == row.document_id).first()
        result.append(
            {
                "chunk_id": row.id,
                "document_id": row.document_id,
                "chunk_order": row.chunk_order,
                "text": row.chunk_text,
                "source": {
                    "masked_path": doc.masked_path if doc else None,
                },
            }
        )
    return result


def list_kb_documents(db: Session, kb_id: str, user_id: str) -> list[dict]:
    _ensure_kb(db, kb_id, user_id=user_id)
    rows = (
        db.query(KbDocument)
        .filter(KbDocument.kb_id == kb_id)
        .order_by(KbDocument.updated_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "status": row.status,
            "error_message": row.error_message,
            "masked_path": row.masked_path,
            "updated_at": row.updated_at.isoformat(),
        }
        for row in rows
    ]


def kb_stats(db: Session, kb_id: str, user_id: str) -> dict:
    _ensure_kb(db, kb_id, user_id=user_id)
    return {
        "documents": db.query(KbDocument).filter(KbDocument.kb_id == kb_id).count(),
        "chunks": db.query(KbChunk).filter(KbChunk.kb_id == kb_id).count(),
        "failed_documents": db.query(KbDocument)
        .filter(KbDocument.kb_id == kb_id, KbDocument.status == "error")
        .count(),
    }
