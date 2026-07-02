"""研究方向与项目设计 API 路由"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import inspect

from ..agents.research_direction_agent import research_direction_agent
from ..agents.project_design_agent import project_design_agent
from ..agents.workflows import (
    run_generate_project_design_workflow,
    run_generate_research_directions_workflow,
)
from ..core.database import SessionLocal, get_db
from ..models.research_direction import ResearchDirection
from ..models.project_design import ProjectDesign
from ..models.user import User
from ..schemas.research_direction import GenerateDirectionsRequest, GenerateDesignRequest, SaveDirectionRequest
from ..services.auth_dependency import get_current_user
from ..services.ownership import (
    get_owned_project,
    query_owned_project_designs,
    query_owned_research_directions,
)
from ..skills import get_default_skill_runtime

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/directions")
def generate_directions(
    payload: GenerateDirectionsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    根据文献分析结果生成 3-5 个可研究方向，并进行多维度评分。
    结果自动持久化到数据库。
    """
    project_id = get_owned_project(payload.project_id, current_user, db).id if payload.project_id else None
    skill_runtime = get_default_skill_runtime()
    try:
        skill_runtime.router.resolve(domain="research", action="generate_directions")
        return run_generate_research_directions_workflow(
            db=db,
            literature_analysis=payload.literature_analysis,
            requirement=payload.requirement or "",
            project_id=str(project_id) if project_id else None,
            user_id=str(current_user.id),
            direction_agent=research_direction_agent,
            record_db=db,
            skill_executor=skill_runtime.executor,
            skill_router=skill_runtime.router,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"研究方向生成失败：{exc}")

    # 持久化到数据库
    project_id = get_owned_project(payload.project_id, current_user, db).id if payload.project_id else None

    saved_ids = []
    for direction, score in zip(result["directions"], result["scores"]):
        saved_id = _save_single_direction_to_db(direction, score, project_id)
        saved_ids.append(saved_id)

    return {
        "requirement": payload.requirement,
        "directions_count": len(result["directions"]),
        "directions": result["directions"],
        "scores": result["scores"],
        "saved_ids": saved_ids,
    }


@router.post("/directions/save")
def save_direction(
    payload: SaveDirectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """保存前端当前选中的单个研究方向，避免重新生成导致内容漂移。"""
    if not payload.direction.get("title"):
        raise HTTPException(status_code=400, detail="研究方向标题不能为空")
    project = get_owned_project(payload.project_id, current_user, db)
    saved_id = _save_single_direction_to_db(payload.direction, payload.score or {}, project.id)
    if not saved_id:
        raise HTTPException(status_code=500, detail="研究方向保存失败")
    return {"saved_id": saved_id}


@router.post("/design")
def generate_design(
    payload: GenerateDesignRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    根据选定的研究方向生成完整项目设计方案（18 项内容）。
    结果自动持久化到数据库。
    """
    project_id = get_owned_project(payload.project_id, current_user, db).id if payload.project_id else None
    skill_runtime = get_default_skill_runtime()
    try:
        skill_runtime.router.resolve(domain="research", action="generate_design")
        return run_generate_project_design_workflow(
            db=db,
            direction=payload.direction,
            literature_analysis=payload.literature_analysis or {},
            requirement=payload.requirement or "",
            project_id=str(project_id) if project_id else None,
            direction_id=str(payload.direction_id) if payload.direction_id else None,
            user_id=str(current_user.id),
            project_design_agent=project_design_agent,
            record_db=db,
            skill_executor=skill_runtime.executor,
            skill_router=skill_runtime.router,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"项目设计生成失败：{exc}")


@router.get("/directions")
def list_directions(
    project_id: UUID | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询已生成的研究方向列表。DB 不可用时返回空列表。"""
    try:
        q = query_owned_research_directions(db, current_user).order_by(ResearchDirection.created_at.desc())
        if project_id:
            project = get_owned_project(project_id, current_user, db)
            q = q.filter(ResearchDirection.project_id == project.id)
        rows = q.limit(limit).all()
        return [
            {
                "id": str(r.id),
                "project_id": str(r.project_id) if r.project_id else None,
                "title": r.title,
                "background": r.background,
                "content": r.content,
                "feasibility_score": r.feasibility_score,
                "recommendation_score": r.recommendation_score,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    except Exception:
        return []


@router.get("/designs")
def list_designs(
    project_id: UUID | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询已生成的项目设计方案列表。DB 不可用时返回空列表。"""
    try:
        q = query_owned_project_designs(db, current_user).order_by(ProjectDesign.created_at.desc())
        if project_id:
            project = get_owned_project(project_id, current_user, db)
            q = q.filter(ProjectDesign.project_id == project.id)
        rows = q.limit(limit).all()
        return [
            {
                "id": str(r.id),
                "project_id": str(r.project_id) if r.project_id else None,
                "direction_id": str(r.direction_id) if r.direction_id else None,
                "topic": r.topic,
                "content": r.content,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    except Exception:
        return []


# ========== 数据库持久化 ==========

def _save_directions_to_db(
    directions: list[dict],
    scores: list[dict],
    project_id: UUID | None = None,
) -> list[str]:
    """将生成的研究方向保存到数据库，返回已保存的 ID 列表"""
    db = None
    saved_ids: list[str] = []
    try:
        db = SessionLocal()
        # 建立评分映射（按标题匹配）
        score_map = {s.get("title", ""): s.get("scores", {}) for s in scores}

        for d in directions:
            title = d.get("title", "")
            sc = score_map.get(title, {})
            payload = dict(
                project_id=project_id,
                title=title,
                background=d.get("background"),
                research_questions=_to_json_str(d.get("research_questions", [])),
                methods=_to_json_str(d.get("methods", [])),
                expected_outputs=_to_json_str(d.get("expected_outputs", [])),
                innovation=_to_json_str(d.get("innovation", [])),
                feasibility_score=_to_float(sc.get("feasibility")),
                recommendation_score=_to_float(sc.get("overall")),
            )
            if _table_has_column(db, "research_directions", "content"):
                payload["content"] = {**d, "scores": sc}
            direction = ResearchDirection(**payload)
            db.add(direction)
            db.flush()
            saved_ids.append(str(direction.id))
        db.commit()
    except Exception:
        if db:
            db.rollback()
    finally:
        if db:
            db.close()
    return saved_ids


def _save_single_direction_to_db(
    direction: dict,
    score: dict | None,
    project_id: UUID,
) -> str | None:
    """将用户选中的单个研究方向保存到数据库，返回已保存的 ID。"""
    db = None
    try:
        db = SessionLocal()
        sc = (score or {}).get("scores", {})
        payload = dict(
            project_id=project_id,
            title=direction.get("title", ""),
            background=direction.get("background"),
            research_questions=_to_json_str(direction.get("research_questions", [])),
            methods=_to_json_str(direction.get("methods", [])),
            expected_outputs=_to_json_str(direction.get("expected_outputs", [])),
            innovation=_to_json_str(direction.get("innovation", [])),
            feasibility_score=_to_float(sc.get("feasibility")),
            recommendation_score=_to_float(sc.get("overall")),
        )
        if _table_has_column(db, "research_directions", "content"):
            payload["content"] = {**direction, "scores": sc}
        saved = ResearchDirection(**payload)
        db.add(saved)
        db.flush()
        saved_id = str(saved.id)
        db.commit()
        return saved_id
    except Exception:
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()

_TABLE_COLUMN_RUNTIME_CACHE: dict[tuple[str, str], tuple[str, ...]] = {}

def _table_has_column(db: Session, table_name: str, column_name: str) -> bool:
    try:
        bind = db.get_bind()
        bind_url = str(getattr(bind, "url", ""))
        cache_key = (bind_url, table_name)
        cached = _TABLE_COLUMN_RUNTIME_CACHE.get(cache_key)
        if cached is not None:
            return column_name in cached
        inspector = inspect(bind)
        columns = tuple(column["name"] for column in inspector.get_columns(table_name))
        _TABLE_COLUMN_RUNTIME_CACHE[cache_key] = columns
        return column_name in columns
    except Exception:
        # 无法探测时保守放行，避免影响已正常运行的新库结构。
        return True


def _save_design_to_db(
    design: dict,
    project_id: UUID | None = None,
    direction_id: UUID | None = None,
) -> str | None:
    """将项目设计方案保存到数据库，返回已保存的 ID"""
    db = None
    try:
        db = SessionLocal()
        pd = ProjectDesign(
            project_id=project_id,
            direction_id=direction_id,
            topic=design.get("topic", ""),
            content=design,
        )
        db.add(pd)
        db.commit()
        db.refresh(pd)
        return str(pd.id)
    except Exception:
        if db:
            db.rollback()
        return None
    finally:
        if db:
            db.close()


# ========== 辅助函数 ==========

def _to_json_str(val) -> str | None:
    """将列表或字典转为 JSON 字符串"""
    import json
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return json.dumps(val, ensure_ascii=False)
    return str(val)


def _to_float(val) -> float | None:
    """安全转为浮点数"""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
