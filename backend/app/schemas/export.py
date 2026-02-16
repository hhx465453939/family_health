from pydantic import BaseModel, Field


class ExportCreateRequest(BaseModel):
    member_scope: str = Field(default="global", min_length=1, max_length=36)
    export_types: list[str] = Field(default_factory=list)
    include_raw_file: bool = False
    include_sanitized_text: bool = True
    filters: dict = Field(default_factory=dict)
