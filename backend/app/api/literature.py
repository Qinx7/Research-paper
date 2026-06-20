"""文献相关 API 路由"""
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.requirement_agent import requirement_agent
from ..agents.literature_review_agent import literature_review_agent
from ..agents.workflows import run_literature_search_workflow
from ..core.config import settings
from ..core.database import get_db, SessionLocal
from ..models.paper import Paper
from ..models.project import Project
from ..models.user import User
from ..schemas.paper import (
    LiteratureSearchRequest,
    KeywordsRequest,
    LiteratureAnalyzeRequest,
    PaperOut,
    PaperSaveRequest,
    PaperAnalysisOut,
    LiteratureMatrixOut,
)
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_project
from ..services.knowledge_graph_service import build_knowledge_graph
from ..services.literature_matrix_service import build_literature_matrix
from ..services.literature_search_task_service import (
    create_search_task,
    mark_task_failed,
    mark_task_running,
    mark_task_success,
)
from ..services.paper_analysis_service import analyze_saved_paper

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/literature", tags=["literature"])


@router.post("/keywords")
def generate_keywords(
    payload: KeywordsRequest,
    current_user: User = Depends(get_current_user),
):
    """
    根据用户需求生成检索关键词（调用需求理解 Agent）。

    请求体：`{"requirement": "大语言模型在高校教学中的应用"}`
    """
    analysis = requirement_agent.analyze(payload.requirement)
    return {
        "requirement": payload.requirement,
        "keywords_cn": analysis.get("keywords_cn", []),
        "keywords_en": analysis.get("keywords_en", []),
    }


@router.post("/search")
def search_literature(
    payload: LiteratureSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    根据关键词检索文献，结果自动保存到数据库。

    请求体：
    {
        "keywords_cn": ["大语言模型"],
        "keywords_en": ["large language model", "education"],
        "year_from": 2020,
        "year_to": 2026
    }
    """
    if payload.project_id:
        get_owned_project(payload.project_id, current_user, db)

    task = create_literature_search_task(payload)
    if task:
        mark_literature_search_task_running(task.id)

    try:
        result = run_literature_search_workflow(
            keywords_cn=payload.keywords_cn,
            keywords_en=payload.keywords_en,
            year_from=payload.year_from or 2020,
            year_to=payload.year_to or 2026,
            limit=30,
            mode=payload.mode,
            library_scope=payload.library_scope,
            sources=payload.sources,
            min_citation_count=payload.min_citation_count,
            prefer_high_impact=payload.prefer_high_impact,
            open_access_only=payload.open_access_only,
            quality_tags=payload.quality_tags,
            search_task_id=str(task.id) if task else None,
            user_id=str(current_user.id) if getattr(current_user, "id", None) else None,
            project_id=str(payload.project_id) if payload.project_id else None,
            record_db=db,
        )

        # 尝试保存到数据库（数据库不可用时静默跳过）
        saved_count = _save_papers_to_db(result["papers"])
        if saved_count > 0:
            logger.info(f"文献检索完成: {result['total_found']} 条, 新入库 {saved_count} 条")
        if task:
            complete_literature_search_task(task.id, result)

        return {**result, "saved_to_db": saved_count, "task_id": str(task.id) if task else None}
    except Exception as e:
        if task:
            fail_literature_search_task(task.id, str(e))
        raise


def create_literature_search_task(payload: LiteratureSearchRequest):
    """为同步检索创建任务记录；失败不影响检索主流程。"""
    db = None
    try:
        db = SessionLocal()
        return create_search_task(db, payload)
    except Exception as e:
        logger.warning("创建检索任务失败: %s", e)
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()


def mark_literature_search_task_running(task_id):
    """把检索任务标记为执行中；记录失败不影响检索主流程。"""
    db = None
    try:
        db = SessionLocal()
        return mark_task_running(db, task_id)
    except Exception as e:
        logger.warning("更新检索任务状态失败: %s", e)
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()


def complete_literature_search_task(task_id, result: dict):
    """保存检索任务的来源诊断和结果快照。"""
    db = None
    try:
        db = SessionLocal()
        return mark_task_success(db, task_id, result)
    except Exception as e:
        logger.warning("保存检索任务结果失败: %s", e)
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()


def fail_literature_search_task(task_id, message: str):
    """保存检索任务失败摘要。"""
    db = None
    try:
        db = SessionLocal()
        return mark_task_failed(db, task_id, message)
    except Exception as e:
        logger.warning("保存检索任务失败状态失败: %s", e)
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()


def _save_papers_to_db(papers: list[dict]) -> int:
    """将检索结果保存到数据库，返回新入库数量。DB 不可用时返回 0。"""
    from ..core.database import SessionLocal

    db = None
    saved_count = 0
    try:
        db = SessionLocal()
        for p in papers:
            try:
                exists = db.query(Paper).filter(Paper.title == p["title"]).first()
                if exists:
                    continue
                paper = Paper(
                    title=p["title"],
                    authors=";".join(p.get("authors") or []),
                    year=p.get("year"),
                    venue=p.get("venue"),
                    doi=p.get("doi"),
                    abstract=p.get("abstract"),
                    url=p.get("url"),
                    citation_count=p.get("citation_count", 0),
                    source=p.get("source"),
                )
                db.add(paper)
                saved_count += 1
            except Exception:
                continue
        if saved_count > 0:
            db.commit()
    except Exception:
        if db:
            db.rollback()
    finally:
        if db:
            db.close()
    return saved_count


@router.get("/papers", response_model=list[PaperOut])
def list_papers(
    source: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """查询已保存的文献列表，可按来源过滤。DB 不可用时返回空列表。"""
    from ..core.database import SessionLocal

    db = None
    try:
        db = SessionLocal()
        q = db.query(Paper).order_by(Paper.created_at.desc())
        if source:
            q = q.filter(Paper.source == source)
        return q.offset(offset).limit(limit).all()
    except Exception:
        return []
    finally:
        if db:
            db.close()


@router.get("/projects/{project_id}/papers", response_model=list[PaperOut])
def list_project_papers(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出某个项目沉淀下来的文献库。"""
    project = _get_owned_project(project_id, current_user, db)
    return (
        db.query(Paper)
        .filter(Paper.project_id == project.id)
        .order_by(Paper.created_at.desc())
        .all()
    )


@router.get("/projects/{project_id}/papers/{paper_id}", response_model=PaperOut)
def get_project_paper(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取项目文献库中的单篇文献详情。"""
    from uuid import UUID as UUIDType

    project = _get_owned_project(project_id, current_user, db)
    paper = (
        db.query(Paper)
        .filter(Paper.id == UUIDType(paper_id), Paper.project_id == project.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    return paper


@router.get("/projects/{project_id}/matrix", response_model=LiteratureMatrixOut)
def get_project_literature_matrix(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成项目文献库的结构化矩阵。"""
    project = _get_owned_project(project_id, current_user, db)
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project.id)
        .order_by(Paper.created_at.desc())
        .all()
    )
    return build_literature_matrix(papers, project.user_requirement)


@router.post("/projects/{project_id}/papers", response_model=PaperOut, status_code=201)
def save_project_paper(
    project_id: str,
    payload: PaperSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """把搜索结果保存到项目文献库，优先复用同项目内已有记录。"""
    project = _get_owned_project(project_id, current_user, db)
    normalized_title = payload.title.strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="文献标题不能为空")

    existing = (
        db.query(Paper)
        .filter(Paper.project_id == project.id, Paper.title == normalized_title)
        .first()
    )
    if existing:
        return existing

    cached = (
        db.query(Paper)
        .filter(Paper.project_id.is_(None), Paper.title == normalized_title)
        .first()
    )
    if cached:
        cached.project_id = project.id
        cached.relevance_score = payload.relevance_score or cached.relevance_score or 0.0
        db.commit()
        db.refresh(cached)
        return cached

    paper = Paper(
        project_id=project.id,
        title=normalized_title,
        authors=";".join(payload.authors or []),
        year=payload.year,
        venue=payload.venue,
        doi=payload.doi,
        abstract=payload.abstract,
        url=payload.url,
        citation_count=payload.citation_count or 0,
        source=payload.source,
        relevance_score=payload.relevance_score or 0.0,
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return paper


@router.post("/projects/{project_id}/papers/{paper_id}/analyze", response_model=PaperAnalysisOut)
def analyze_project_paper(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """对项目文献库中的单篇文献做保守结构化分析。"""
    from uuid import UUID as UUIDType

    project = _get_owned_project(project_id, current_user, db)
    paper = (
        db.query(Paper)
        .filter(Paper.id == UUIDType(paper_id), Paper.project_id == project.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    return analyze_saved_paper(paper, project.user_requirement)


@router.delete("/projects/{project_id}/papers/{paper_id}", status_code=204)
def remove_project_paper(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """从项目文献库移除文献；保留全局缓存记录，避免破坏检索缓存。"""
    from uuid import UUID as UUIDType

    project = _get_owned_project(project_id, current_user, db)
    paper = (
        db.query(Paper)
        .filter(Paper.id == UUIDType(paper_id), Paper.project_id == project.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    paper.project_id = None
    db.commit()
    return None


def _get_owned_project(project_id: str, current_user: User, db: Session) -> Project:
    """确保项目存在且属于当前登录用户。"""
    from uuid import UUID as UUIDType

    project = (
        db.query(Project)
        .filter(Project.id == UUIDType(project_id), Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.post("/analyze")
def analyze_literature(
    payload: LiteratureAnalyzeRequest,
    current_user: User = Depends(get_current_user),
):
    """
    对文献列表进行结构化分析（调用文献综述 Agent）。

    输入检索到的 papers 列表 + 用户研究需求，返回：
    - 每篇文献的结构化总结
    - 研究热点列表
    - 研究空白列表
    - 可切入的研究点建议

    请求体：
    {
        "papers": [{"title": "...", "authors": [...], ...}, ...],
        "requirement": "大语言模型在高校教学中的应用"
    }
    """
    try:
        logger.info(f"分析开始: {len(payload.papers)} 篇论文, 需求: {payload.requirement[:50] if payload.requirement else '无'}")
        result = literature_review_agent.analyze_papers(
            papers=payload.papers,
            research_requirement=payload.requirement or "",
        )
        logger.info(f"分析完成: {result.get('analyzed_papers', 0)} 篇总结")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文献分析异常: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"文献分析服务异常: {str(e)}")


# ---- 知识图谱 ----

@router.get("/{project_id}/knowledge-graph")
def get_knowledge_graph(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取项目文献的知识图谱数据。

    返回 4 种视图：
    - network: 力导向关系网络（论文-关键词-作者）
    - timeline: 时间线演进
    - clusters: 主题聚类
    - impact: 引用影响力排行
    - stats: 统计摘要
    """
    from uuid import UUID as UUIDType

    project = get_owned_project(project_id, current_user, db)
    papers = db.query(Paper).filter(Paper.project_id == project.id).all()
    if not papers:
        return build_knowledge_graph([])

    result = build_knowledge_graph(
        papers=papers,
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        model=settings.DEEPSEEK_MODEL,
    )
    return result
