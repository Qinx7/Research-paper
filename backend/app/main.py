"""文献驱动型研究生科研 Agent —— 后端入口"""
import asyncio
import sys

# Windows 上 Playwright 需要 ProactorEventLoop 来支持子进程创建
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.projects import router as projects_router
from .api.literature import router as literature_router
from .api.research import router as research_router
from .api.ppt import router as ppt_router
from .api.agents import router as agents_router
from .api.chat import router as chat_router
from .api.proposal import router as proposal_router
from .api.tasks import router as tasks_router
from .api.outcomes import router as outcomes_router
from .api.drafts import router as drafts_router
from .api.defense import router as defense_router
from .api.zotero import router as zotero_router
from .api.auth import router as auth_router
from .api.paper_notes import router as paper_notes_router
from .api.literature_search_tasks import router as literature_search_tasks_router
from .api.agent_workflows import router as agent_workflows_router
from .core.database import engine, Base, SessionLocal
from .core.config import settings
from . import models  # noqa: F401  # 导入模型，确保 create_all 能发现所有表

# 启动前安全检查
import logging

logger = logging.getLogger(__name__)

if not settings.JWT_SECRET_KEY:
    logger.error("JWT_SECRET_KEY 未设置！生产环境必须通过环境变量配置强随机密钥")
    sys.exit(1)

if settings.JWT_SECRET_KEY == "your_jwt_secret":
    logger.error("JWT_SECRET_KEY 仍为默认值！生产环境必须修改")
    sys.exit(1)

if settings.APP_ENV == "production":
    if not settings.MINIO_ACCESS_KEY or settings.MINIO_ACCESS_KEY == "minioadmin":
        logger.error("生产环境必须设置安全的 MINIO_ACCESS_KEY")
        sys.exit(1)
    if not settings.MINIO_SECRET_KEY or settings.MINIO_SECRET_KEY == "minioadmin":
        logger.error("生产环境必须设置安全的 MINIO_SECRET_KEY")
        sys.exit(1)

# 启动时自动建表（数据库不可用时不阻塞启动）
try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    import logging

    logging.getLogger(__name__).warning("初始化数据库表失败: %s", exc)

# 启用 pgvector 扩展并创建向量存储表（数据库不可用时不阻塞启动）
db = None
try:
    db = SessionLocal()
    from .services.embedding_service import ensure_document_vectors_table
    from .services.schema_compat import (
        ensure_conversation_user_column,
        ensure_project_design_content_column,
        ensure_research_direction_content_column,
    )

    ensure_conversation_user_column(db)
    ensure_research_direction_content_column(db)
    ensure_project_design_content_column(db)
    ensure_document_vectors_table(db)
except Exception as exc:
    import logging

    logging.getLogger(__name__).warning("初始化向量存储失败: %s", exc)
finally:
    if db is not None:
        db.close()

app = FastAPI(
    title="Literature-driven Graduate Research Agent",
    description="文献驱动型研究生科研设计与成果生成 Agent —— MVP V0.1",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api")
app.include_router(literature_router, prefix="/api")
app.include_router(research_router, prefix="/api")
app.include_router(ppt_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(proposal_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(outcomes_router, prefix="/api")
app.include_router(drafts_router, prefix="/api")
app.include_router(defense_router, prefix="/api")
app.include_router(zotero_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(paper_notes_router, prefix="/api")
app.include_router(literature_search_tasks_router, prefix="/api")
app.include_router(agent_workflows_router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
