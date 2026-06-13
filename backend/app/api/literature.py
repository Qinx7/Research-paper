"""文献相关 API 路由"""
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.requirement_agent import requirement_agent
from ..agents.literature_search_agent import literature_search_agent
from ..agents.literature_review_agent import literature_review_agent
from ..core.config import settings
from ..core.database import get_db
from ..models.paper import Paper
from ..schemas.paper import (
    LiteratureSearchRequest,
    KeywordsRequest,
    LiteratureAnalyzeRequest,
    PaperOut,
)
from ..services.knowledge_graph_service import build_knowledge_graph

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/literature", tags=["literature"])


@router.post("/keywords")
def generate_keywords(payload: KeywordsRequest):
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
def search_literature(payload: LiteratureSearchRequest):
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
    result = literature_search_agent.search_by_requirement(
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
    )

    # 尝试保存到数据库（数据库不可用时静默跳过）
    saved_count = _save_papers_to_db(result["papers"])
    if saved_count > 0:
        logger.info(f"文献检索完成: {result['total_found']} 条, 新入库 {saved_count} 条")

    return {**result, "saved_to_db": saved_count}


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


@router.post("/analyze")
def analyze_literature(payload: LiteratureAnalyzeRequest):
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
def get_knowledge_graph(project_id: str, db: Session = Depends(get_db)):
    """获取项目文献的知识图谱数据。

    返回 4 种视图：
    - network: 力导向关系网络（论文-关键词-作者）
    - timeline: 时间线演进
    - clusters: 主题聚类
    - impact: 引用影响力排行
    - stats: 统计摘要
    """
    from uuid import UUID as UUIDType

    papers = db.query(Paper).filter(Paper.project_id == UUIDType(project_id)).all()
    if not papers:
        return build_knowledge_graph([])

    result = build_knowledge_graph(
        papers=papers,
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        model=settings.DEEPSEEK_MODEL,
    )
    return result
