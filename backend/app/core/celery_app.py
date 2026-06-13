"""Celery 应用配置 —— Redis 作为 broker 和 result backend"""
from celery import Celery

from .config import settings

celery_app = Celery(
    "research_agent",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    # 只订阅本项目相关任务，避免自动发现意外模块
    include=[
        "app.tasks.ppt_task",
        "app.tasks.proposal_task",
        "app.tasks.paper_task",
        "app.tasks.defense_ppt_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,        # 任务完成后才确认，避免 worker 崩溃丢任务
    worker_prefetch_multiplier=1,  # 一次只取一个任务，适合长任务
    result_expires=3600,         # 结果 1 小时后过期
)
