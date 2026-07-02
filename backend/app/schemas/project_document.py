"""项目资料知识库相关 Schema。"""
from datetime import datetime
from uuid import UUID as UUIDType

from pydantic import BaseModel, field_validator


class OutcomeKnowledgeStatus(BaseModel):
    """成果文件解析入知识库后的状态响应。"""

    outcome_id: str
    status: str
    chunk_count: int = 0
    message: str
    error: str | None = None
    indexed_at: datetime | None = None
    parser: str | None = None
    strategy_chain: list[str] = []
    used_ocr: bool = False
    error_stage: str | None = None
    document_kind: str | None = None
    structured_fields: list[str] = []
    structured_confidence: dict = {}
    vector_status: str = "not_started"
    vector_count: int = 0
    vector_message: str = "尚未生成语义检索向量"

    @field_validator("outcome_id", mode="before")
    @classmethod
    def coerce_uuid(cls, value: object) -> str:
        if isinstance(value, UUIDType):
            return str(value)
        return str(value)
