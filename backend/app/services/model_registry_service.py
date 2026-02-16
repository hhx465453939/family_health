from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.crypto import encrypt_text
from app.models.llm_runtime_profile import LlmRuntimeProfile
from app.models.model_catalog import ModelCatalog
from app.models.model_provider import ModelProvider


class ModelRegistryError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


_DEFAULT_DISCOVERY_BY_PROVIDER = {
    "gemini": [
        ("gemini-2.0-flash", "llm", {"supports_reasoning_budget": True}),
        ("gemini-2.0-pro", "llm", {"supports_reasoning_budget": True}),
        ("text-embedding-004", "embedding", {}),
    ],
    "deepseek": [
        ("deepseek-chat", "llm", {"supports_reasoning_effort": True}),
        ("deepseek-reasoner", "llm", {"supports_reasoning_effort": True}),
    ],
}

_ALLOWED_PARAMS_BY_PROVIDER = {
    "gemini": {"temperature", "top_p", "max_tokens", "reasoning_budget"},
    "deepseek": {"temperature", "top_p", "max_tokens", "reasoning_effort"},
}


def _normalize_provider_name(provider_name: str) -> str:
    name = provider_name.strip().lower()
    if "gemini" in name:
        return "gemini"
    if "deepseek" in name:
        return "deepseek"
    return name


def _clip_params(provider_name: str, params: dict) -> dict:
    normalized = _normalize_provider_name(provider_name)
    allowed = _ALLOWED_PARAMS_BY_PROVIDER.get(normalized)
    if not allowed:
        return params
    return {k: v for k, v in params.items() if k in allowed}


def create_provider(
    db: Session,
    provider_name: str,
    base_url: str,
    api_key: str,
    enabled: bool,
) -> ModelProvider:
    provider = ModelProvider(
        id=str(uuid4()),
        provider_name=provider_name,
        base_url=base_url,
        api_key_encrypted=encrypt_text(api_key),
        enabled=enabled,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def list_providers(db: Session) -> list[ModelProvider]:
    return db.query(ModelProvider).order_by(ModelProvider.updated_at.desc()).all()


def update_provider(
    db: Session,
    provider_id: str,
    base_url: str | None,
    api_key: str | None,
    enabled: bool | None,
) -> ModelProvider:
    provider = db.query(ModelProvider).filter(ModelProvider.id == provider_id).first()
    if not provider:
        raise ModelRegistryError(3001, "Provider not found")
    if base_url is not None:
        provider.base_url = base_url
    if api_key is not None:
        provider.api_key_encrypted = encrypt_text(api_key)
    if enabled is not None:
        provider.enabled = enabled
    db.commit()
    db.refresh(provider)
    return provider


def refresh_models(
    db: Session, provider_id: str, manual_models: list[str] | None = None
) -> list[ModelCatalog]:
    provider = db.query(ModelProvider).filter(ModelProvider.id == provider_id).first()
    if not provider:
        raise ModelRegistryError(3001, "Provider not found")

    db.query(ModelCatalog).filter(ModelCatalog.provider_id == provider_id).delete()

    normalized = _normalize_provider_name(provider.provider_name)
    discovered = _DEFAULT_DISCOVERY_BY_PROVIDER.get(normalized, [])
    if manual_models:
        discovered.extend((model_name, "llm", {}) for model_name in manual_models)

    if not discovered:
        discovered = [("custom-model", "llm", {})]

    rows: list[ModelCatalog] = []
    for model_name, model_type, capabilities in discovered:
        row = ModelCatalog(
            id=str(uuid4()),
            provider_id=provider_id,
            model_name=model_name,
            model_type=model_type,
            capabilities_json=json.dumps(capabilities, ensure_ascii=False),
        )
        db.add(row)
        rows.append(row)

    provider.last_refresh_at = datetime.now(timezone.utc)
    db.commit()
    return rows


def list_catalog(
    db: Session, provider_id: str | None, model_type: str | None
) -> list[ModelCatalog]:
    query = db.query(ModelCatalog)
    if provider_id:
        query = query.filter(ModelCatalog.provider_id == provider_id)
    if model_type:
        query = query.filter(ModelCatalog.model_type == model_type)
    return query.order_by(ModelCatalog.updated_at.desc()).all()


def _ensure_default_profile_uniqueness(db: Session, profile_id: str | None = None) -> None:
    query = db.query(LlmRuntimeProfile).filter(LlmRuntimeProfile.is_default.is_(True))
    if profile_id:
        query = query.filter(LlmRuntimeProfile.id != profile_id)
    for row in query.all():
        row.is_default = False


def _provider_name_for_model(db: Session, model_id: str | None) -> str | None:
    if not model_id:
        return None
    model = db.query(ModelCatalog).filter(ModelCatalog.id == model_id).first()
    if not model:
        return None
    provider = db.query(ModelProvider).filter(ModelProvider.id == model.provider_id).first()
    return provider.provider_name if provider else None


def create_runtime_profile(
    db: Session,
    name: str,
    llm_model_id: str | None,
    embedding_model_id: str | None,
    reranker_model_id: str | None,
    params: dict,
    is_default: bool,
) -> LlmRuntimeProfile:
    if db.query(LlmRuntimeProfile).filter(LlmRuntimeProfile.name == name).first():
        raise ModelRegistryError(3002, "Runtime profile name already exists")

    provider_name = _provider_name_for_model(db, llm_model_id)
    clipped = _clip_params(provider_name or "", params)

    if is_default:
        _ensure_default_profile_uniqueness(db)

    profile = LlmRuntimeProfile(
        id=str(uuid4()),
        name=name,
        llm_model_id=llm_model_id,
        embedding_model_id=embedding_model_id,
        reranker_model_id=reranker_model_id,
        params_json=json.dumps(clipped, ensure_ascii=False),
        is_default=is_default,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_runtime_profile(
    db: Session,
    profile_id: str,
    name: str | None,
    llm_model_id: str | None,
    embedding_model_id: str | None,
    reranker_model_id: str | None,
    params: dict | None,
    is_default: bool | None,
) -> LlmRuntimeProfile:
    profile = db.query(LlmRuntimeProfile).filter(LlmRuntimeProfile.id == profile_id).first()
    if not profile:
        raise ModelRegistryError(3003, "Runtime profile not found")

    if name is not None:
        duplicated = (
            db.query(LlmRuntimeProfile)
            .filter(LlmRuntimeProfile.name == name, LlmRuntimeProfile.id != profile_id)
            .first()
        )
        if duplicated:
            raise ModelRegistryError(3002, "Runtime profile name already exists")
        profile.name = name
    if llm_model_id is not None:
        profile.llm_model_id = llm_model_id
    if embedding_model_id is not None:
        profile.embedding_model_id = embedding_model_id
    if reranker_model_id is not None:
        profile.reranker_model_id = reranker_model_id
    if params is not None:
        provider_name = _provider_name_for_model(db, profile.llm_model_id)
        profile.params_json = json.dumps(
            _clip_params(provider_name or "", params), ensure_ascii=False
        )
    if is_default is not None:
        if is_default:
            _ensure_default_profile_uniqueness(db, profile_id=profile_id)
        profile.is_default = is_default

    db.commit()
    db.refresh(profile)
    return profile


def list_runtime_profiles(db: Session) -> list[LlmRuntimeProfile]:
    return db.query(LlmRuntimeProfile).order_by(LlmRuntimeProfile.updated_at.desc()).all()
