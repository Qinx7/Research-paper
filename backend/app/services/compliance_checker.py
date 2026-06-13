"""学术合规检查服务 —— 规则引擎 + 接地 AI 审计

检查项：
1. 数据真实性检查 — 无真实数据时是否存在编造性措辞
2. 引用真实性检查 — 引用编号/文献是否与数据库匹配
3. 章节标记检查 — 第4/5章是否按要求标记 data/design 状态
4. 统计编造检查 — 无实验数据时是否出现数值断言
5. AI 语义对比 — 接地对比章节内容与已有成果/文献（纯验证）
"""
import json
import logging
import re
from datetime import datetime, timezone

from ..schemas.draft import PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS
from ..schemas.compliance import ComplianceIssue, ChapterCompliance, ComplianceResult

logger = logging.getLogger(__name__)

# ============================================================
# 常量：违禁词与模式
# ============================================================

# 仅在 data_based=False 时标记为 error 的已完成措辞
COMPLETED_PHRASES = [
    r"实验结果\s*(表明|显示|证明|揭示|证实)",
    r"测试结果\s*(表明|显示|证明)",
    r"数据\s*(表明|显示|揭示|证实)",
    r"通过实验\s*(验证|证明|确认)",
    r"实验\s*(证明|证实|验证了)",
    r"实际测试\s*(表明|显示)",
    r"运行结果\s*(表明|显示|确认)",
    r"实验数据\s*(表明|显示)",
    r"实测结果",
    r"经.*实验.*验证",
    r"实践证明",
]

# 数值断言模式（无实验数据时不应出现）
STATISTIC_PATTERNS = [
    r"(?:达到|提升|降低|提高|改善|优于|超过|减少)\s*\d+(?:\.\d+)?\s*%",
    r"(?:准确率|精确率|召回率|F1|F1-score|BLEU|ROUGE|MSE|RMSE|AUC|MAP|mAP|IoU)\s*(?:达到|为|是)?\s*\d+(?:\.\d+)?\s*%?",
    r"(?:平均|最高|最低|约为|约)\s*\d+(?:\.\d+)?\s*(?:秒|ms|毫秒|分钟|小时)",
    r"(?:耗时|性能提升|速度提升|加速|延迟)\s*\d+(?:\.\d+)?\s*(?:倍|%|秒|ms)",
    r"\d+(?:\.\d+)?%\s*(?:的)?(?:准确|精度|召回)",
]

# 章节标记
DATA_BASED_MARKER = "[基于真实数据]"
DESIGN_ONLY_MARKER = "[实验设计方案]"

# 需要标记的章节
MARKER_REQUIRED_CHAPTERS = [
    "chapter_4_implementation",
    "chapter_5_experiment",
]

# DOI 正则
DOI_PATTERN = re.compile(r"10\.\d{4,}/[^\s]+")

# 引用编号提取正则
CITATION_PATTERN = re.compile(r"\[(\d+(?:,\s*\d+)*)\]")


# ============================================================
# 检查函数
# ============================================================

def _check_data_authenticity(
    chapter_text: str,
    is_data_based: bool,
    chapter_key: str,
) -> list[ComplianceIssue]:
    """检查 1：无真实数据时不应出现已完成措辞。"""
    issues: list[ComplianceIssue] = []
    if is_data_based:
        return issues

    text_lines = chapter_text.split("\n")
    for phrase_pattern in COMPLETED_PHRASES:
        for i, line in enumerate(text_lines):
            for match in re.finditer(phrase_pattern, line):
                # 如果同段有 [实验设计方案] 标记，降级为 warning
                severity = "error"
                if DESIGN_ONLY_MARKER in line or DESIGN_ONLY_MARKER in chapter_text:
                    severity = "warning"

                snippet = line.strip()[:120]
                issues.append(ComplianceIssue(
                    issue_type="data_fabrication",
                    severity=severity,
                    chapter_key=chapter_key,
                    location=f"第{i + 1}段",
                    description=f"无真实数据时使用了已完成措辞：\"{match.group()}\"",
                    snippet=snippet,
                    suggestion="请改用拟开展措辞，如：\"拟通过实验验证\"\"预期结果\"\"计划测试\"等。",
                ))

    return issues


def _check_reference_authenticity(
    chapter_text: str,
    draft_references: list[dict],
    chapter_key: str,
) -> list[ComplianceIssue]:
    """检查 2：引用编号是否在参考文献列表范围内，DOI 格式是否合法。"""
    issues: list[ComplianceIssue] = []

    # 提取所有引用编号
    ref_count = len(draft_references) if isinstance(draft_references, list) else 0
    seen_fake = set()
    for match in CITATION_PATTERN.finditer(chapter_text):
        nums_str = match.group(1)
        for num_part in nums_str.split(","):
            num_part = num_part.strip()
            if not num_part.isdigit():
                continue
            n = int(num_part)
            if n > ref_count and n not in seen_fake:
                seen_fake.add(n)
                issues.append(ComplianceIssue(
                    issue_type="fake_reference",
                    severity="error",
                    chapter_key=chapter_key,
                    location=f"引用编号 [{n}]",
                    description=f"引用编号 [{n}] 超出参考文献列表范围（共 {ref_count} 条）",
                    snippet=match.group(),
                    suggestion=f"请检查引用是否正确，或补充对应文献到参考文献列表。",
                ))

    # DOI 格式校验
    if isinstance(draft_references, list):
        for idx, ref in enumerate(draft_references):
            if not isinstance(ref, dict):
                continue
            doi = ref.get("doi", "")
            if doi and not DOI_PATTERN.search(str(doi)):
                issues.append(ComplianceIssue(
                    issue_type="fake_reference",
                    severity="warning",
                    chapter_key=chapter_key,
                    location=f"参考文献 [{idx + 1}]",
                    description=f"DOI 格式异常：{doi}",
                    suggestion="请检查 DOI 是否正确。标准格式：10.xxxx/xxxxx",
                ))
            # 标题过短检查（可能的编造痕迹）
            title = ref.get("title", "")
            if title and isinstance(title, str) and len(title.strip()) < 10:
                issues.append(ComplianceIssue(
                    issue_type="fake_reference",
                    severity="warning",
                    chapter_key=chapter_key,
                    location=f"参考文献 [{idx + 1}]",
                    description=f"文献标题过短（{len(title.strip())} 字符），可能为编造：\"{title}\"",
                    suggestion="请核实该文献是否为真实存在的出版物。",
                ))
            # 年份异常检查
            year = ref.get("year", "")
            if year and isinstance(year, (int, float)):
                current_year = 2026
                if year < 1900 or year > current_year:
                    issues.append(ComplianceIssue(
                        issue_type="fake_reference",
                        severity="warning",
                        chapter_key=chapter_key,
                        location=f"参考文献 [{idx + 1}]",
                        description=f"发表年份异常：{year}",
                        suggestion="请检查年份是否正确。",
                    ))

    return issues


def _check_chapter_marker(
    chapter_text: str,
    is_data_based: bool,
    chapter_key: str,
) -> list[ComplianceIssue]:
    """检查 3：关键章节是否包含合规标记。"""
    issues: list[ComplianceIssue] = []

    if chapter_key not in MARKER_REQUIRED_CHAPTERS:
        return issues

    has_data_marker = DATA_BASED_MARKER in chapter_text
    has_design_marker = DESIGN_ONLY_MARKER in chapter_text

    if not has_data_marker and not has_design_marker:
        expected = DATA_BASED_MARKER if is_data_based else DESIGN_ONLY_MARKER
        issues.append(ComplianceIssue(
            issue_type="missing_marker",
            severity="warning",
            chapter_key=chapter_key,
            location="全文",
            description=f"章节缺少合规标记，根据数据状态应标记为 {expected}",
            suggestion=f"请在章首或相关段落添加 {expected} 标记，说明内容的真实数据来源或设计性质。",
        ))
    elif is_data_based and has_design_marker and not has_data_marker:
        issues.append(ComplianceIssue(
            issue_type="missing_marker",
            severity="warning",
            chapter_key=chapter_key,
            location="全文",
            description=f"data_based=true 但标记为 {DESIGN_ONLY_MARKER}，状态不一致",
            suggestion=f"请将标记改为 {DATA_BASED_MARKER} 或确认数据上传情况。",
        ))

    return issues


def _check_statistic_fabrication(
    chapter_text: str,
    is_data_based: bool,
    outcomes: list,
    chapter_key: str,
) -> list[ComplianceIssue]:
    """检查 4：无实验数据时不应出现数值断言。"""
    issues: list[ComplianceIssue] = []

    if is_data_based:
        return issues

    # 检查是否有 experiment_data 或 survey_data 类型的成果
    has_experiment_data = any(
        getattr(o, "outcome_type", None) in ("experiment_data", "survey_data")
        for o in (outcomes or [])
    )
    if has_experiment_data:
        return issues

    text_lines = chapter_text.split("\n")
    for pattern in STATISTIC_PATTERNS:
        for i, line in enumerate(text_lines):
            for match in re.finditer(pattern, line):
                snippet = line.strip()[:120]
                issues.append(ComplianceIssue(
                    issue_type="suspicious_statistic",
                    severity="warning",
                    chapter_key=chapter_key,
                    location=f"第{i + 1}段",
                    description=f"无实验数据时出现了数值断言：\"{match.group()}\"",
                    snippet=snippet,
                    suggestion="请确认该数据是否来自已上传的实验数据。如无数据支撑，请改为\"预期\"或\"目标\"措辞。",
                ))

    return issues


def _check_ai_deep_audit(
    chapter_text: str,
    chapter_key: str,
    outcomes_summary: str,
    references_list: str,
    api_key: str,
    base_url: str,
    model: str,
) -> list[ComplianceIssue]:
    """检查 5：调用 LLM 做接地对比，验证内容是否有数据支撑。

    AI 严格扮演纯验证角色：只对比，不创作，不推断，不补充。
    """
    import httpx

    # 防止无意义的空文本调用
    chapter_text = (chapter_text or "").strip()
    if not chapter_text:
        return []

    system_prompt = """你是一位学术合规审计员。你的唯一职责是对照检查，不创作、不推断、不补充。

## 任务
将用户提供的论文章节正文，与提供的"项目成果清单"和"参考文献清单"逐一比对。

## 判断规则
1. 如果正文中出现了某个实验结果、性能数据、数值结论或实现细节，但在成果清单中找不到对应项 → 标记为 issue
2. 如果正文中引用了某篇文献但参考文献清单中没有 → 标记为 issue
3. 如果所有断言都能在成果清单或文献清单中找到依据 → 返回空列表 []

## 禁止事项（严格遵守）
- 禁止推断缺失数据是什么
- 禁止建议替代措辞或改写方案
- 禁止补充分析意见或评价
- 禁止在未发现问题时仍然生成解释文本

## 输出格式
返回纯 JSON 数组。如果没有问题，返回 []。如果有问题：
[
  {
    "issue_type": "ai_flag",
    "severity": "info",
    "location": "文本位置描述（如\"第2段\"）",
    "description": "具体说明正文中哪个断言在成果/文献清单中找不到对应依据（20字以内）",
    "snippet": "正文中的相关原文片段（不超过50字）",
    "suggestion": "简短建议（15字以内）：上传对应数据 或 改为预期措辞"
  }
]

只返回 JSON 数组，不要任何其他文字。"""

    user_message = f"""## 项目成果清单
{outcomes_summary or "（无上传成果）"}

## 参考文献清单
{references_list or "（无参考文献）"}

## 待检查章节
{PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)}

## 章节正文
{chapter_text[:8000]}
"""

    try:
        response = httpx.post(
            f"{base_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.1,  # 低温度，更强的确定性
                "max_tokens": 2000,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        items = json.loads(content)
        if not isinstance(items, list):
            return []

        issues: list[ComplianceIssue] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            issues.append(ComplianceIssue(
                issue_type=item.get("issue_type", "ai_flag"),
                severity=item.get("severity", "info"),
                chapter_key=chapter_key,
                location=item.get("location", ""),
                description=item.get("description", ""),
                snippet=item.get("snippet"),
                suggestion=item.get("suggestion", ""),
            ))
        return issues

    except Exception:
        logger.warning("AI 深度审计调用失败，返回空结果", exc_info=True)
        return []


# ============================================================
# 评分逻辑
# ============================================================

def _compute_score(chapters: dict[str, ChapterCompliance]) -> tuple[int, bool]:
    """根据 issues 计算总分和是否通过。"""
    score = 100
    for ch in chapters.values():
        for issue in ch.issues:
            if issue.user_action in ("accept",):
                continue  # 用户确认通过的不扣分
            if issue.severity == "error":
                score -= 20
            elif issue.severity == "warning":
                score -= 10
            elif issue.severity == "info":
                score -= 5
    score = max(0, score)

    # 有未确认的 error 即为不通过
    has_unconfirmed_error = any(
        issue.severity == "error" and issue.user_action not in ("accept",)
        for ch in chapters.values()
        for issue in ch.issues
    )
    return score, not has_unconfirmed_error


# ============================================================
# 主入口
# ============================================================

def check_draft(
    draft,
    outcomes: list,
    papers: list | None = None,
    enable_ai: bool = False,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> ComplianceResult:
    """对论文草稿运行全部合规检查。

    Args:
        draft: Draft ORM 对象（需有 content、references、id 属性）
        outcomes: 项目的 Outcome ORM 对象列表
        papers: 项目的 Paper ORM 对象列表（可选）
        enable_ai: 是否启用 AI 深度语义检查
        api_key: DeepSeek API key（AI 检查需要）
        base_url: DeepSeek API base URL
        model: DeepSeek model name

    Returns:
        ComplianceResult 包含所有章节的合规检查结果
    """
    content = getattr(draft, "content", None) or {}
    references = getattr(draft, "references", None) or []
    draft_id = str(getattr(draft, "id", ""))

    papers = papers or []

    # 构建成果摘要（用于 AI 检查）
    outcomes_summary_parts = []
    for o in (outcomes or []):
        otype = getattr(o, "outcome_type", "other")
        oname = getattr(o, "name", "未命名")
        odesc = getattr(o, "description", "") or ""
        outcomes_summary_parts.append(f"- [{otype}] {oname}: {odesc}")
    outcomes_summary = "\n".join(outcomes_summary_parts) if outcomes_summary_parts else ""

    # 构建文献摘要
    references_list_parts = []
    for i, r in enumerate(references):
        if isinstance(r, dict):
            references_list_parts.append(
                f"[{i + 1}] {r.get('title', '无标题')} — "
                f"{r.get('authors', '佚名')}, {r.get('year', '')}"
            )
    references_list = "\n".join(references_list_parts) if references_list_parts else ""

    chapters: dict[str, ChapterCompliance] = {}

    for key in PAPER_CHAPTER_KEYS:
        ch_data = content.get(key, {})
        if isinstance(ch_data, str):
            ch_text = ch_data
            ch_is_data_based = False
        elif isinstance(ch_data, dict):
            ch_text = ch_data.get("content", "")
            ch_is_data_based = bool(ch_data.get("data_based", False))
        else:
            ch_text = ""
            ch_is_data_based = False

        if not ch_text.strip():
            # 空章节不检查
            chapters[key] = ChapterCompliance(
                chapter_key=key,
                passed=True,
                issues=[],
                confirmed=True,
            )
            continue

        issues: list[ComplianceIssue] = []

        # 规则检查 1-4
        issues.extend(_check_data_authenticity(ch_text, ch_is_data_based, key))
        issues.extend(_check_reference_authenticity(ch_text, references, key))
        issues.extend(_check_chapter_marker(ch_text, ch_is_data_based, key))
        issues.extend(_check_statistic_fabrication(ch_text, ch_is_data_based, outcomes, key))

        # AI 深度检查（仅在启用且有 API key，且章节非空时运行）
        if enable_ai and api_key and ch_text.strip():
            ai_issues = _check_ai_deep_audit(
                chapter_text=ch_text,
                chapter_key=key,
                outcomes_summary=outcomes_summary,
                references_list=references_list,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            issues.extend(ai_issues)

        has_errors = any(
            i.severity == "error" and i.user_action not in ("accept",)
            for i in issues
        )
        chapters[key] = ChapterCompliance(
            chapter_key=key,
            passed=not has_errors,
            issues=issues,
            confirmed=False,
        )

    score, passed = _compute_score(chapters)

    return ComplianceResult(
        draft_id=draft_id,
        overall_score=score,
        passed=passed,
        chapters=chapters,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )
