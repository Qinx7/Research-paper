"""论文草稿 API 路由 —— 创建 / 编辑 / 生成大纲 / 生成章节 / 导出 docx"""
import io
import json
import logging
import os
import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..core.database import get_db
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.project_design import ProjectDesign
from ..models.research_direction import ResearchDirection
from ..models.paper import Paper
from ..models.user import User
from ..schemas.draft import (
    DraftCreate, DraftUpdate, DraftOut, DraftOutline, PaperSection,
    GenerateOutlineRequest, GenerateChapterRequest,
    PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS,
    ChapterResult, AbstractResult, SuggestRefsResult,
)
from ..schemas.defense_ppt import DefensePPTOutline, DefenseSlideInfo
from ..schemas.compliance import ComplianceResult, ComplianceConfirmRequest
from ..agents.paper_writing_agent import paper_writing_agent
from ..tasks.paper_task import generate_chapter_task
from ..services.compliance_checker import check_draft
from ..services.evidence_retrieval_service import build_evidence_context, retrieve_project_evidence
from ..services.grounding_guard import validate_generated_chapter_grounding
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_draft, get_owned_project, query_owned_drafts
from ..core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drafts", tags=["drafts"])

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "drafts")


def _ensure_storage_dir():
    os.makedirs(STORAGE_DIR, exist_ok=True)


def _format_authors(authors_value) -> str:
    """将数据库中的作者字段格式化为可读文本。"""
    if not authors_value:
        return "佚名"
    if isinstance(authors_value, list):
        return ", ".join([str(a).strip() for a in authors_value[:3] if str(a).strip()]) or "佚名"
    if isinstance(authors_value, str):
        parts = [a.strip() for a in authors_value.split(";") if a.strip()]
        if not parts:
            parts = [a.strip() for a in authors_value.split(",") if a.strip()]
        return ", ".join(parts[:3]) if parts else "佚名"
    return str(authors_value)


def _format_jsonish_text(value) -> str:
    """把 JSON 字符串或列表整理成更适合给 LLM 的上下文文本。"""
    if value is None:
        return ""
    if isinstance(value, list):
        return "；".join(str(v).strip() for v in value if str(v).strip())
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return ""
        try:
            parsed = json.loads(raw)
        except Exception:
            return raw
        if isinstance(parsed, list):
            return "；".join(str(v).strip() for v in parsed if str(v).strip())
        if isinstance(parsed, dict):
            return json.dumps(parsed, ensure_ascii=False)
        return str(parsed)
    return str(value)


def _safe_filename(title: str, fallback: str, ext: str = "docx") -> str:
    """生成适合下载的文件名。"""
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", (title or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        cleaned = fallback
    return f"{cleaned}.{ext}"


def _build_outcomes_summary(db: Session, project_id: UUID) -> str:
    """构建项目成果摘要文本"""
    outcomes = db.query(Outcome).filter(Outcome.project_id == project_id).all()
    if not outcomes:
        return "暂无上传成果 —— 论文中的实验和实现章节仅能编写设计方案和预期结果。"
    lines = [f"共 {len(outcomes)} 项成果："]
    for o in outcomes:
        lines.append(f"- [{o.outcome_type}] {o.name}: {o.description or '无描述'}")
    return "\n".join(lines)


def _build_project_context(db: Session, project_id: UUID) -> str:
    """构建项目背景上下文文本"""
    parts = []
    # 项目设计
    design = db.query(ProjectDesign).filter(ProjectDesign.project_id == project_id).order_by(
        ProjectDesign.created_at.desc()
    ).first()
    if design:
        topic = design.topic or "未指定"
        parts.append(f"研究题目：{topic}")
        if isinstance(design.content, dict):
            parts.append(json.dumps(design.content, ensure_ascii=False, indent=2))

    # 研究方向
    direction = db.query(ResearchDirection).filter(ResearchDirection.project_id == project_id).order_by(
        ResearchDirection.created_at.desc()
    ).first()
    if direction:
        parts.append(f"研究方向：{direction.title}")
        parts.append(f"研究问题：{_format_jsonish_text(direction.research_questions)}")
        parts.append(f"研究方法：{_format_jsonish_text(direction.methods)}")

    return "\n".join(parts) if parts else "暂无项目背景信息"


def _build_literature_context(
    db: Session,
    project_id: UUID,
    evidence_items: list[dict] | None = None,
) -> str:
    """构建文献上下文字符串"""
    papers = db.query(Paper).filter(Paper.project_id == project_id).limit(20).all()
    if evidence_items is None:
        evidence_items = retrieve_project_evidence(db, project_id, "", limit=12, min_confidence=70)
    if not papers and not evidence_items:
        return ""

    parts = []
    if papers:
        parts.append("已有文献：")
        for p in papers:
            authors = _format_authors(p.authors)
            parts.append(f"- {authors}. {p.title}. {p.venue or ''}, {p.year or ''}")

    evidence_context = build_evidence_context(evidence_items)
    if evidence_context:
        parts.append("")
        parts.append(evidence_context)
    return "\n".join(parts)


def _draft_to_out(draft: Draft) -> DraftOut:
    """Draft ORM → DraftOut 响应模型"""
    content = draft.content or {}
    sections = []
    for key in PAPER_CHAPTER_KEYS:
        ch = content.get(key, {})
        if isinstance(ch, dict):
            sections.append(PaperSection(
                key=key,
                title=ch.get("title", PAPER_CHAPTER_LABELS.get(key, key)),
                content=ch.get("content", ""),
                status=ch.get("status", "draft"),
            ))
        else:
            sections.append(PaperSection(
                key=key,
                title=PAPER_CHAPTER_LABELS.get(key, key),
                content="",
                status="draft",
            ))
    return DraftOut(
        id=str(draft.id),
        project_id=str(draft.project_id),
        title=draft.title,
        content=draft.content,
        references=draft.references,
        outline=draft.outline,
        version=draft.version or 1,
        sections=sections,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )
# ---- CRUD ----

@router.post("/", response_model=DraftOut, status_code=201)
def create_draft(
    payload: DraftCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建论文草稿"""
    try:
        project = get_owned_project(payload.project_id, current_user, db)
        draft = Draft(
            project_id=project.id,
            title=payload.title,
            content={},
            references=[],
            version=1,
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)
        return _draft_to_out(draft)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建草稿失败: {str(e)}")


@router.get("/", response_model=list[DraftOut])
def list_drafts(
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出论文草稿，可按项目过滤"""
    q = query_owned_drafts(db, current_user)
    if project_id:
        project = get_owned_project(project_id, current_user, db)
        q = q.filter(Draft.project_id == project.id)
    drafts = q.order_by(Draft.updated_at.desc()).all()
    return [_draft_to_out(d) for d in drafts]


@router.get("/{draft_id}", response_model=DraftOut)
def get_draft(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取草稿完整内容"""
    draft = get_owned_draft(draft_id, current_user, db)
    return _draft_to_out(draft)


@router.patch("/{draft_id}", response_model=DraftOut)
def update_draft(
    draft_id: UUID,
    payload: DraftUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新草稿（保存用户编辑）"""
    draft = get_owned_draft(draft_id, current_user, db)
    try:
        for field, value in payload.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(draft, field, value)
        db.commit()
        db.refresh(draft)
        return _draft_to_out(draft)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新草稿失败: {str(e)}")


@router.delete("/{draft_id}", status_code=204)
def delete_draft(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除草稿"""
    draft = get_owned_draft(draft_id, current_user, db)
    try:
        db.delete(draft)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除草稿失败: {str(e)}")


# ---- AI 生成 ----

@router.post("/{draft_id}/outline", response_model=DraftOutline)
def generate_outline(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成论文大纲"""
    draft = get_owned_draft(draft_id, current_user, db)

    project_context = _build_project_context(db, draft.project_id)
    outcomes_summary = _build_outcomes_summary(db, draft.project_id)
    literature_context = _build_literature_context(db, draft.project_id)

    result = paper_writing_agent.generate_outline(
        project_context=project_context,
        outcomes_summary=outcomes_summary,
        literature_context=literature_context,
    )

    # 保存大纲到草稿
    draft.outline = result
    draft.title = result.get("suggested_title", draft.title)
    db.commit()

    from ..schemas.draft import ChapterOutline
    chapters = [
        ChapterOutline(
            key=ch.get("key", ""),
            title=ch.get("title", ""),
            subsections=ch.get("subsections", []),
        )
        for ch in result.get("chapters", [])
    ]
    return DraftOutline(
        chapters=chapters,
        suggested_title=result.get("suggested_title"),
        notes=result.get("notes"),
    )


@router.post("/{draft_id}/chapters/{chapter_key}", response_model=ChapterResult)
def generate_chapter(
    draft_id: UUID,
    chapter_key: str,
    payload: GenerateChapterRequest | None = None,
    async_mode: bool = Query(False, alias="async", description="是否异步生成"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成单个章节内容"""
    if chapter_key not in PAPER_CHAPTER_KEYS:
        raise HTTPException(status_code=400, detail=f"无效的章节标识: {chapter_key}")

    draft = get_owned_draft(draft_id, current_user, db)

    # 异步模式
    if async_mode:
        task = generate_chapter_task.delay(
            draft_id=str(draft.id),
            chapter_key=chapter_key,
            literature_context=_build_literature_context(db, draft.project_id),
        )
        return {"task_id": task.id, "status": "pending", "chapter_key": chapter_key}

    # 同步模式
    outcomes_summary = _build_outcomes_summary(db, draft.project_id)
    evidence_items = retrieve_project_evidence(db, draft.project_id, "", limit=12, min_confidence=70)
    literature_context = _build_literature_context(db, draft.project_id, evidence_items)
    outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
    papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()

    result = paper_writing_agent.generate_chapter(
        chapter_key=chapter_key,
        outline=draft.outline or {},
        outcomes_summary=outcomes_summary,
        literature_context=literature_context,
        existing_chapters=draft.content or {},
    )
    try:
        result = validate_generated_chapter_grounding(
            chapter_key=chapter_key,
            result=result,
            outcomes=outcomes,
            papers=papers,
            evidence_items=evidence_items,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"章节生成结果缺少可验证依据: {e}")

    # 保存到 DB
    content = draft.content or {}
    chapter_title = PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)
    content[chapter_key] = {
        "title": result.get("title", chapter_title),
        "content": result.get("content", ""),
        "status": "generated",
        "data_based": result.get("data_based", False),
    }
    draft.content = content
    draft.version = (draft.version or 1) + 1
    db.commit()

    return ChapterResult(
        chapter_key=chapter_key,
        title=result.get("title", chapter_title),
        content=result.get("content", ""),
        status="generated",
        citations=result.get("citations", []),
        data_based=result.get("data_based", False),
    )


@router.post("/{draft_id}/abstract", response_model=AbstractResult)
def generate_abstract(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据全文生成中英文摘要"""
    draft = get_owned_draft(draft_id, current_user, db)

    result = paper_writing_agent.generate_abstract(draft.content or {})
    return AbstractResult(
        abstract_cn=result.get("abstract_cn", ""),
        abstract_en=result.get("abstract_en", ""),
        keywords_cn=result.get("keywords_cn", []),
        keywords_en=result.get("keywords_en", []),
    )


@router.post("/{draft_id}/suggest-refs", response_model=SuggestRefsResult)
def suggest_references(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """推荐补充参考文献"""
    draft = get_owned_draft(draft_id, current_user, db)

    papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()
    existing_lit = [
        {
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "venue": p.venue,
            "doi": p.doi,
        }
        for p in papers
    ]

    result = paper_writing_agent.suggest_references(draft.content or {}, existing_lit)
    return SuggestRefsResult(
        suggested_references=result.get("suggested_references", []),
        notes=result.get("notes"),
    )


# ---- 学术合规检查 ----

@router.post("/{draft_id}/check-compliance", response_model=ComplianceResult)
def check_compliance(
    draft_id: UUID,
    enable_ai: bool = Query(False, description="是否启用 AI 深度语义检查"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """对论文草稿运行合规检查（规则检查始终执行，AI 检查可选）。"""
    draft = get_owned_draft(draft_id, current_user, db)

    outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
    papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()

    result = check_draft(
        draft=draft,
        outcomes=outcomes,
        papers=papers,
        enable_ai=enable_ai,
        api_key=settings.DEEPSEEK_API_KEY if enable_ai else None,
        base_url=settings.DEEPSEEK_BASE_URL if enable_ai else None,
        model=settings.DEEPSEEK_MODEL if enable_ai else None,
    )

    # 持久化合规结果
    content = dict(draft.content or {})
    content["_compliance"] = result.model_dump(mode="json")
    draft.content = content
    flag_modified(draft, "content")
    db.commit()

    return result


@router.post("/{draft_id}/confirm-compliance")
def confirm_compliance(
    draft_id: UUID,
    payload: ComplianceConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用户确认/忽略/修正某个合规 issue。"""
    draft = get_owned_draft(draft_id, current_user, db)

    content = dict(draft.content or {})
    compliance = content.get("_compliance", {})
    chapters = compliance.get("chapters", {})

    chapter = chapters.get(payload.chapter_key)
    if not chapter:
        raise HTTPException(status_code=404, detail=f"章节 {payload.chapter_key} 无检查结果")

    issues = chapter.get("issues", [])
    if payload.issue_index < 0 or payload.issue_index >= len(issues):
        raise HTTPException(status_code=400, detail=f"issue_index 超出范围 (0-{len(issues) - 1})")

    issues[payload.issue_index]["user_action"] = payload.action
    issues[payload.issue_index]["confirmed_at"] = datetime.utcnow().isoformat()

    # 检查该章节是否所有 error 都已确认
    has_unconfirmed_error = any(
        i.get("severity") == "error" and i.get("user_action") not in ("accept",)
        for i in issues
    )
    chapter["confirmed"] = not has_unconfirmed_error
    if chapter["confirmed"]:
        chapter["confirmed_at"] = datetime.utcnow().isoformat()

    content["_compliance"] = compliance
    draft.content = content
    flag_modified(draft, "content")
    db.commit()

    return {"status": "ok", "chapter_key": payload.chapter_key, "chapter_confirmed": chapter["confirmed"]}


@router.get("/{draft_id}/compliance-status")
def get_compliance_status(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取论文草稿的合规检查状态。"""
    draft = get_owned_draft(draft_id, current_user, db)

    content = draft.content or {}
    compliance = content.get("_compliance")
    if not compliance:
        return {"checked": False, "message": "尚未执行合规检查"}

    return compliance


# ---- 导出 ----

@router.get("/{draft_id}/preview")
def preview_draft(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """拼接返回完整论文文本预览"""
    draft = get_owned_draft(draft_id, current_user, db)

    content = draft.content or {}
    parts = [f"# {draft.title}\n\n"]
    for key in PAPER_CHAPTER_KEYS:
        ch = content.get(key, {})
        if isinstance(ch, dict) and ch.get("content"):
            parts.append(f"## {PAPER_CHAPTER_LABELS.get(key, key)}\n\n")
            parts.append(ch["content"])
            parts.append("\n\n---\n\n")

    return {"title": draft.title, "full_text": "".join(parts), "version": draft.version}


@router.get("/{draft_id}/download")
def download_draft(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    format: str = Query("docx", pattern="^(docx|pdf)$"),
):
    """导出论文草稿为 docx 或 pdf 文件（MinIO 优先，本地 fallback）"""
    draft = get_owned_draft(draft_id, current_user, db)

    if format == "pdf":
        content_type = "application/pdf"
        ext = "pdf"
        buf = io.BytesIO(_build_pdf(draft))
    else:
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
        buf = _build_docx(draft)

    filename = _safe_filename(draft.title, f"draft_{draft_id}", ext)
    object_key = f"drafts/draft_{draft_id}.{ext}"
    file_bytes = buf.read()

    # MinIO 优先
    try:
        from ..services.upload_service import get_object_stream as gos
        minio_result = gos(object_key)
        if minio_result is not None:
            stream, size, ct = minio_result
            return StreamingResponse(
                stream,
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Length": str(size),
                },
            )
    except Exception:
        pass

    # 生成并保存到本地
    _ensure_storage_dir()
    filepath = os.path.join(STORAGE_DIR, f"draft_{draft_id}.{ext}")
    with open(filepath, "wb") as f:
        f.write(file_bytes)

    # 异步保存到 MinIO
    try:
        from ..services.upload_service import save_bytes as sb
        sb(file_bytes, object_key, content_type=content_type)
    except Exception:
        pass

    return FileResponse(
        filepath,
        media_type=content_type,
        filename=filename,
    )


# ---- 答辩 PPT 预览（从论文提取） ----

@router.get("/{draft_id}/defense-outline", response_model=DefensePPTOutline)
def get_defense_outline(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """从论文草稿生成答辩 PPT 大纲预览"""
    draft = get_owned_draft(draft_id, current_user, db)

    content = draft.content or {}
    has_real_data = False
    for key, ch in content.items():
        if isinstance(ch, dict) and ch.get("data_based"):
            has_real_data = True
            break

    # 15 页答辩 PPT 结构
    slides = [
        DefenseSlideInfo(page=1, title="题目页", content_type="cover", description=draft.title),
        DefenseSlideInfo(page=2, title="研究背景与意义", content_type="content", description="选题背景和研究意义"),
        DefenseSlideInfo(page=3, title="研究问题与目标", content_type="content", description="核心研究问题和目标"),
        DefenseSlideInfo(page=4, title="国内外研究现状", content_type="content", description="关键文献综述"),
        DefenseSlideInfo(page=5, title="系统总体设计", content_type="section", description="系统架构和设计思路"),
        DefenseSlideInfo(page=6, title="系统架构", content_type="content", description="技术架构图"),
        DefenseSlideInfo(page=7, title="核心功能实现", content_type="content", description="关键模块实现"),
        DefenseSlideInfo(page=8, title="实验设计", content_type="section", description="实验方案和评价指标"),
        DefenseSlideInfo(page=9, title="实验结果与数据分析" if has_real_data else "实验设计方案与预期结果",
                         content_type="content", description="关键发现和数据"),
        DefenseSlideInfo(page=10, title="结果分析与讨论", content_type="content", description="结果解释和对比"),
        DefenseSlideInfo(page=11, title="创新点", content_type="card_list", description="2-3个创新点"),
        DefenseSlideInfo(page=12, title="总结与展望", content_type="content", description="研究总结和未来方向"),
        DefenseSlideInfo(page=13, title="研究成果", content_type="numbered_list", description="发表论文/系统/数据集"),
        DefenseSlideInfo(page=14, title="答辩问题预测", content_type="numbered_list", description="可能被问的问题"),
        DefenseSlideInfo(page=15, title="致谢", content_type="ending", description="感谢导师和团队"),
    ]
    return DefensePPTOutline(slides=slides, total_slides=len(slides), has_real_data=has_real_data)



# ---- PDF 渲染 ----

def _build_pdf(draft: Draft) -> bytes:
    """将论文草稿渲染为 PDF 字节"""
    from ..services.pdf_builder import PdfBuilder

    pdf = PdfBuilder(draft.title)
    content = draft.content or {}
    for key in PAPER_CHAPTER_KEYS:
        ch = content.get(key, {})
        ch_title = PAPER_CHAPTER_LABELS.get(key, key)
        ch_content = ch.get("content", "") if isinstance(ch, dict) else str(ch)

        pdf.add_heading(ch_title, level=1)
        if ch_content:
            for para_text in ch_content.strip().split("\n"):
                para_text = para_text.strip()
                if not para_text:
                    continue
                pdf.add_body(para_text)

    return pdf.output()


# ---- DOCX 渲染 ----

def _build_docx(draft: Draft) -> io.BytesIO:
    """将论文草稿渲染为 docx 文件"""
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn

    doc = Document()

    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.18)
    section.right_margin = Cm(3.18)

    style = doc.styles["Normal"]
    font = style.font
    font.name = "宋体"
    font.size = Pt(12)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    # 标题
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_para.paragraph_format.space_before = Pt(60)
    title_para.paragraph_format.space_after = Pt(30)
    run = title_para.add_run(draft.title)
    run.bold = True
    run.font.size = Pt(22)
    run.font.name = "黑体"
    run.element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")

    # 章节
    content = draft.content or {}
    for key in PAPER_CHAPTER_KEYS:
        ch = content.get(key, {})
        ch_title = PAPER_CHAPTER_LABELS.get(key, key)
        ch_content = ch.get("content", "") if isinstance(ch, dict) else str(ch)

        heading = doc.add_heading(ch_title, level=1)
        for run in heading.runs:
            run.font.name = "黑体"
            run.element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
            run.font.size = Pt(16)

        if ch_content:
            for para_text in ch_content.strip().split("\n"):
                para_text = para_text.strip()
                if not para_text:
                    continue
                p = doc.add_paragraph()
                p.paragraph_format.first_line_indent = Cm(0.74)
                p.paragraph_format.line_spacing = 1.5
                run = p.add_run(para_text)
                run.font.name = "宋体"
                run.font.size = Pt(12)
                run.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
