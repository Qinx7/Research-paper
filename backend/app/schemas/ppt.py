"""PPT 生成相关 Schema"""
from pydantic import BaseModel
from typing import Optional


class GenerateProposalPPTRequest(BaseModel):
    """开题 PPT 生成请求"""
    design: dict = {}
    template: str = "academic_blue"


class GenerateHtmlDeckRequest(BaseModel):
    """HTML deck 生成请求"""
    deck_title: Optional[str] = None
    slides_outline: list[dict] = []
    theme: str = "paper"
    draft_id: Optional[str] = None
    proposal_id: Optional[str] = None


class PPTStyleOut(BaseModel):
    """PPT 风格元数据"""
    id: str
    name: str
    description: str
    scene: str
    is_default: bool = False


class HtmlDeckArtifactOut(BaseModel):
    """HTML deck 产物信息"""
    artifact_type: str
    title: str
    object_key: str
    filename: str
    theme: str
    slide_count: int
    preview_url: str
    download_url: str
