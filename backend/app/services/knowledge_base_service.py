from __future__ import annotations

import json
import math
import re
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.paths import sanitized_workspace_root
from app.models.kb_chunk import KbChunk
from app.models.kb_document import KbDocument
from app.models.knowledge_base import KnowledgeBase
from app.models.llm_runtime_profile import LlmRuntimeProfile
from app.services.desensitization_service import sanitize_text
from app.services.file_text_extract import extract_text_from_file, safe_storage_name


class KbError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


GLOBAL_RETRIEVAL_DEFAULTS = {
    "retrieval_strategy": "hybrid",
    "keyword_weight": 0.4,
    "semantic_weight": 0.4,
    "rerank_weight": 0.2,
}


def _strategy_params(row: KnowledgeBase) -> dict[str, float | int | str | bool]:
    if not row.strategy_params_json:
        return {}
    try:
        raw = json.loads(row.strategy_params_json)
    except json.JSONDecodeError:
        return {}
    if isinstance(raw, dict):
        return raw
    return {}


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
        "semantic_model_id": row.semantic_model_id,
        "use_global_defaults": row.use_global_defaults,
        "retrieval_strategy": row.retrieval_strategy,
        "keyword_weight": row.keyword_weight,
        "semantic_weight": row.semantic_weight,
        "rerank_weight": row.rerank_weight,
        "strategy_params": _strategy_params(row),
        "status": row.status,
        "updated_at": row.updated_at.isoformat(),
    }


def _global_profile_models(db: Session, user_id: str) -> dict[str, str | None]:
    row = (
        db.query(LlmRuntimeProfile)
        .filter(LlmRuntimeProfile.user_id == user_id, LlmRuntimeProfile.is_default.is_(True))
        .first()
    )
    if not row:
        return {"embedding_model_id": None, "reranker_model_id": None, "semantic_model_id": None}
    return {
        "embedding_model_id": row.embedding_model_id,
        "reranker_model_id": row.reranker_model_id,
        "semantic_model_id": row.llm_model_id,
    }


def get_kb_global_defaults(db: Session, user_id: str) -> dict:
    return {**GLOBAL_RETRIEVAL_DEFAULTS, **_global_profile_models(db, user_id)}


def _normalize_weights(
    strategy: str,
    keyword_weight: float,
    semantic_weight: float,
    rerank_weight: float,
) -> tuple[float, float, float]:
    if strategy == "keyword":
        return 1.0, 0.0, 0.0
    if strategy == "semantic":
        return 0.0, 1.0, 0.0
    total = max(keyword_weight + semantic_weight + rerank_weight, 1e-8)
    return keyword_weight / total, semantic_weight / total, rerank_weight / total


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
    semantic_model_id: str | None,
    use_global_defaults: bool,
    retrieval_strategy: str,
    keyword_weight: float,
    semantic_weight: float,
    rerank_weight: float,
    strategy_params: dict[str, float | int | str | bool] | None,
) -> KnowledgeBase:
    if (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.user_id == user_id, KnowledgeBase.name == name)
        .first()
    ):
        raise KbError(7001, "Knowledge base name already exists")
    defaults = get_kb_global_defaults(db, user_id)
    row = KnowledgeBase(
        id=str(uuid4()),
        user_id=user_id,
        name=name,
        member_scope=member_scope,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        top_k=top_k,
        rerank_top_n=rerank_top_n,
        embedding_model_id=embedding_model_id or (defaults["embedding_model_id"] if use_global_defaults else None),
        reranker_model_id=reranker_model_id or (defaults["reranker_model_id"] if use_global_defaults else None),
        semantic_model_id=semantic_model_id or (defaults["semantic_model_id"] if use_global_defaults else None),
        use_global_defaults=use_global_defaults,
        retrieval_strategy=retrieval_strategy if not use_global_defaults else str(defaults["retrieval_strategy"]),
        keyword_weight=keyword_weight if not use_global_defaults else float(defaults["keyword_weight"]),
        semantic_weight=semantic_weight if not use_global_defaults else float(defaults["semantic_weight"]),
        rerank_weight=rerank_weight if not use_global_defaults else float(defaults["rerank_weight"]),
        strategy_params_json=json.dumps(strategy_params or {}, ensure_ascii=False),
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


def update_kb(
    db: Session,
    kb_id: str,
    user_id: str,
    **kwargs,
) -> KnowledgeBase:
    kb = _ensure_kb(db, kb_id, user_id)
    for field in (
        "name",
        "chunk_size",
        "chunk_overlap",
        "top_k",
        "rerank_top_n",
        "embedding_model_id",
        "reranker_model_id",
        "semantic_model_id",
        "use_global_defaults",
        "retrieval_strategy",
        "keyword_weight",
        "semantic_weight",
        "rerank_weight",
    ):
        value = kwargs.get(field, None)
        if value is not None:
            setattr(kb, field, value)
    if "strategy_params" in kwargs and kwargs["strategy_params"] is not None:
        kb.strategy_params_json = json.dumps(kwargs["strategy_params"], ensure_ascii=False)

    if kb.use_global_defaults:
        defaults = get_kb_global_defaults(db, user_id)
        kb.embedding_model_id = kb.embedding_model_id or defaults["embedding_model_id"]
        kb.reranker_model_id = kb.reranker_model_id or defaults["reranker_model_id"]
        kb.semantic_model_id = kb.semantic_model_id or defaults["semantic_model_id"]
        kb.retrieval_strategy = str(defaults["retrieval_strategy"])
        kb.keyword_weight = float(defaults["keyword_weight"])
        kb.semantic_weight = float(defaults["semantic_weight"])
        kb.rerank_weight = float(defaults["rerank_weight"])

    db.commit()
    db.refresh(kb)
    return kb


def delete_kb(db: Session, kb_id: str, user_id: str) -> None:
    _ensure_kb(db, kb_id, user_id)
    docs = db.query(KbDocument).filter(KbDocument.kb_id == kb_id).all()
    for doc in docs:
        if doc.masked_path:
            Path(doc.masked_path).unlink(missing_ok=True)
        if doc.source_path:
            Path(doc.source_path).unlink(missing_ok=True)
    db.query(KbChunk).filter(KbChunk.kb_id == kb_id).delete()
    db.query(KbDocument).filter(KbDocument.kb_id == kb_id).delete()
    db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id).delete()
    db.commit()


def _create_doc_and_chunks(
    db: Session,
    kb: KnowledgeBase,
    user_id: str,
    title: str,
    content: str,
    source_type: str = "manual",
    source_path: str | None = None,
) -> tuple[str, int, str]:
    doc = KbDocument(
        id=str(uuid4()),
        kb_id=kb.id,
        member_id=user_id,
        source_type=source_type,
        source_path=source_path,
        status="processing",
    )
    db.add(doc)
    db.flush()

    sanitized_text, _ = sanitize_text(db, user_scope=user_id, text=content)
    safe_title = safe_storage_name(title, fallback="document")
    masked_path = sanitized_workspace_root() / "knowledge_bases" / kb.id / f"{doc.id}_{safe_title}.md"
    masked_path.parent.mkdir(parents=True, exist_ok=True)
    masked_path.write_text(sanitized_text, encoding="utf-8")
    doc.masked_path = str(masked_path)
    doc.status = "indexed"

    chunk_count = 0
    for idx, chunk_text in enumerate(_split_chunks(sanitized_text, kb.chunk_size, kb.chunk_overlap)):
        chunk_count += 1
        db.add(
            KbChunk(
                id=str(uuid4()),
                kb_id=kb.id,
                document_id=doc.id,
                member_id=user_id,
                chunk_text=chunk_text,
                chunk_order=idx,
                token_count=max(len(chunk_text) // 4, 1),
            )
        )
    return doc.id, chunk_count, doc.status


def build_kb(
    db: Session, kb_id: str, user_id: str, documents: list[dict], clear_existing: bool
) -> dict:
    kb = _ensure_kb(db, kb_id, user_id=user_id)
    kb.status = "building"

    if clear_existing:
        doc_ids = [row.id for row in db.query(KbDocument.id).filter(KbDocument.kb_id == kb_id).all()]
        if doc_ids:
            db.query(KbChunk).filter(KbChunk.document_id.in_(doc_ids)).delete()
        for row in db.query(KbDocument).filter(KbDocument.kb_id == kb_id).all():
            if row.masked_path:
                Path(row.masked_path).unlink(missing_ok=True)
            if row.source_path:
                Path(row.source_path).unlink(missing_ok=True)
        db.query(KbDocument).filter(KbDocument.kb_id == kb_id).delete()
        db.flush()

    if not documents:
        kb.status = "ready"
        db.commit()
        return {"documents": 0, "chunks": 0}

    total_chunks = 0
    for item in documents:
        try:
            _, chunk_count, _ = _create_doc_and_chunks(
                db,
                kb=kb,
                user_id=user_id,
                title=item["title"],
                content=item["content"],
                source_type="manual",
            )
            total_chunks += chunk_count
        except Exception as exc:  # noqa: BLE001
            db.add(
                KbDocument(
                    id=str(uuid4()),
                    kb_id=kb.id,
                    member_id=user_id,
                    source_type="manual",
                    status="error",
                    error_message=str(exc),
                )
            )

    has_error = (
        db.query(KbDocument).filter(KbDocument.kb_id == kb_id, KbDocument.status == "error").count()
        > 0
    )
    kb.status = "failed" if has_error else "ready"
    db.commit()

    doc_count = db.query(KbDocument).filter(KbDocument.kb_id == kb_id).count()
    return {"documents": doc_count, "chunks": total_chunks, "status": kb.status}


def upload_kb_document(
    db: Session,
    kb_id: str,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
) -> dict:
    kb = _ensure_kb(db, kb_id, user_id=user_id)
    kb.status = "building"
    safe_name = safe_storage_name(file_name, fallback="document.txt")
    source_path = sanitized_workspace_root() / "knowledge_bases" / kb.id / "uploads" / safe_name
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(file_bytes)
    try:
        content = extract_text_from_file(safe_name, file_bytes)
        doc_id, chunk_count, status = _create_doc_and_chunks(
            db,
            kb=kb,
            user_id=user_id,
            title=safe_name,
            content=content,
            source_type="upload",
            source_path=str(source_path),
        )
        kb.status = "ready"
        db.commit()
        return {"document_id": doc_id, "chunks": chunk_count, "status": status}
    except Exception as exc:  # noqa: BLE001
        db.add(
            KbDocument(
                id=str(uuid4()),
                kb_id=kb.id,
                member_id=user_id,
                source_type="upload",
                source_path=str(source_path),
                status="error",
                error_message=str(exc),
            )
        )
        kb.status = "failed"
        db.commit()
        raise KbError(7007, f"Upload parse failed: {type(exc).__name__}") from exc


def delete_kb_document(db: Session, kb_id: str, doc_id: str, user_id: str) -> None:
    _ensure_kb(db, kb_id, user_id=user_id)
    doc = (
        db.query(KbDocument)
        .filter(KbDocument.kb_id == kb_id, KbDocument.id == doc_id)
        .first()
    )
    if not doc:
        raise KbError(7008, "Document not found")
    if doc.masked_path:
        Path(doc.masked_path).unlink(missing_ok=True)
    if doc.source_path:
        Path(doc.source_path).unlink(missing_ok=True)
    db.query(KbChunk).filter(KbChunk.document_id == doc_id).delete()
    db.delete(doc)
    db.commit()


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


def _tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"\W+", text.lower()) if t]


def _keyword_score(query_tokens: list[str], text: str) -> float:
    corpus = text.lower()
    if not query_tokens:
        return 0.0
    hits = sum(corpus.count(token) for token in query_tokens)
    return min(hits / max(len(query_tokens), 1), 1.0)


def _semantic_score(query_tokens: list[str], text_tokens: list[str]) -> float:
    if not query_tokens or not text_tokens:
        return 0.0
    q = set(query_tokens)
    t = set(text_tokens)
    overlap = len(q & t)
    return overlap / max(math.sqrt(len(q) * len(t)), 1.0)


def retrieve_from_kb(
    db: Session,
    kb_id: str,
    user_id: str,
    query: str,
    top_k: int | None,
    strategy: str | None = None,
    keyword_weight: float | None = None,
    semantic_weight: float | None = None,
    rerank_weight: float | None = None,
) -> list[dict]:
    kb = _ensure_kb(db, kb_id, user_id=user_id)
    if kb.status not in {"ready", "building", "failed"}:
        raise KbError(7003, "Knowledge base not ready")

    effective_strategy = strategy or kb.retrieval_strategy
    kw_w = kb.keyword_weight if keyword_weight is None else keyword_weight
    se_w = kb.semantic_weight if semantic_weight is None else semantic_weight
    rr_w = kb.rerank_weight if rerank_weight is None else rerank_weight
    kw_w, se_w, rr_w = _normalize_weights(effective_strategy, kw_w, se_w, rr_w)

    limit = top_k or kb.top_k
    rows = db.query(KbChunk).filter(KbChunk.kb_id == kb_id).all()
    query_tokens = _tokenize(query)

    scored: list[tuple[float, KbChunk, dict]] = []
    for row in rows:
        text_tokens = _tokenize(row.chunk_text)
        kw_score = _keyword_score(query_tokens, row.chunk_text)
        sem_score = _semantic_score(query_tokens, text_tokens)
        rerank_score = min((len(query_tokens) / max(len(text_tokens), 1)), 1.0)
        score = kw_w * kw_score + se_w * sem_score + rr_w * rerank_score
        if score > 0:
            scored.append(
                (
                    score,
                    row,
                    {
                        "keyword": round(kw_score, 4),
                        "semantic": round(sem_score, 4),
                        "rerank": round(rerank_score, 4),
                        "total": round(score, 4),
                    },
                )
            )

    scored.sort(key=lambda x: x[0], reverse=True)
    result: list[dict] = []
    for _, row, score_detail in scored[:limit]:
        doc = db.query(KbDocument).filter(KbDocument.id == row.document_id).first()
        result.append(
            {
                "chunk_id": row.id,
                "document_id": row.document_id,
                "chunk_order": row.chunk_order,
                "text": row.chunk_text,
                "score": score_detail,
                "strategy": {
                    "mode": effective_strategy,
                    "weights": {
                        "keyword": kw_w,
                        "semantic": se_w,
                        "rerank": rr_w,
                    },
                },
                "source": {
                    "masked_path": doc.masked_path if doc else None,
                    "source_type": doc.source_type if doc else None,
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
            "source_type": row.source_type,
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
