"""学术问答 Agent —— 具备检索规划与证据化回答能力。"""
import json
import logging
import re
from typing import AsyncGenerator

import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)

ACADEMIC_SYSTEM_PROMPT = """你是一位专业的研究生学术助手，致力于帮助学生进行科研工作。

你的能力包括：
- 解答学术问题，涵盖各学科领域
- 帮助理解复杂的研究概念和方法论
- 提供文献综述、研究设计和论文写作的建议
- 分析研究方法的优缺点
- 协助梳理论文结构和学术表达

回答原则：
1. **严谨准确**：基于可靠的学术知识回答，不确定的地方要明确指出。
2. **结构清晰**：优先使用小标题、编号列表和分点组织回答。
3. **证据优先**：如果有检索证据，优先依据证据回答，而不是凭空补充。
4. **区分证据与推断**：文献直接支持的内容与综合推断的内容要明确区分。
5. **中文学术风格**：使用规范的中文学术表达，必要时附英文术语。
6. **引用来源**：当使用检索到的学术文献时，在相关内容后标注 [1]、[2] 等编号，并在末尾列出参考文献。
7. **启发思考**：回答末尾尽量给出下一步可继续研究的问题或建议。
"""

RESEARCH_MODE_GUIDE = {
    "quick_search": "快速检索模式：优先简洁回答，并引用少量最相关文献。",
    "literature_review": "学术综述模式：优先总结研究现状、主流方法、代表性工作与趋势。",
    "deep_research": "深度研究模式：优先给出问题框架、证据归纳、潜在争议与后续研究建议。",
}

CHINESE_BOILERPLATE_PATTERNS = [
    "请介绍一下",
    "请介绍",
    "介绍一下",
    "请分析一下",
    "请分析",
    "分析一下",
    "请说明一下",
    "请说明",
    "说明一下",
    "帮我分析",
    "帮我介绍",
    "帮我说明",
    "我想了解",
    "想了解",
    "请问一下",
    "请问",
]
CHINESE_SEGMENT_SPLIT_RE = re.compile(r"(?:关于|有关|以及|和|与|及|在|中的|中|的|对|面向|基于|用于|围绕|针对)")
CHINESE_GENERIC_TERMS = {
    "介绍", "分析", "说明", "总结", "研究", "现状", "进展", "应用", "问题", "方法",
}
CHINESE_EXPANSION_SUFFIXES = (
    "研究现状",
    "研究进展",
    "应用现状",
    "应用进展",
    "应用研究",
    "教育领域",
    "预测",
    "检测",
    "分类",
    "生成",
    "推荐",
    "识别",
    "诊断",
    "评估",
    "优化",
    "领域",
    "场景",
    "系统",
    "方法",
    "技术",
    "问题",
    "方向",
)


def _append_cn_keyword(candidate: str, keywords: list[str], seen: set[str]) -> None:
    candidate = candidate.strip()
    if not candidate or len(candidate) < 2 or len(candidate) > 12:
        return
    if candidate in CHINESE_GENERIC_TERMS:
        return
    if candidate not in seen:
        seen.add(candidate)
        keywords.append(candidate)


def _expand_chinese_segment(segment: str) -> list[str]:
    expanded: list[str] = []
    segment = segment.strip()
    if not segment:
        return expanded

    expanded.append(segment)
    for suffix in CHINESE_EXPANSION_SUFFIXES:
        if segment.endswith(suffix) and len(segment) > len(suffix):
            base = segment[:-len(suffix)]
            if len(base) >= 2:
                expanded.append(base)
            if suffix not in {"领域", "场景", "系统", "方法", "技术", "问题", "方向"}:
                expanded.append(suffix)

    for marker in ("大模型", "蛋白质相互作用", "教育", "生物信息", "中文教育", "RAG"):
        if marker in segment and marker != segment:
            expanded.append(marker)

    return expanded


def _extract_chinese_keywords(message: str) -> list[str]:
    cleaned = re.sub(r"[，。！？、；：,.!?;:（）()【】\[\]\s]+", " ", message)
    for phrase in CHINESE_BOILERPLATE_PATTERNS:
        cleaned = cleaned.replace(phrase, " ")

    segments = [
        seg.strip()
        for seg in CHINESE_SEGMENT_SPLIT_RE.split(cleaned)
        if seg.strip()
    ]

    keywords: list[str] = []
    seen: set[str] = set()
    for segment in segments:
        for candidate in _expand_chinese_segment(segment):
            _append_cn_keyword(candidate, keywords, seen)
            if len(keywords) >= 8:
                return keywords[:8]

    if keywords:
        return keywords[:8]

    fallback_words = re.findall(r"[\u4e00-\u9fff]{2,10}", message)
    for word in fallback_words:
        _append_cn_keyword(word, keywords, seen)
        if len(keywords) >= 8:
            break
    return keywords[:8]


def extract_keywords(message: str) -> tuple[list[str], list[str]]:
    """从用户消息中提取用于文献检索的中英文关键词。"""
    cn_keywords = _extract_chinese_keywords(message)[:6]

    stopwords = {
        "the", "and", "for", "that", "this", "with", "from", "have", "what",
        "are", "how", "can", "use", "using", "been", "also", "which", "their",
        "about", "into", "other", "than", "then", "them", "will", "such",
        "more", "these", "those", "your", "when", "make", "like", "just",
        "study", "research", "paper", "method", "methods", "analysis",
    }
    en_candidates = re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", message)
    seen_en: set[str] = set()
    en_keywords: list[str] = []
    for w in en_candidates:
        wl = w.lower()
        if wl not in stopwords and wl not in seen_en:
            seen_en.add(wl)
            en_keywords.append(w)
        if len(en_keywords) >= 5:
            break

    return cn_keywords, en_keywords


def classify_academic_intent(message: str) -> str:
    """对用户问题做粗粒度学术意图分类。"""
    text = message.lower()
    if any(k in text for k in ["综述", "现状", "进展", "review", "survey"]):
        return "literature_review"
    if any(k in text for k in ["研究空白", "研究方向", "选题", "gap", "novelty"]):
        return "research_gap"
    if any(k in text for k in ["对比", "区别", "优缺点", "compare", "comparison"]):
        return "method_comparison"
    if any(k in text for k in ["实验设计", "评价指标", "数据集", "baseline"]):
        return "experiment_design"
    if any(k in text for k in ["是什么", "原理", "概念", "定义", "what is", "definition"]):
        return "concept_explanation"
    return "general_academic"


def build_search_plan(
    message: str,
    *,
    research_mode: str,
    library_scope: str,
) -> dict:
    """为学术对话生成检索计划。"""
    if research_mode not in RESEARCH_MODE_GUIDE:
        research_mode = "quick_search"
    if library_scope not in {"all", "cn", "en"}:
        library_scope = "all"

    intent = classify_academic_intent(message)
    if research_mode == "deep_research":
        limit = 18
        min_citation_count = 5
        prefer_high_impact = True
    elif research_mode == "literature_review":
        limit = 14
        min_citation_count = 3
        prefer_high_impact = True
    else:
        limit = 8
        min_citation_count = 0
        prefer_high_impact = False

    if intent == "concept_explanation":
        limit = min(limit, 6)
    elif intent == "research_gap":
        limit = max(limit, 12)
        prefer_high_impact = True
    elif intent == "method_comparison":
        library_scope = "all" if library_scope == "all" else library_scope

    return {
        "intent": intent,
        "research_mode": research_mode,
        "library_scope": library_scope,
        "limit": limit,
        "min_citation_count": min_citation_count,
        "prefer_high_impact": prefer_high_impact,
        "mode_guide": RESEARCH_MODE_GUIDE[research_mode],
    }


def _format_search_context(papers: list[dict]) -> str:
    """将检索结果格式化为结构化学术证据上下文。"""
    if not papers:
        return ""

    lines = ["以下是与用户问题相关的学术证据，请优先基于这些证据回答：", ""]
    for i, p in enumerate(papers[:10], 1):
        authors = ", ".join(p.get("authors", [])[:3])
        if len(p.get("authors", [])) > 3:
            authors += " 等"
        title = p.get("title", "")
        year = p.get("year", "")
        venue = p.get("venue", "")
        abstract = (p.get("abstract") or "")[:280]
        why_selected = p.get("why_selected", "")
        quality_flags = " / ".join(p.get("quality_flags", [])[:4])
        lines.append(
            f"[{i}] {authors}. {title}. {venue}, {year}.\n"
            f"来源标签：{quality_flags or '无'}\n"
            f"纳入原因：{why_selected or '与当前问题相关'}\n"
            f"摘要：{abstract}"
        )
    return "\n".join(lines)


async def chat_stream(
    message: str,
    history: list[dict],
    search_papers: list[dict] | None = None,
    research_mode: str = "quick_search",
    intent: str = "general_academic",
    project_context: str = "",
) -> AsyncGenerator[str, None]:
    """流式调用 DeepSeek API，逐 token yield。"""
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        yield "错误：DEEPSEEK_API_KEY 未配置，请在 .env 中设置。"
        return

    mode_guide = RESEARCH_MODE_GUIDE.get(research_mode, RESEARCH_MODE_GUIDE["quick_search"])
    messages = [{
        "role": "system",
        "content": (
            f"{ACADEMIC_SYSTEM_PROMPT}\n\n"
            f"当前回答模式：{mode_guide}\n"
            f"当前问题类型：{intent}\n"
            "请在回答中明确区分“文献直接支持的结论”和“综合推断”。"
        ),
    }]

    if search_papers:
        context = _format_search_context(search_papers)
        if context:
            messages.append({
                "role": "system",
                "content": (
                    f"{context}\n\n"
                    "请优先引用这些文献，使用 [编号] 标注。回答末尾列出参考文献。"
                ),
            })

    if project_context:
        messages.append({
            "role": "system",
            "content": (
                "以下是与当前项目相关的私有资料证据。回答时请明确区分："
                "哪些结论来自外部文献，哪些来自项目内资料。\n\n"
                f"{project_context}"
            ),
        })

    for h in history[-20:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": messages,
                    "temperature": 0.45 if research_mode == "literature_review" else 0.6,
                    "max_tokens": 4096,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.HTTPError as e:
        logger.warning(f"DeepSeek API 调用失败: {e}")
        yield "抱歉，请求学术助手服务时遇到网络问题，请稍后重试。"
    except Exception as e:
        logger.warning(f"DeepSeek 流式响应异常: {e}")
        yield "抱歉，处理您的请求时出现了错误。"
