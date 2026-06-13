"""Agent 调用 API 路由"""
from pydantic import BaseModel
from fastapi import APIRouter

from ..agents.requirement_agent import requirement_agent


class RequirementRequest(BaseModel):
    requirement: str


router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/analyze-requirement")
def analyze_requirement(payload: RequirementRequest):
    """
    需求理解：输入一段模糊研究需求，输出结构化研究画像。

    请求体：`{"requirement": "我是教育技术专业研究生，想研究大语言模型在高校教学中的应用"}`
    """
    result = requirement_agent.analyze(payload.requirement)
    return {"requirement": payload.requirement, "analysis": result}
