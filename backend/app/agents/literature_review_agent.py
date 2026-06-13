"""文献综述 Agent：对检索到的真实文献做结构化总结与研究空白分析。"""
import json
import re
from typing import Any

import httpx

from ..core.config import settings

SUMMARY_PROMPT = """你是一位资深学术文献审稿人，请对以下学术论文进行结构化总结。

论文信息：
- 标题：{title}
- 作者：{authors}
- 年份：{year}
- 来源：{venue}
- 摘要：{abstract}

请以 JSON 格式返回，包含以下字段：
{{
  "research_question": "该论文的核心研究问题，1句话",
  "method": "研究方法，1-2句话",
  "key_findings": "主要发现或结论，1-2句话",
  "innovation": "创新点，1句话",
  "limitations": "不足之处，1句话",
  "relevance": "对用户研究方向的参考价值，1句话",
  "quality_score": 评分，1-5分，整数
}}

要求：简洁精准，每项1-2句。只返回 JSON，不要返回其他文字。"""

GAP_ANALYSIS_PROMPT = """你是一位资深学术研究者，请根据以下多篇文献总结，分析该领域的研究热点和研究空白。

文献总结列表：
{summaries}

请以 JSON 格式返回：
{{
  "research_hotspots": ["当前研究热点1", "热点2"],
  "research_trends": ["发展趋势1", "趋势2"],
  "research_gaps": ["研究空白1", "空白2"],
  "recommended_entry_points": ["可切入的研究点1", "切入点2"]
}}

每个列表3-6项。只返回 JSON，不要返回其他文字。"""


class LiteratureReviewAgent:
    """文献综述 Agent。"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def analyze_papers(self, papers: list[dict] | None, research_requirement: str = "") -> dict:
        """对文献列表进行结构化分析。"""
        safe_papers = [paper for paper in (papers or []) if isinstance(paper, dict)]
        top_papers = safe_papers[:15]
        if not top_papers:
            return self._empty_analysis(total_papers=len(safe_papers), note="无文献可分析")

        if not self.api_key:
            return self._empty_analysis(
                total_papers=len(safe_papers),
                note="当前模型服务不可用，无法生成可靠文献分析。",
            )

        summaries = []
        for paper in top_papers:
            summary = self._summarize_single(paper)
            if summary:
                summaries.append(summary)

        gaps = self._analyze_gaps(summaries) if summaries else self._empty_gap_analysis()

        return {
            "total_papers": len(safe_papers),
            "analyzed_papers": len(summaries),
            "summaries": summaries,
            "research_hotspots": gaps.get("research_hotspots", []),
            "research_trends": gaps.get("research_trends", []),
            "research_gaps": gaps.get("research_gaps", []),
            "recommended_entry_points": gaps.get("recommended_entry_points", []),
        }

    def _summarize_single(self, paper: dict[str, Any]) -> dict | None:
        """单篇文献结构化总结；字段缺失时跳过坏字段，不中断整批分析。"""
        try:
            prompt = SUMMARY_PROMPT.format(
                title=self._safe_text(paper.get("title")),
                authors=", ".join(self._safe_authors(paper.get("authors"))[:5]),
                year=self._safe_text(paper.get("year"), default="?"),
                venue=self._safe_text(paper.get("venue"), default="未知"),
                abstract=self._safe_text(paper.get("abstract"), default="无摘要")[:800],
            )
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "你是一位学术文献分析专家。请始终以 JSON 格式回复。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.5,
                    "max_tokens": 800,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            result = self._parse_json(content)
            result["title"] = self._safe_text(paper.get("title"))
            result["year"] = paper.get("year")
            return result
        except Exception:
            return None

    def _analyze_gaps(self, summaries: list[dict]) -> dict:
        """综合多篇文献总结，分析研究热点和空白。"""
        if len(summaries) < 3:
            return self._empty_gap_analysis()

        summary_text = "\n\n".join(
            f"[{index + 1}] {self._safe_text(summary.get('title'))[:60]}\n"
            f"  创新: {self._safe_text(summary.get('innovation'))}\n"
            f"  不足: {self._safe_text(summary.get('limitations'))}"
            for index, summary in enumerate(summaries[:12])
        )
        prompt = GAP_ANALYSIS_PROMPT.format(summaries=summary_text)

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
                        {"role": "system", "content": "你是一位学术研究趋势分析专家。请始终以 JSON 格式回复。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.6,
                    "max_tokens": 1500,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return self._parse_json(content)
        except Exception:
            return self._empty_gap_analysis()

    def _parse_json(self, content: str) -> dict:
        """解析 LLM 返回的 JSON，兼容 ```json 代码块。"""
        content = (content or "").strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.IGNORECASE)
            content = re.sub(r"\s*```$", "", content)
        return json.loads(content)

    @staticmethod
    def _safe_text(value: Any, *, default: str = "") -> str:
        if value is None:
            return default
        text = str(value).strip()
        return text if text else default

    @classmethod
    def _safe_authors(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if isinstance(value, (list, tuple)):
            return [cls._safe_text(author) for author in value if cls._safe_text(author)]
        return [cls._safe_text(value)] if cls._safe_text(value) else []

    def _empty_gap_analysis(self) -> dict:
        """无可靠依据时返回空热点/空白结果，避免编造结论。"""
        return {
            "research_hotspots": [],
            "research_trends": [],
            "research_gaps": [],
            "recommended_entry_points": [],
        }

    def _empty_analysis(self, *, total_papers: int, note: str) -> dict:
        return {
            "total_papers": total_papers,
            "analyzed_papers": 0,
            "summaries": [],
            "research_hotspots": [],
            "research_trends": [],
            "research_gaps": [],
            "recommended_entry_points": [],
            "_note": note,
        }


literature_review_agent = LiteratureReviewAgent()
