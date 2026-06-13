"""聊天相关 Pydantic Schema"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ChatSendRequest(BaseModel):
    """发送消息请求"""
    message: str
    conversation_id: str | None = None  # 续接已有对话时传入
    search_enabled: bool = False
    research_mode: str = "quick_search"   # quick_search / literature_review / deep_research
    library_scope: str = "all"            # all / cn / en
    project_id: str | None = None         # 可选项目上下文


class SearchResultItem(BaseModel):
    """检索到的文献条目"""
    title: str
    authors: list[str]
    year: int | None
    venue: str | None
    abstract: str | None
    url: str | None
    citation_count: int
    source: str

    class Config:
        from_attributes = True


class ProjectContextItem(BaseModel):
    """项目私有资料证据条目"""
    kind: str
    title: str
    content_excerpt: str
    score: int
    action_url: str | None = None
    action_label: str | None = None


class SearchEvidenceBundle(BaseModel):
    """学术回答使用的证据包"""
    external_papers: list[SearchResultItem] = []
    project_context_items: list[ProjectContextItem] = []

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    """消息响应"""
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    search_results: SearchEvidenceBundle | list[SearchResultItem] | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    """对话列表响应"""
    id: UUID
    title: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    """对话详情（含消息列表）"""
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut]

    class Config:
        from_attributes = True
