"""Celery 异步任务"""
from .ppt_task import generate_ppt_task
from .proposal_task import generate_proposal_task
from .paper_task import generate_chapter_task
from .defense_ppt_task import generate_defense_ppt_task

__all__ = [
    "generate_ppt_task",
    "generate_proposal_task",
    "generate_chapter_task",
    "generate_defense_ppt_task",
]
