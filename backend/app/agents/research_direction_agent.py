"""研究方向生成与评分 Agent —— 基于文献分析提出可开题方向"""
import json

import httpx

from ..core.config import settings

DIRECTION_PROMPT = """你是一位资深研究生导师，擅长根据文献分析结果为研究生提出可开题的研究方向。

## 用户研究需求
{requirement}

## 文献分析结果
### 研究热点
{hotspots}

### 研究空白
{gaps}

### 推荐切入点
{entry_points}

### 已有文献总结
{summaries}

请根据以上信息，提出 3-5 个可开题、可实施的研究方向。每个方向包含以下内容，以 JSON 数组格式返回：

[
  {{
    "title": "研究方向题目（25字以内）",
    "background": "研究背景（100字以内）",
    "research_questions": ["研究问题1", "研究问题2"],
    "objectives": ["研究目标1", "研究目标2"],
    "content": ["研究内容1", "研究内容2", "研究内容3"],
    "methods": ["研究方法1", "研究方法2"],
    "data_sources": ["数据来源1", "数据来源2"],
    "expected_outputs": ["预期成果1", "预期成果2"],
    "innovation": ["创新点1", "创新点2"],
    "feasibility": "可行性分析（50字以内）",
    "risks": ["风险1", "风险2"]
  }}
]

要求：
1. 方向必须紧密结合文献空白，避免与已有研究重复。
2. 研究内容要具体可操作，不能空泛。
3. 考虑研究生时间周期（1-2年）和技术可行性。
4. 只返回 JSON 数组，不要其他文字。"""

SCORING_PROMPT = """你是一位学术评审专家，请对以下研究方向进行多维度评分。

## 研究方向列表
{directions_json}

请从以下维度对每个方向评分（1-10的整数），以 JSON 数组格式返回：

[
  {{
    "title": "方向题目",
    "scores": {{
      "literature_foundation": 8,
      "innovation": 7,
      "feasibility": 6,
      "data_availability": 5,
      "thesis_value": 7,
      "overall": 7
    }}
  }}
]

每个字段的值必须是纯数字（整数），不要附带任何文字说明或理由。
只返回 JSON 数组，不要其他文字。"""


class ResearchDirectionAgent:
    """研究方向生成及评分 Agent"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def generate_directions(self, literature_analysis: dict, requirement: str = "") -> list[dict]:
        """
        根据文献分析结果生成 3-5 个可研究方向。

        参数：
            literature_analysis: 文献分析 Agent 的输出（含 hotspots/gaps/entry_points/summaries）
            requirement: 用户原始研究需求

        返回：研究方向列表
        """
        if not self.api_key:
            return []

        # 构建已有文献总结的简短文本
        summaries_text = self._format_summaries(literature_analysis.get("summaries", [])[:8])

        prompt = DIRECTION_PROMPT.format(
            requirement=requirement or "未指定",
            hotspots="\n".join(f"- {h}" for h in literature_analysis.get("research_hotspots", [])),
            gaps="\n".join(f"- {g}" for g in literature_analysis.get("research_gaps", [])),
            entry_points="\n".join(f"- {e}" for e in literature_analysis.get("recommended_entry_points", [])),
            summaries=summaries_text,
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
                        {"role": "system", "content": "你是一位资深研究生导师，擅长指导研究生选题。请始终以 JSON 格式回复。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.8,
                    "max_tokens": 4000,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            directions = self._parse_json(content)
            if isinstance(directions, list):
                return directions
        except Exception:
            pass
        return []

    def score_directions(self, directions: list[dict]) -> list[dict]:
        """
        对研究方向列表进行多维度评分。

        参数：
            directions: 研究方向列表

        返回：带评分的评分结果列表
        """
        if not directions:
            return []
        if not self.api_key:
            return []

        directions_json = json.dumps(directions, ensure_ascii=False, indent=2)
        prompt = SCORING_PROMPT.format(directions_json=directions_json)

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
                        {"role": "system", "content": "你是一位学术评审专家。请始终以 JSON 格式回复。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.5,
                    "max_tokens": 3000,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            scores = self._parse_json(content)
            if isinstance(scores, list):
                # 标准化评分值：防止 LLM 返回 {score, reason} 对象
                for s in scores:
                    if isinstance(s.get("scores"), dict):
                        for key in s["scores"]:
                            s["scores"][key] = self._normalize_score(s["scores"][key])
                return scores
        except Exception:
            pass
        return []

    def _format_summaries(self, summaries: list[dict]) -> str:
        """将文献总结格式化为简短文本"""
        lines = []
        for s in summaries[:8]:
            lines.append(
                f"- [{s.get('year','?')}] {s.get('title','')[:50]}\n"
                f"  创新: {s.get('innovation','N/A')}\n"
                f"  不足: {s.get('limitations','N/A')}"
            )
        return "\n".join(lines) if lines else "无文献总结"

    @staticmethod
    def _normalize_score(value) -> int:
        """将评分值标准化为整数。处理 LLM 可能返回的 {score, reason} 对象或纯数字。"""
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, dict):
            return int(value.get("score", value.get("overall", 5)))
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                pass
        return 5

    def _parse_json(self, content: str) -> dict | list:
        """解析 LLM 返回的 JSON"""
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

# 单例
research_direction_agent = ResearchDirectionAgent()
