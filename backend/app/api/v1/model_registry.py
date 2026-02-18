import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.response import error, ok, trace_id_from_request
from app.models.llm_runtime_profile import LlmRuntimeProfile
from app.models.model_catalog import ModelCatalog
from app.models.model_provider import ModelProvider
from app.models.user import User
from app.schemas.model_registry import (
    ProviderCreateRequest,
    ProviderUpdateRequest,
    RefreshModelsRequest,
    RuntimeProfileCreateRequest,
    RuntimeProfileUpdateRequest,
)
from app.services.model_registry_service import (
    ModelRegistryError,
    create_provider,
    create_runtime_profile,
    delete_provider,
    list_provider_presets,
    list_catalog,
    list_providers,
    list_runtime_profiles,
    refresh_models,
    update_provider,
    update_runtime_profile,
)

router = APIRouter()


def _provider_to_dict(row: ModelProvider) -> dict:
    return {
        "id": row.id,
        "provider_name": row.provider_name,
        "base_url": row.base_url,
        "enabled": row.enabled,
        "last_refresh_at": row.last_refresh_at.isoformat() if row.last_refresh_at else None,
        "updated_at": row.updated_at.isoformat(),
    }


def _catalog_to_dict(row: ModelCatalog) -> dict:
    return {
        "id": row.id,
        "provider_id": row.provider_id,
        "model_name": row.model_name,
        "model_type": row.model_type,
        "capabilities": json.loads(row.capabilities_json),
        "updated_at": row.updated_at.isoformat(),
    }


def _runtime_profile_to_dict(row: LlmRuntimeProfile) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "llm_model_id": row.llm_model_id,
        "embedding_model_id": row.embedding_model_id,
        "reranker_model_id": row.reranker_model_id,
        "params": json.loads(row.params_json),
        "is_default": row.is_default,
        "updated_at": row.updated_at.isoformat(),
    }


@router.post("/model-providers")
def create_provider_api(
    payload: ProviderCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_provider(
            db,
            user_id=user.id,
            provider_name=payload.provider_name,
            base_url=payload.base_url,
            api_key=payload.api_key,
            enabled=payload.enabled,
        )
    except ModelRegistryError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(_provider_to_dict(row), trace_id)


@router.get("/model-providers")
def list_provider_api(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": [_provider_to_dict(row) for row in list_providers(db, user_id=user.id)]}, trace_id)


@router.get("/model-provider-presets")
def list_provider_presets_api(
    request: Request,
    _: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    return ok({"items": list_provider_presets()}, trace_id)


@router.patch("/model-providers/{provider_id}")
def update_provider_api(
    provider_id: str,
    payload: ProviderUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        row = update_provider(
            db,
            user_id=user.id,
            provider_id=provider_id,
            base_url=payload.base_url,
            api_key=payload.api_key,
            enabled=payload.enabled,
        )
    except ModelRegistryError as exc:
        status_code = 400 if exc.code == 3004 else 404
        return error(exc.code, exc.message, trace_id, status_code=status_code)
    return ok(_provider_to_dict(row), trace_id)


@router.delete("/model-providers/{provider_id}")
def delete_provider_api(
    provider_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        delete_provider(db, user_id=user.id, provider_id=provider_id)
    except ModelRegistryError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"deleted": True}, trace_id)


@router.post("/model-providers/{provider_id}/refresh-models")
def refresh_models_api(
    provider_id: str,
    payload: RefreshModelsRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        rows = refresh_models(
            db,
            user_id=user.id,
            provider_id=provider_id,
            manual_models=payload.manual_models,
        )
    except ModelRegistryError as exc:
        return error(exc.code, exc.message, trace_id, status_code=404)
    return ok({"items": [_catalog_to_dict(row) for row in rows]}, trace_id)


@router.get("/model-catalog")
def list_catalog_api(
    request: Request,
    provider_id: str | None = None,
    model_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    rows = list_catalog(db, user_id=user.id, provider_id=provider_id, model_type=model_type)
    return ok({"items": [_catalog_to_dict(row) for row in rows]}, trace_id)


@router.post("/runtime-profiles")
def create_runtime_profile_api(
    payload: RuntimeProfileCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        row = create_runtime_profile(
            db,
            user_id=user.id,
            name=payload.name,
            llm_model_id=payload.llm_model_id,
            embedding_model_id=payload.embedding_model_id,
            reranker_model_id=payload.reranker_model_id,
            params=payload.params,
            is_default=payload.is_default,
        )
    except ModelRegistryError as exc:
        return error(exc.code, exc.message, trace_id, status_code=400)
    return ok(_runtime_profile_to_dict(row), trace_id)


@router.patch("/runtime-profiles/{profile_id}")
def update_runtime_profile_api(
    profile_id: str,
    payload: RuntimeProfileUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    try:
        row = update_runtime_profile(
            db,
            user_id=user.id,
            profile_id=profile_id,
            name=payload.name,
            llm_model_id=payload.llm_model_id,
            embedding_model_id=payload.embedding_model_id,
            reranker_model_id=payload.reranker_model_id,
            params=payload.params,
            is_default=payload.is_default,
        )
    except ModelRegistryError as exc:
        status_code = 404 if exc.code == 3003 else 400
        return error(exc.code, exc.message, trace_id, status_code=status_code)
    return ok(_runtime_profile_to_dict(row), trace_id)


@router.get("/runtime-profiles")
def list_runtime_profile_api(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trace_id = trace_id_from_request(request)
    rows = list_runtime_profiles(db, user_id=user.id)
    return ok({"items": [_runtime_profile_to_dict(row) for row in rows]}, trace_id)
