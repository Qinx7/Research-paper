"""项目归属校验服务。

集中处理“当前登录用户是否拥有某个项目资源”的判断，避免各个路由重复写不一致的查询条件。
"""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.project import Project
from ..models.project_design import ProjectDesign
from ..models.research_direction import ResearchDirection
from ..models.user import User


def get_owned_project(project_id: UUID | str, current_user: User, db: Session) -> Project:
    """返回当前用户拥有的项目；不存在或不归属时统一按 404 处理。"""
    project = (
        db.query(Project)
        .filter(Project.id == UUID(str(project_id)), Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def get_owned_draft(draft_id: UUID | str, current_user: User, db: Session) -> Draft:
    """返回当前用户拥有项目下的论文草稿。"""
    draft = (
        db.query(Draft)
        .join(Project, Draft.project_id == Project.id)
        .filter(Draft.id == UUID(str(draft_id)), Project.user_id == current_user.id)
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")
    return draft


def query_owned_drafts(db: Session, current_user: User) -> Query:
    """构造仅包含当前用户项目草稿的查询。"""
    return (
        db.query(Draft)
        .join(Project, Draft.project_id == Project.id)
        .filter(Project.user_id == current_user.id)
    )


def get_owned_outcome(outcome_id: UUID | str, current_user: User, db: Session) -> Outcome:
    """返回当前用户拥有项目下的成果文件。"""
    outcome = (
        db.query(Outcome)
        .join(Project, Outcome.project_id == Project.id)
        .filter(Outcome.id == UUID(str(outcome_id)), Project.user_id == current_user.id)
        .first()
    )
    if not outcome:
        raise HTTPException(status_code=404, detail="成果不存在")
    return outcome


def query_owned_outcomes(db: Session, current_user: User) -> Query:
    """构造仅包含当前用户项目成果的查询。"""
    return (
        db.query(Outcome)
        .join(Project, Outcome.project_id == Project.id)
        .filter(Project.user_id == current_user.id)
    )


def query_owned_research_directions(db: Session, current_user: User) -> Query:
    """构造当前用户项目下研究方向的查询。"""
    return (
        db.query(ResearchDirection)
        .join(Project, ResearchDirection.project_id == Project.id)
        .filter(Project.user_id == current_user.id)
    )


def query_owned_project_designs(db: Session, current_user: User) -> Query:
    """构造当前用户项目下设计方案的查询。"""
    return (
        db.query(ProjectDesign)
        .join(Project, ProjectDesign.project_id == Project.id)
        .filter(Project.user_id == current_user.id)
    )


def get_owned_design(design_id: UUID | str, current_user: User, db: Session) -> ProjectDesign:
    """返回当前用户拥有项目下的项目设计。"""
    design = (
        db.query(ProjectDesign)
        .join(Project, ProjectDesign.project_id == Project.id)
        .filter(ProjectDesign.id == UUID(str(design_id)), Project.user_id == current_user.id)
        .first()
    )
    if not design:
        raise HTTPException(status_code=404, detail="项目设计不存在")
    return design
