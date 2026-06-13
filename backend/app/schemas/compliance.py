"""学术合规检查 Schema —— 检查结果与用户确认"""
from datetime import datetime
from pydantic import BaseModel, Field


class ComplianceIssue(BaseModel):
    issue_type: str = Field(..., description="data_fabrication | fake_reference | missing_marker | suspicious_statistic | ai_flag")
    severity: str = Field(..., description="error | warning | info")
    chapter_key: str = Field(..., description="所属章节标识")
    location: str = Field("", description="文本位置描述")
    description: str = Field(..., description="问题描述")
    snippet: str | None = Field(None, description="相关文本片段")
    suggestion: str = Field("", description="修正建议")
    user_action: str | None = Field(None, description="用户操作：accept | ignore | fixed")
    confirmed_at: str | None = Field(None, description="确认时间 ISO 字符串")


class ChapterCompliance(BaseModel):
    chapter_key: str
    passed: bool = False
    issues: list[ComplianceIssue] = []
    confirmed: bool = False
    confirmed_at: str | None = None


class ComplianceResult(BaseModel):
    draft_id: str
    overall_score: int = 100
    passed: bool = True
    chapters: dict[str, ChapterCompliance] = {}
    checked_at: str | None = None


class ComplianceConfirmRequest(BaseModel):
    chapter_key: str = Field(..., description="章节标识")
    issue_index: int = Field(..., description="issues 列表中的索引")
    action: str = Field(..., description="accept | ignore | fixed")
