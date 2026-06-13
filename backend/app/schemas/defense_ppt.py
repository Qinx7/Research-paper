"""答辩 PPT Schema"""
from pydantic import BaseModel, Field


# ---- 请求 ----

class GenerateDefensePPTRequest(BaseModel):
    draft_id: str = Field(..., description="论文草稿 ID")
    template: str = Field("academic_blue", description="PPT 风格模板 ID")


# ---- 响应 ----

class DefenseSlideInfo(BaseModel):
    page: int
    title: str
    content_type: str  # cover, section, content, card_list, numbered_list, ending
    description: str


class DefensePPTOutline(BaseModel):
    slides: list[DefenseSlideInfo]
    total_slides: int
    has_real_data: bool  # 是否有真实数据支撑实验/结果页


class GenerateDefensePPTResponse(BaseModel):
    success: bool
    filename: str | None = None
    download_url: str | None = None
    style_id: str | None = None
    style_name: str | None = None
    slide_count: int = 0
    has_real_data: bool = False


class DefenseScript(BaseModel):
    slides: list[dict]  # [{page, title, notes, duration_seconds}]
    total_duration_minutes: int
