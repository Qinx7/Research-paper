"""项目设计 Agent —— 根据选定研究方向生成完整研究方案"""
import json

import httpx

from ..core.config import settings
from ..services.grounding_guard import sanitize_design_references

DESIGN_PROMPT = """你是一位资深研究生导师和科研项目评审专家。请根据以下信息，为研究生生成一份完整、可执行的研究项目设计方案。

## 用户研究需求
{requirement}

## 选定的研究方向
{direction}

## 文献分析摘要
{literature_context}

请生成一份完整的研究项目设计，以 JSON 格式返回：

{{
  "topic": "课题名称",
  "background": "研究背景（200字以内）",
  "significance": "研究意义，分理论和实践意义（150字以内）",
  "literature_review": {{
    "domestic": "国内研究现状概述（150字以内）",
    "international": "国际研究现状概述（150字以内）",
    "key_references": ["代表性文献1", "代表性文献2", "代表性文献3"]
  }},
  "current_gaps": ["现有研究不足1", "不足2", "不足3"],
  "objectives": ["研究目标1", "研究目标2"],
  "research_questions": ["研究问题1", "研究问题2"],
  "content": [
    {{
      "phase": "阶段名称",
      "tasks": ["具体任务1", "具体任务2"],
      "output": "阶段产出"
    }}
  ],
  "methods": ["研究方法1", "研究方法2"],
  "technical_route": ["步骤1", "步骤2", "步骤3", "步骤4", "步骤5", "步骤6", "步骤7", "步骤8"],
  "system_architecture": "系统架构描述或实验设计框架（150字以内，如不涉及则写'不适用'）",
  "data_sources": ["数据来源1", "数据来源2"],
  "evaluation_metrics": ["评价指标1", "评价指标2"],
  "innovation_points": ["创新点1", "创新点2"],
  "feasibility": "可行性分析（150字以内）",
  "timeline": [
    {{"phase": "阶段", "duration": "时长", "tasks": ["任务"]}}
  ],
  "expected_outputs": ["预期成果1", "预期成果2"],
  "references": ["参考文献格式示例1", "参考文献格式示例2"]
}}

要求：
1. 必须是开题阶段用语，用"拟开展""计划"等措辞，不能写出已完成的结果。
2. 技术路线要有具体步骤和执行逻辑，不能空泛。
3. 研究计划要符合研究生 1-2 年的实际周期。
4. 参考文献必须来自前面文献分析中提到的真实文献，不能编造。
5. 只返回 JSON，不要其他文字。"""


class ProjectDesignAgent:
    """项目设计 Agent —— 生成完整研究方案"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def generate_design(
        self,
        direction: dict,
        literature_analysis: dict | None = None,
        requirement: str = "",
    ) -> dict:
        """
        根据选定的研究方向生成完整项目设计方案。

        参数：
            direction: 选定的研究方向（来自 ResearchDirectionAgent 的输出）
            literature_analysis: 文献分析结果（可选，用于提供文献上下文）
            requirement: 用户原始研究需求

        返回：完整项目设计方案字典
        """
        if not self.api_key:
            return self._mock_design(direction)

        # 构建文献上下文
        lit_context = "无"
        if literature_analysis:
            lit_context = self._format_literature_context(literature_analysis)

        direction_text = json.dumps(direction, ensure_ascii=False, indent=2)
        prompt = DESIGN_PROMPT.format(
            requirement=requirement or "未指定",
            direction=direction_text,
            literature_context=lit_context,
        )

        try:
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "你是一位资深研究生导师，擅长指导科研项目设计。请始终以 JSON 格式回复。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4000,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return sanitize_design_references(self._parse_json(content), literature_analysis)
        except Exception:
            return self._mock_design(direction)

    def _format_literature_context(self, analysis: dict) -> str:
        """格式化文献分析为上下文"""
        parts = []
        if analysis.get("research_hotspots"):
            parts.append("研究热点：" + "；".join(analysis["research_hotspots"][:5]))
        if analysis.get("research_gaps"):
            parts.append("研究空白：" + "；".join(analysis["research_gaps"][:5]))
        if analysis.get("summaries"):
            refs = [f"{s.get('title','')[:50]} ({s.get('year','')})" for s in analysis["summaries"][:5]]
            parts.append("相关文献：" + "；".join(refs))
        return "\n".join(parts)

    def _parse_json(self, content: str) -> dict:
        """解析 LLM 返回的 JSON"""
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    def _mock_design(self, direction: dict) -> dict:
        """模拟项目设计"""
        return {
            "topic": direction.get("title", "未指定课题"),
            "background": "需配置 DeepSeek API Key 后获取真实项目设计。",
            "significance": "待生成",
            "literature_review": {"domestic": "待生成", "international": "待生成", "key_references": []},
            "current_gaps": [],
            "objectives": [],
            "research_questions": [],
            "content": [],
            "methods": [],
            "technical_route": [],
            "system_architecture": "待生成",
            "data_sources": [],
            "evaluation_metrics": [],
            "innovation_points": [],
            "feasibility": "待评估",
            "timeline": [],
            "expected_outputs": [],
            "references": [],
        }


# 单例
project_design_agent = ProjectDesignAgent()
