"""成果管理 Agent —— 汇总分析项目成果，检查论文就绪状态"""
import json

import httpx

from ..core.config import settings

OUTCOME_SYSTEM_PROMPT = """你是一位研究生导师，擅长评估学生的项目成果是否足够撰写毕业论文。

你的任务是根据学生上传的项目成果列表，完成以下分析：

1. **成果汇总**：将所有成果按类型分类，简要描述每类成果的内容和价值。
2. **实验数据提取**：如果有 CSV/JSON 等实验数据，提取关键指标、样本量、主要发现。
3. **论文就绪检查**：判断现有成果是否足以支撑一篇完整的毕业论文。

论文就绪判断标准：
- 至少需要：系统设计文档或原型 + 实验/评估数据 + 文献基础
- 缺少实验数据时，只能写"实验设计方案"和"预期结果"，不能写"实验结果表明"
- 缺少系统实现时，第四章（系统实现）只能写设计方案

返回 JSON 格式：
{
  "summary_text": "整体成果汇总描述（2-3段）",
  "type_summary": {"成果类型": "简要描述", ...},
  "experiment_metrics": {"关键指标名": "值或描述", ...} 或 null,
  "ready_for_paper": true/false,
  "completeness_score": 0-100,
  "available_for_chapters": ["chapter_4_implementation", "chapter_5_experiment", ...],
  "missing_for_chapters": ["chapter_5_experiment", ...],
  "missing_items": ["缺少的实验数据类型", ...],
  "suggestion": "针对缺失项的具体建议（2-3句话）"
}

注意：
- 如果没有任何成果，completeness_score 设为 0
- 只返回 JSON，不要包含其他文字
"""


class OutcomeAgent:
    """项目成果分析 Agent"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def _call_llm(self, system_prompt: str, user_message: str, max_tokens: int = 2000) -> dict:
        """调用 LLM 并解析 JSON 响应"""
        if not self.api_key:
            return self._mock_response(user_message)

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
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.5,
                    "max_tokens": max_tokens,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return self._parse_json(content)
        except Exception:
            return self._mock_response(user_message)

    @staticmethod
    def _parse_json(content: str) -> dict:
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    @staticmethod
    def _mock_response(_user_message: str) -> dict:
        return {
            "summary_text": "（DEEPSEEK_API_KEY 未配置，返回模拟分析结果）",
            "type_summary": {},
            "experiment_metrics": None,
            "ready_for_paper": False,
            "completeness_score": 0,
            "available_for_chapters": [],
            "missing_for_chapters": [],
            "missing_items": [],
            "suggestion": "请配置 DEEPSEEK_API_KEY 后重试。",
        }

    def summarize_outcomes(self, outcomes: list[dict]) -> dict:
        """汇总项目所有成果，返回结构化分析"""
        if not outcomes:
            return {
                "summary_text": "该项目暂无上传成果。请先上传系统原型、实验数据、截图等项目成果。",
                "type_summary": {},
                "experiment_metrics": None,
                "ready_for_paper": False,
                "completeness_score": 0,
                "available_for_chapters": [],
                "missing_for_chapters": ["chapter_4_implementation", "chapter_5_experiment"],
                "missing_items": ["系统实现成果", "实验数据", "评估结果"],
                "suggestion": "建议先上传系统原型或代码、实验数据（CSV/JSON）、系统截图和评估结果，再开始论文写作。",
            }

        outcomes_text = "\n".join([
            f"- [{o.get('outcome_type', 'other')}] {o.get('name', '未命名')}: {o.get('description', '无描述')}"
            for o in outcomes
        ])
        user_message = f"以下是项目的所有成果列表：\n\n{outcomes_text}\n\n请对这些成果进行分析，判断是否足够撰写毕业论文。"
        return self._call_llm(OUTCOME_SYSTEM_PROMPT, user_message, max_tokens=2000)

    def analyze_experiment_data(self, file_path: str, file_content_preview: str) -> dict:
        """分析实验数据文件，提取关键指标"""
        # 构造预览文本，限制长度
        preview = file_content_preview[:3000] if file_content_preview else "（无法读取文件内容）"
        user_message = f"""请分析以下实验数据文件的内容：

文件路径：{file_path}

内容预览：
{preview}

请提取关键指标和主要发现，以 JSON 格式返回：
{{
  "file_type": "csv/json/excel/other",
  "sample_size": 样本量或null,
  "key_metrics": [{{"name": "指标名", "value": "值或描述"}}, ...],
  "main_findings": ["主要发现1", ...],
  "data_quality": "good/moderate/poor/unknown",
  "usable_for_paper": true/false,
  "notes": "备注"
}}"""
        return self._call_llm(
            "你是一位数据分析专家。请从实验数据中提取关键信息。只返回 JSON，不要包含其他文字。",
            user_message,
            max_tokens=1500,
        )

    def suggest_paper_ready(self, outcomes: list[dict]) -> dict:
        """检查成果是否足够写论文（summarize_outcomes 的便捷别名，侧重就绪判断）"""
        result = self.summarize_outcomes(outcomes)
        return {
            "ready": result.get("ready_for_paper", False),
            "score": result.get("completeness_score", 0),
            "available_types": list(result.get("type_summary", {}).keys()),
            "missing_types": result.get("missing_items", []),
            "suggestion": result.get("suggestion", ""),
        }


outcome_agent = OutcomeAgent()
