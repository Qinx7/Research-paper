"""论文写作 Agent：负责大纲、章节、摘要、修订等核心生成能力。"""
import json
import logging
import re

import httpx

from ..core.config import settings
from ..schemas.draft import PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS

logger = logging.getLogger(__name__)

OUTLINE_SYSTEM_PROMPT = """你是一位学术论文写作导师。请基于项目背景、成果摘要和文献上下文，生成一份结构完整的毕业论文大纲。

要求：
1. 论文默认 6 章：绪论、理论基础、需求与设计、系统实现、实验与结果、总结与展望。
2. 每章给出 3-5 个小节，并为每个小节写一句话说明。
3. 标题需要具体，不要空泛。
4. 如果项目缺少真实实验数据，第五章应偏向实验设计和预期结果，不要伪造实验结论。
5. 返回 JSON：
{
  "suggested_title": "...",
  "chapters": [{"key":"...","title":"...","subsections":[{"title":"...","description":"..."}]}],
  "notes": "..."
}
只返回 JSON。"""

CHAPTER_SYSTEM_PROMPT = """你是一位学术论文写作专家。请根据给定的大纲、成果和文献上下文，生成论文单章节内容。

约束：
1. 不允许伪造实验结果、统计数值或文献条目。
2. 第一章允许输出 citations；第二章到第六章的 citations 应尽量为空，除非明确要求。
3. 如果证据不足，只能写审慎描述、方案设计或预期结果。
4. 返回 JSON：
{
  "chapter_key": "...",
  "title": "...",
  "content": "...",
  "citations": ["..."],
  "data_based": false
}
只返回 JSON。"""

ABSTRACT_SYSTEM_PROMPT = """你是一位学术论文写作专家。请根据论文全文内容生成中英文摘要和关键词。

返回 JSON：
{
  "abstract_cn": "...",
  "abstract_en": "...",
  "keywords_cn": ["..."],
  "keywords_en": ["..."]
}
只返回 JSON。"""

REVISION_SYSTEM_PROMPT = """你是一位学术论文修订助手。请根据章节原文、问题清单、关注点和证据上下文，对章节进行定向修订。

要求：
1. 保留原章节主题，不要改成别的章节。
2. 如果缺少真实数据依据，不要编造数据结果，只能改成谨慎描述。
3. 如果需要补文献，只能提示“需补充相关文献支撑”，不要编造具体文献。
4. 返回 JSON：
{
  "chapter_key": "...",
  "title": "...",
  "content": "...",
  "change_summary": ["..."],
  "resolved_issues": ["..."],
  "citations": ["..."],
  "data_based": false
}
只返回 JSON。"""

FULL_REVISION_SYSTEM_PROMPT = """你是一位学术论文整体修订助手。请根据整篇论文原文、审查问题、关注点和证据上下文，对全文做轻量整体修订。
要求：
1. 保留原有章节标题层级，尤其保留以“## ”开头的章节标题，便于系统回写章节。
2. 不要编造实验数据、统计数值、文献条目或不存在的项目成果。
3. 如果缺少真实证据，只能弱化结论、补充待验证说明或提示需要补充材料。
4. 不要重写成全新的论文，只处理审查问题、章节衔接、重复表述和明显风险表述。
5. 返回 JSON：
{
  "title": "...",
  "full_text": "...",
  "change_summary": ["..."],
  "resolved_issues": ["..."],
  "remaining_issues": ["..."]
}
只返回 JSON。"""

SUGGEST_REFS_SYSTEM_PROMPT = """你是一位学术论文审稿人。请检查论文内容和已有文献，给出建议补充的参考文献方向。

返回 JSON：
{
  "suggested_references": [{"title":"...","reason":"...","section":"..."}],
  "notes": "..."
}
只返回 JSON。"""


class PaperWritingAgent:
    """论文写作 Agent。"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def _call_llm(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 4000,
        timeout: float = 180.0,
    ) -> dict:
        """调用 LLM 并解析 JSON；失败时返回 mock 标记。"""
        if not self.api_key:
            return self._mock_json(user_message)

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
                    "temperature": 0.4,
                    "max_tokens": max_tokens,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return self._parse_json(content)
        except Exception as exc:
            logger.warning("论文 Agent LLM 调用失败: %s", exc)
            return self._mock_json(user_message)

    @staticmethod
    def _parse_json(content: str) -> dict:
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    @staticmethod
    def _mock_json(_user_message: str) -> dict:
        return {"_mock": True, "_note": "DEEPSEEK_API_KEY 未配置，返回模拟结果"}

    def build_writing_plan(
        self,
        project_context: str,
        outcomes_summary: str,
        literature_context: str = "",
    ) -> dict:
        """生成最小写作计划。"""
        has_outcomes = bool((outcomes_summary or "").strip()) and "暂无上传成果" not in (outcomes_summary or "")
        has_literature = bool((literature_context or "").strip())

        evidence_gaps: list[str] = []
        risks: list[str] = []
        recommended_structure = [
            "第一章 绪论",
            "第二章 相关理论与技术基础",
            "第三章 系统需求分析与总体设计",
            "第四章 系统实现",
            "第五章 实验设计与结果分析",
            "第六章 总结与展望",
        ]

        if not has_outcomes:
            evidence_gaps.append("缺少可直接支撑系统实现与实验分析的项目成果")
            risks.append("第五章可能只能写实验设计与预期结果，不能写真实实验结论")
        if not has_literature:
            evidence_gaps.append("缺少可用于绪论和研究现状部分的文献上下文")
            risks.append("第一章研究现状与问题定义可能不够扎实")

        notes = "已有基本写作依据，可先生成大纲，再按章节逐步写作。" if not evidence_gaps else "建议优先补足证据缺口，再推进依赖真实材料的章节。"

        return {
            "goal": "形成可验证依据支撑的论文写作计划",
            "recommended_structure": recommended_structure,
            "evidence_gaps": evidence_gaps,
            "risks": risks,
            "notes": notes,
        }

    def generate_outline(
        self,
        project_context: str,
        outcomes_summary: str,
        literature_context: str = "",
    ) -> dict:
        """生成论文大纲。"""
        user_message = (
            f"## 项目背景\n{project_context}\n\n"
            f"## 项目成果摘要\n{outcomes_summary or '暂无上传成果'}\n\n"
            f"## 文献上下文\n{literature_context or '暂无文献分析数据'}"
        )
        result = self._call_llm(OUTLINE_SYSTEM_PROMPT, user_message, max_tokens=4000)
        if result.get("_mock"):
            return {
                "suggested_title": "毕业论文",
                "chapters": [
                    {
                        "key": key,
                        "title": PAPER_CHAPTER_LABELS.get(key, key),
                        "subsections": [{"title": f"{index + 1}. 小节标题", "description": "小节描述"} for index in range(3)],
                    }
                    for key in PAPER_CHAPTER_KEYS
                ],
                "notes": "（需配置 DeepSeek API Key 后生成真实大纲）",
            }
        return result

    def generate_full_draft(
        self,
        project_context: str,
        outcomes_summary: str,
        literature_context: str = "",
        existing_outline: dict | None = None,
        existing_chapters: dict | None = None,
    ) -> dict:
        """生成完整初稿，保留已手工编辑章节。"""
        outline = existing_outline or self.generate_outline(
            project_context=project_context,
            outcomes_summary=outcomes_summary,
            literature_context=literature_context,
        )

        chapters_content = dict(existing_chapters or {})
        generated_chapters: list[str] = []
        skipped_chapters: list[str] = []

        for chapter_key in PAPER_CHAPTER_KEYS:
            current = chapters_content.get(chapter_key)
            if (
                isinstance(current, dict)
                and str(current.get("content") or "").strip()
                and str(current.get("status") or "") in {"edited", "final"}
            ):
                skipped_chapters.append(chapter_key)
                continue

            result = self.generate_chapter(
                chapter_key=chapter_key,
                outline=outline,
                outcomes_summary=outcomes_summary,
                literature_context=literature_context,
                existing_chapters=chapters_content,
            )
            chapters_content[chapter_key] = {
                "title": result.get("title", PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)),
                "content": result.get("content", ""),
                "status": "generated",
                "citations": result.get("citations", []),
                "data_based": result.get("data_based", False),
            }
            generated_chapters.append(chapter_key)

        return {
            "suggested_title": outline.get("suggested_title", "毕业论文"),
            "generated_chapters": generated_chapters,
            "skipped_chapters": skipped_chapters,
            "outline": outline,
            "content": chapters_content,
        }

    def review_chapter(
        self,
        chapter_key: str,
        chapter_title: str,
        chapter_content: str,
        citations: list[str] | None = None,
        evidence_context: str = "",
    ) -> dict:
        """对当前章节做规则型审查。"""
        citations = citations or []
        issues = []
        focus_areas = []
        content_text = (chapter_content or "").strip()

        if len(content_text) < 300:
            issues.append({
                "severity": "warning",
                "title": "内容偏短",
                "detail": "当前章节篇幅较短，可能不足以完整支撑该章节目标。",
                "suggestion": "补充章节背景、方法说明或实现细节。",
            })
            focus_areas.append("内容完整性")

        if chapter_key == "chapter_1_introduction" and not citations:
            issues.append({
                "severity": "warning",
                "title": "绪论缺少文献引用",
                "detail": "第一章通常需要研究现状与问题背景支撑，当前未检测到 citations。",
                "suggestion": "补充真实文献或证据卡片引用。",
            })
            focus_areas.append("文献依据")
        elif chapter_key == "chapter_1_introduction" and len(citations) < 2:
            issues.append({
                "severity": "info",
                "title": "绪论文献支撑偏少",
                "detail": "当前绪论已包含引用，但数量偏少，研究现状部分可能支撑不足。",
                "suggestion": "补充更多与研究背景直接相关的真实文献。",
            })
            focus_areas.append("文献依据")

        if "暂无上传成果" in evidence_context or "当前只有系统截图" in evidence_context:
            issues.append({
                "severity": "warning",
                "title": "证据基础偏弱",
                "detail": "当前项目证据材料较少，章节中的结论和实现说明可能支撑不足。",
                "suggestion": "补充成果文件、内部证据或文献后再完善本章。",
            })
            focus_areas.append("证据支撑")

        repetitive_markers = ["首先", "其次", "最后"]
        repetition_count = sum(content_text.count(marker) for marker in repetitive_markers)
        if repetition_count >= 5:
            issues.append({
                "severity": "info",
                "title": "表述节奏单一",
                "detail": "章节中重复使用相似过渡词，阅读体验较单一。",
                "suggestion": "调整段落组织方式，减少重复口头连接词。",
            })
            focus_areas.append("表达质量")

        has_numeric_claim = any(token in content_text for token in ["%", "提升", "降低", "达到", "显著优于", "准确率", "召回率"])
        if has_numeric_claim and ("暂无上传成果" in evidence_context or "当前只有系统截图" in evidence_context):
            issues.append({
                "severity": "warning",
                "title": "数据性表述存在风险",
                "detail": "当前章节出现了量化结果或效果对比表述，但证据上下文不足以支撑这些结论。",
                "suggestion": "删除无依据数据表述，或补充真实实验结果、图表和成果材料。",
            })
            focus_areas.append("数据依据")

        structure_rules = {
            "chapter_3_design": {
                "markers": ["需求", "设计", "架构"],
                "severity": "info",
                "title": "设计章节结构可能缺项",
                "detail": "第三章通常需要同时覆盖需求分析、总体设计和系统架构承接。",
            },
            "chapter_4_implementation": {
                "markers": ["实现", "模块", "流程"],
                "severity": "info",
                "title": "实现章节结构可能缺项",
                "detail": "第四章通常需要说明核心模块实现方式、关键流程和实现细节。",
            },
            "chapter_5_experiment": {
                "markers": ["实验", "结果", "分析"],
                "severity": "warning",
                "title": "实验章节结构可能缺项",
                "detail": "第五章通常需要同时说明实验设置、结果展示和结果分析，缺一会削弱说服力。",
            },
        }
        structure_rule = structure_rules.get(chapter_key)
        if structure_rule:
            expected_markers = structure_rule["markers"]
            matched_count = sum(1 for marker in expected_markers if marker in content_text)
            if matched_count < len(expected_markers):
                issues.append({
                    "severity": structure_rule["severity"],
                    "title": structure_rule["title"],
                    "detail": structure_rule["detail"],
                    "suggestion": f"补充与“{' / '.join(expected_markers)}”相关的小节或正文说明。",
                })
                focus_areas.append("章节结构")

        if chapter_key == "chapter_5_experiment" and not any(token in content_text for token in ["指标", "对比", "基线", "评价"]):
            issues.append({
                "severity": "warning",
                "title": "实验评价要素不足",
                "detail": "第五章缺少常见的实验评价信息，如评价指标、对比基线或对比方案。",
                "suggestion": "补充评价指标、对比对象和实验设置说明。",
            })
            focus_areas.append("实验设计")

        if chapter_key == "chapter_4_implementation" and not any(token in content_text for token in ["接口", "模块", "流程图", "时序"]):
            issues.append({
                "severity": "info",
                "title": "实现细节描述偏少",
                "detail": "第四章缺少能体现实现过程的模块、接口或流程性说明。",
                "suggestion": "补充模块职责、接口设计或关键流程描述。",
            })
            focus_areas.append("实现细节")

        if chapter_key == "chapter_3_design" and not any(token in content_text for token in ["功能", "非功能", "用例", "需求"]):
            issues.append({
                "severity": "info",
                "title": "需求分析承接不足",
                "detail": "第三章中尚未体现明显的需求分析内容，设计前提可能不够清晰。",
                "suggestion": "补充功能需求、非功能需求或用例分析。",
            })
            focus_areas.append("需求分析")

        summary = (
            "当前章节结构和依据情况基本可接受，可以进入下一步润色或整合。"
            if not issues
            else "当前章节存在需要处理的问题，建议先按问题清单补强。"
        )

        return {
            "chapter_key": chapter_key,
            "passed": len([item for item in issues if item["severity"] in {"warning", "error"}]) == 0,
            "summary": summary,
            "issues": issues,
            "focus_areas": list(dict.fromkeys(focus_areas)),
        }

    def revise_chapter(
        self,
        chapter_key: str,
        chapter_title: str,
        chapter_content: str,
        issues: list[dict] | None = None,
        focus_areas: list[str] | None = None,
        citations: list[str] | None = None,
        evidence_context: str = "",
    ) -> dict:
        """定向修订章节：优先使用 LLM，失败时回退到规则型修订。"""
        issues = issues or []
        focus_areas = focus_areas or []
        citations = citations or []

        if self.api_key:
            issue_lines = []
            for issue in issues:
                if not isinstance(issue, dict):
                    continue
                issue_lines.append(
                    f"- [{issue.get('severity', 'info')}] {issue.get('title', '')}: "
                    f"{issue.get('detail', '')}；建议：{issue.get('suggestion', '')}"
                )
            issue_text = "\n".join(issue_lines) or "- 无明确问题，但仍需按关注点优化表述"
            focus_text = "、".join([str(item).strip() for item in focus_areas if str(item).strip()]) or "无"
            citations_text = "、".join([str(item).strip() for item in citations if str(item).strip()]) or "无"
            user_message = (
                f"## 章节标识\n{chapter_key}\n\n"
                f"## 章节标题\n{chapter_title}\n\n"
                f"## 当前章节内容\n{chapter_content}\n\n"
                f"## 审查问题\n{issue_text}\n\n"
                f"## 关注点\n{focus_text}\n\n"
                f"## 当前 citations\n{citations_text}\n\n"
                f"## 证据上下文\n{evidence_context or '无'}"
            )
            llm_result = self._call_llm(REVISION_SYSTEM_PROMPT, user_message, max_tokens=4000, timeout=180.0)
            if not llm_result.get("_mock"):
                return {
                    "chapter_key": llm_result.get("chapter_key", chapter_key),
                    "title": llm_result.get("title", chapter_title),
                    "content": llm_result.get("content", chapter_content),
                    "change_summary": llm_result.get("change_summary", []),
                    "resolved_issues": llm_result.get("resolved_issues", []),
                    "citations": llm_result.get("citations", citations),
                    "data_based": llm_result.get("data_based", False),
                }

        revised = (chapter_content or "").strip()
        change_summary: list[str] = []
        resolved_issues: list[str] = []
        issue_titles = [str(item.get("title", "")).strip() for item in issues if isinstance(item, dict)]

        if "数据性表述存在风险" in issue_titles:
            for risky_token in ["显著优于基线方法", "准确率达到98.7%", "响应时间降低42%"]:
                if risky_token in revised:
                    revised = revised.replace(risky_token, "在当前证据条件下，相关效果仍需进一步通过真实实验结果验证")
            revised += "\n\n为避免无依据的数据性表述，本节将相关效果结论调整为待验证描述，并建议在补充真实实验结果后再形成定量结论。"
            change_summary.append("弱化了无依据的数据性表述")
            resolved_issues.append("数据性表述存在风险")

        if "设计章节结构可能缺项" in issue_titles or "需求分析承接不足" in issue_titles:
            revised += "\n\n在需求分析层面，需进一步明确系统的功能需求、非功能需求以及关键业务场景，用于支撑后续总体设计与架构决策。"
            change_summary.append("补充了需求分析承接内容")
            if "设计章节结构可能缺项" in issue_titles:
                resolved_issues.append("设计章节结构可能缺项")
            if "需求分析承接不足" in issue_titles:
                resolved_issues.append("需求分析承接不足")

        if "实现章节结构可能缺项" in issue_titles or "实现细节描述偏少" in issue_titles:
            revised += "\n\n在实现层面，建议进一步说明核心模块职责、接口调用关系以及关键流程，以体现系统落地实现的完整性。"
            change_summary.append("补充了实现细节与模块承接")
            if "实现章节结构可能缺项" in issue_titles:
                resolved_issues.append("实现章节结构可能缺项")
            if "实现细节描述偏少" in issue_titles:
                resolved_issues.append("实现细节描述偏少")

        if "实验章节结构可能缺项" in issue_titles or "实验评价要素不足" in issue_titles:
            revised += "\n\n在实验部分，需补充实验设置、评价指标、对比基线与结果分析，以保证实验章节具备完整的论证链路。"
            change_summary.append("补充了实验设置与评价要素提示")
            if "实验章节结构可能缺项" in issue_titles:
                resolved_issues.append("实验章节结构可能缺项")
            if "实验评价要素不足" in issue_titles:
                resolved_issues.append("实验评价要素不足")

        if "绪论缺少文献引用" in issue_titles and not citations:
            revised += "\n\n此外，绪论部分仍需补充与研究背景、研究现状直接相关的真实文献，以增强问题提出与研究价值论证的可信度。"
            change_summary.append("提示补充绪论文献引用")
            resolved_issues.append("绪论缺少文献引用")

        if not change_summary:
            revised += "\n\n根据当前审查结果，已对章节表述进行了轻量整理，建议结合真实材料继续人工复核。"
            change_summary.append("完成了轻量文字整理")

        return {
            "chapter_key": chapter_key,
            "title": chapter_title,
            "content": revised,
            "change_summary": change_summary,
            "resolved_issues": list(dict.fromkeys(resolved_issues)),
            "citations": citations,
            "data_based": "真实实验结果" in evidence_context and bool(citations),
        }

    def review_full_draft(
        self,
        draft_title: str,
        full_text: str,
        chapter_summaries: list[dict] | None = None,
        citations: list[str] | None = None,
        evidence_context: str = "",
    ) -> dict:
        """对整篇论文做最小规则审查，输出可直接驱动整篇修订的问题清单。"""
        chapter_summaries = chapter_summaries or []
        citations = citations or []
        text = (full_text or "").strip()
        issues: list[dict] = []
        focus_areas: list[str] = []
        chapter_flags: dict[str, list[str]] = {}

        def add_issue(
            severity: str,
            title: str,
            detail: str,
            suggestion: str,
            focus: str,
            chapter_key: str | None = None,
        ) -> None:
            issues.append({
                "severity": severity,
                "title": title,
                "detail": detail,
                "suggestion": suggestion,
            })
            focus_areas.append(focus)
            if chapter_key:
                chapter_flags.setdefault(chapter_key, []).append(title)

        if len(text) < 1200:
            add_issue(
                "warning",
                "全文篇幅不足",
                "当前整篇正文较短，可能无法形成完整论文论证。",
                "先补齐各章核心段落，再进行整体润色与结构审查。",
                "内容完整性",
            )

        available_chapters = {
            str(item.get("key") or ""): int(item.get("length") or 0)
            for item in chapter_summaries
            if isinstance(item, dict)
        }
        missing_chapters = [key for key in PAPER_CHAPTER_KEYS if available_chapters.get(key, 0) <= 0]
        if missing_chapters:
            add_issue(
                "warning",
                "章节内容不完整",
                "检测到部分标准章节仍缺少正文内容。",
                "补齐缺失章节后再进行整篇修订，避免全文结构断裂。",
                "章节完整性",
            )
            for key in missing_chapters:
                chapter_flags.setdefault(key, []).append("章节内容不完整")

        non_empty_lengths = [length for length in available_chapters.values() if length > 0]
        if len(non_empty_lengths) >= 2 and max(non_empty_lengths) > min(non_empty_lengths) * 4:
            add_issue(
                "info",
                "章节篇幅不均衡",
                "不同章节之间篇幅差异较大，阅读重心可能失衡。",
                "压缩过长章节的重复表述，并补强过短章节的论证内容。",
                "章节均衡",
            )

        intro_length = available_chapters.get("chapter_1_introduction", 0)
        if intro_length > 0 and len(citations) < 2:
            add_issue(
                "warning",
                "第一章文献支撑不足",
                "第一章通常需要支撑研究背景、研究现状和问题提出，当前可用引用偏少。",
                "补充真实文献或证据卡片后，再强化研究现状与问题定义。",
                "文献依据",
                "chapter_1_introduction",
            )

        if "暂无上传成果" in evidence_context or "暂无文献" in evidence_context or not evidence_context.strip():
            add_issue(
                "warning",
                "整篇证据基础偏弱",
                "当前项目证据上下文较少，论文中的实现、实验和结论容易缺少可验证依据。",
                "补充项目成果、内部资料或真实文献后，再生成更强的结论段落。",
                "证据支撑",
            )

        has_numeric_claim = any(token in text for token in ["%", "提升", "降低", "达到", "显著优于", "准确率", "召回率"])
        if has_numeric_claim and ("真实实验结果" not in evidence_context and "实验数据" not in evidence_context):
            add_issue(
                "warning",
                "全文存在无依据数据表述风险",
                "正文中出现量化效果或对比结论，但当前证据上下文不足以支撑这些表述。",
                "删除或弱化无依据的量化结论，待补充真实实验数据后再恢复。",
                "数据依据",
            )

        repeated_markers = ["首先", "其次", "最后", "综上", "因此"]
        if sum(text.count(marker) for marker in repeated_markers) >= 12:
            add_issue(
                "info",
                "连接词重复较多",
                "全文重复使用相似连接词，可能导致段落节奏单一。",
                "合并重复段落，并使用更具体的逻辑承接句替换模板化连接词。",
                "表达质量",
            )

        if "##" in text:
            headings = re.findall(r"^##\s+(.+)$", text, flags=re.MULTILINE)
            if len(headings) >= 2 and "承接" not in text and "上一章" not in text and "本章" not in text:
                add_issue(
                    "info",
                    "章节衔接较弱",
                    "全文已有章节结构，但章节之间缺少明显过渡说明。",
                    "在关键章节开头补充承接上一章、引出本章目标的过渡句。",
                    "章节衔接",
                )

        conclusion_length = available_chapters.get("chapter_6_conclusion", 0)
        if conclusion_length > 0 and not any(token in text for token in ["不足", "展望", "未来"]):
            add_issue(
                "info",
                "总结展望不足",
                "结论部分可能缺少研究不足与未来工作说明。",
                "在最后一章补充不足分析和后续优化方向。",
                "总结呼应",
                "chapter_6_conclusion",
            )

        warning_count = len([item for item in issues if item["severity"] in {"warning", "error"}])
        summary = (
            "整篇论文结构和证据基础基本可接受，可继续人工润色。"
            if not issues
            else f"整篇审查发现 {len(issues)} 个问题，其中 {warning_count} 个需要优先处理。"
        )

        return {
            "passed": warning_count == 0,
            "summary": summary,
            "issues": issues,
            "focus_areas": list(dict.fromkeys(focus_areas)),
            "chapter_flags": chapter_flags,
        }

    def revise_full_draft(
        self,
        draft_title: str,
        full_text: str,
        issues: list[dict] | None = None,
        focus_areas: list[str] | None = None,
        citations: list[str] | None = None,
        evidence_context: str = "",
    ) -> dict:
        """整篇轻量修订：优先 LLM，失败时只做保守规则修订。"""
        issues = issues or []
        focus_areas = focus_areas or []
        citations = citations or []
        original_text = (full_text or "").strip()

        if self.api_key:
            issue_lines = []
            for issue in issues:
                if not isinstance(issue, dict):
                    continue
                issue_lines.append(
                    f"- [{issue.get('severity', 'info')}] {issue.get('title', '')}: "
                    f"{issue.get('detail', '')}；建议：{issue.get('suggestion', '')}"
                )
            user_message = (
                f"## 论文标题\n{draft_title}\n\n"
                f"## 整篇原文\n{original_text}\n\n"
                f"## 审查问题\n{chr(10).join(issue_lines) or '- 暂无明确问题'}\n\n"
                f"## 关注点\n{'、'.join([str(item) for item in focus_areas]) or '无'}\n\n"
                f"## 当前 citations\n{'、'.join([str(item) for item in citations]) or '无'}\n\n"
                f"## 证据上下文\n{evidence_context or '无'}"
            )
            llm_result = self._call_llm(FULL_REVISION_SYSTEM_PROMPT, user_message, max_tokens=6000, timeout=240.0)
            if not llm_result.get("_mock"):
                return {
                    "title": llm_result.get("title", draft_title),
                    "full_text": llm_result.get("full_text", original_text),
                    "change_summary": llm_result.get("change_summary", []),
                    "resolved_issues": llm_result.get("resolved_issues", []),
                    "remaining_issues": llm_result.get("remaining_issues", []),
                }

        revised = original_text
        change_summary: list[str] = []
        resolved_issues: list[str] = []
        remaining_issues: list[str] = []
        issue_titles = [str(item.get("title", "")).strip() for item in issues if isinstance(item, dict)]

        if "全文存在无依据数据表述风险" in issue_titles:
            risky_patterns = [
                r"准确率达到\s*\d+(?:\.\d+)?%",
                r"召回率达到\s*\d+(?:\.\d+)?%",
                r"提升\s*\d+(?:\.\d+)?%",
                r"降低\s*\d+(?:\.\d+)?%",
                r"显著优于[^。；\n]*",
            ]
            for pattern in risky_patterns:
                revised = re.sub(pattern, "相关效果仍需通过真实实验数据进一步验证", revised)
            change_summary.append("弱化了缺少证据支撑的量化效果表述")
            resolved_issues.append("全文存在无依据数据表述风险")

        if "章节衔接较弱" in issue_titles and "本章承接" not in revised:
            revised = re.sub(
                r"(^##\s+.+$)",
                r"\1\n\n本章承接前文内容，进一步说明该部分在全文论证链条中的作用。",
                revised,
                count=1,
                flags=re.MULTILINE,
            )
            change_summary.append("补充了章节承接说明")
            resolved_issues.append("章节衔接较弱")

        if "连接词重复较多" in issue_titles:
            revised = revised.replace("首先，首先", "首先").replace("其次，其次", "其次")
            change_summary.append("清理了部分重复连接表达")
            resolved_issues.append("连接词重复较多")

        if "第一章文献支撑不足" in issue_titles:
            remaining_issues.append("第一章仍需要补充真实文献引用后再定稿")

        if "整篇证据基础偏弱" in issue_titles:
            remaining_issues.append("整篇仍需要补充项目成果、内部资料或真实文献依据")

        if "章节内容不完整" in issue_titles:
            remaining_issues.append("缺失章节需要人工补写或重新生成")

        if not change_summary:
            revised = (
                revised
                + "\n\n全文已完成轻量整理。当前版本未发现可通过规则自动处理的明确问题，建议继续结合真实材料人工复核。"
            )
            change_summary.append("完成整篇轻量整理")

        unresolved = [
            title
            for title in issue_titles
            if title and title not in set(resolved_issues) and title not in {"第一章文献支撑不足", "整篇证据基础偏弱", "章节内容不完整"}
        ]
        remaining_issues.extend(unresolved)

        return {
            "title": draft_title,
            "full_text": revised,
            "change_summary": list(dict.fromkeys(change_summary)),
            "resolved_issues": list(dict.fromkeys(resolved_issues)),
            "remaining_issues": list(dict.fromkeys(remaining_issues)),
        }

    def generate_chapter(
        self,
        chapter_key: str,
        outline: dict,
        outcomes_summary: str,
        literature_context: str,
        existing_chapters: dict | None = None,
    ) -> dict:
        """生成单个章节内容。"""
        chapter_title = PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)
        chapters = outline.get("chapters", []) if isinstance(outline, dict) else []
        chapter_outline = next((item for item in chapters if item.get("key") == chapter_key), None)
        outline_text = json.dumps(chapter_outline, ensure_ascii=False, indent=2) if chapter_outline else "未提供大纲"

        existing_text = ""
        if existing_chapters:
            existing_parts = []
            for key, data in existing_chapters.items():
                if key != chapter_key and isinstance(data, dict) and data.get("content"):
                    existing_parts.append(f"### {PAPER_CHAPTER_LABELS.get(key, key)}\n{data['content'][:300]}...")
            if existing_parts:
                existing_text = "## 已完成章节（供参考，保持一致性）\n\n" + "\n\n".join(existing_parts)

        user_message = (
            f"## 当前章节\n{outline_text}\n\n"
            f"## 项目成果\n{outcomes_summary or '暂无上传成果，本章只能写设计方案或预期结果'}\n\n"
            f"## 文献参考\n{literature_context or '暂无文献数据'}\n"
            f"{existing_text}\n\n"
            f"请撰写《{chapter_title}》的完整内容。"
        )
        user_message += "\n如果本章的判断或表述直接依赖文献或内部证据，请在 citations 中返回已出现在上下文里的真实标题。"

        result = self._call_llm(CHAPTER_SYSTEM_PROMPT, user_message, max_tokens=4000, timeout=180.0)
        if result.get("_mock"):
            return {
                "chapter_key": chapter_key,
                "title": chapter_title,
                "content": f"（需配置 DeepSeek API Key 后生成 {chapter_title} 真实内容）",
                "citations": [],
                "data_based": False,
            }
        return result

    def generate_abstract(self, paper_content: dict) -> dict:
        """根据全文内容生成中英文摘要。"""
        parts = []
        for key in PAPER_CHAPTER_KEYS:
            chapter = paper_content.get(key, {})
            if isinstance(chapter, dict) and chapter.get("content"):
                parts.append(f"## {PAPER_CHAPTER_LABELS.get(key, key)}\n{chapter['content'][:500]}")
        full_text = "\n\n".join(parts) if parts else "（无内容）"
        result = self._call_llm(ABSTRACT_SYSTEM_PROMPT, f"以下是论文内容：\n\n{full_text}", max_tokens=1500)
        if result.get("_mock"):
            return {
                "abstract_cn": "（需配置 DeepSeek API Key 后生成摘要）",
                "abstract_en": "(Configure DeepSeek API Key to generate abstract)",
                "keywords_cn": [],
                "keywords_en": [],
            }
        return result

    def suggest_references(self, paper_content: dict, existing_literature: list[dict]) -> dict:
        """根据论文内容和已有文献推荐补充引用。"""
        parts = []
        for key in PAPER_CHAPTER_KEYS:
            chapter = paper_content.get(key, {})
            if isinstance(chapter, dict) and chapter.get("content"):
                parts.append(chapter["content"][:300])
        paper_text = "\n".join(parts)
        lit_text = json.dumps(existing_literature[:20], ensure_ascii=False, indent=2) if existing_literature else "无"
        user_message = f"论文内容：\n{paper_text}\n\n已有文献：\n{lit_text}"
        result = self._call_llm(SUGGEST_REFS_SYSTEM_PROMPT, user_message, max_tokens=2000)
        if result.get("_mock"):
            return {"suggested_references": [], "notes": "（需配置 API Key）"}
        return result


paper_writing_agent = PaperWritingAgent()
