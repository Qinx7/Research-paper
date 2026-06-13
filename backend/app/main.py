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
from .core.database import engine, Base, SessionLocal

# 启动时自动建表（数据库不可用时不阻塞启动）
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

# 启用 pgvector 扩展并创建向量存储表（数据库不可用时不阻塞启动）
try:
    db = SessionLocal()
    from .services.embedding_service import ensure_document_vectors_table
    ensure_document_vectors_table(db)
    db.close()
except Exception:
    pass

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


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
