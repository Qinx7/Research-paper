"""需求理解 Agent —— 将模糊研究需求提取为结构化研究画像"""
import json

import httpx

from ..core.config import settings

SYSTEM_PROMPT = """你是一位资深研究生导师，擅长帮助学生把模糊的研究想法转化为清晰的研究课题。

用户会用中文描述自己的研究兴趣和需求，请你从中提取结构化信息，以 JSON 格式返回。

返回格式：
{
  "research_field": "研究领域（如：教育技术、计算机科学、医学信息学等）",
  "core_technologies": ["核心技术列表", "如：大语言模型、RAG"],
  "application_scenarios": ["应用场景列表", "如：高校教学、课程问答"],
  "possible_subjects": ["可能研究对象", "如：高校学生、某门课程"],
  "possible_methods": ["可能研究方法", "如：文献综述法、系统设计法、实验对比法"],
  "suitable_outputs": ["适合成果形式", "如：系统原型、毕业论文、开题PPT"],
  "keywords_cn": ["中文关键词"],
  "keywords_en": ["英文关键词"],
  "preliminary_suggestions": "初步研究建议（2-3句话）"
}

要求：
1. 如果用户没有提及某项，字段留空数组或空字符串，不要编造。
2. 中文关键词控制在 5-10 个，英文关键词对应翻译。
3. 初步研究建议要具体，结合用户描述给出可操作的建议。
4. 只返回 JSON，不要包含任何其他文字。"""


class RequirementAgent:
    """研究需求理解 Agent"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def analyze(self, user_requirement: str) -> dict:
        """分析用户需求，返回结构化研究画像"""
        if not self.api_key:
            return self._mock_analyze(user_requirement)

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
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_requirement},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2000,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return self._parse_response(content)
        except Exception:
            return self._mock_analyze(user_requirement)

    def _parse_response(self, content: str) -> dict:
        """解析 LLM 返回的 JSON"""
        # 去掉可能的 markdown 代码块标记
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            # 去掉第一行和最后一行 ```
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    def _mock_analyze(self, user_requirement: str) -> dict:
        """无 API Key 时的本地模拟分析"""
        return {
            "research_field": "",
            "core_technologies": [],
            "application_scenarios": [],
            "possible_subjects": [],
            "possible_methods": [],
            "suitable_outputs": [],
            "keywords_cn": [],
            "keywords_en": [],
            "preliminary_suggestions": "",
            "_note": "DEEPSEEK_API_KEY 未配置，返回模拟结果。请在 .env 中配置后重试。",
        }


# 单例
requirement_agent = RequirementAgent()
