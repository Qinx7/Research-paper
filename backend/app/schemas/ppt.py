"""PPT 生成相关 Schema"""
from pydantic import BaseModel


class GenerateProposalPPTRequest(BaseModel):
    """开题 PPT 生成请求"""
    design: dict = {}
    template: str = "academic_blue"


class PPTStyleOut(BaseModel):
    """PPT 风格元数据"""
    id: str
    name: str
    description: str
    scene: str
    is_default: bool = False
