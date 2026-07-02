"""Celery 异步任务"""
from .ppt_task import generate_ppt_task
from .paper_task import generate_chapter_task

__all__ = [
    "generate_ppt_task",
    "generate_chapter_task",
]
