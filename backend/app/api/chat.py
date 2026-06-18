"""聊天 API 路由 —— SSE 流式对话 + 对话 CRUD"""
import asyncio
import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.conversation import Conversation, Message
from ..models.project import Project
from ..models.project_design import ProjectDesign
from ..models.proposal import Proposal
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.user import User
from ..schemas.chat import ChatSendRequest, ConversationOut, ConversationDetail
from ..schemas.paper import LiteratureSearchRequest
from ..agents.chat_agent import chat_stream, extract_keywords, build_search_plan
from ..agents.literature_search_agent import literature_search_agent
from ..services.embedding_service import search_similar_papers, batch_store_papers
from ..services.evidence_retrieval_service import (
    retrieve_project_evidence,
    retrieve_project_paper_evidence,
    tokenize_evidence_query,
)
from ..services.literature_search_task_service import create_search_task, mark_task_failed, mark_task_running, mark_task_success
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _sse_event(event_type: str, data: dict | str) -> str:
    """格式化为 SSE 事件字符串"""
    if isinstance(data, str):
        payload = {"type": event_type, "content": data}
    else:
        payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _build_project_private_context(db: Session, project_id: str, query: str) -> tuple[str, list[dict]]:
    """从项目私有资料中提取与当前问题最相关的证据片段。"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return "", []

    query_tokens = set(tokenize_evidence_query(query))
    supporting_candidates: list[dict] = []

    def add_candidate(
        kind: str,
        title: str,
        content: str,
        action_url: str | None = None,
        action_label: str | None = None,
        extra: dict | None = None,
    ):
        text = (content or "").strip()
        if not text:
            return
        # 只要用户主动选择了项目，就允许把项目内资料作为候选证据返回；
        # 若问题关键词命中，则额外加分排序，避免“项目已选但证据为空”的体验。
        score = 1
        lowered = text.lower()
        for token in query_tokens:
            if token in lowered:
                score += 1
                if title and token in title.lower():
                    score += 1
        supporting_candidates.append({
            "kind": kind,
            "title": title,
            "content_excerpt": text[:600],
            "score": score,
            "action_url": action_url,
            "action_label": action_label,
            **(extra or {}),
        })

    base_summary = "\n".join(
        part for part in [
            f"项目名称：{project.name}" if project.name else "",
            f"研究领域：{project.research_field}" if project.research_field else "",
            f"研究需求：{project.user_requirement}" if project.user_requirement else "",
            f"选题方向：{project.selected_topic}" if project.selected_topic else "",
            f"项目状态：{project.status}" if project.status else "",
        ]
        if part
    )
    add_candidate(
        "项目概况",
        project.name or "当前项目",
        base_summary,
        action_url=f"/projects/{project.id}",
        action_label="打开项目",
    )

    latest_design = (
        db.query(ProjectDesign)
        .filter(ProjectDesign.project_id == project.id)
        .order_by(ProjectDesign.created_at.desc())
        .first()
    )
    if latest_design:
        add_candidate(
            "项目设计",
            latest_design.topic,
            json.dumps(latest_design.content or {}, ensure_ascii=False),
            action_url=f"/projects/{project.id}",
            action_label="打开项目",
        )

    latest_proposal = (
        db.query(Proposal)
        .filter(Proposal.project_id == project.id)
        .order_by(Proposal.created_at.desc())
        .first()
    )
    if latest_proposal:
        add_candidate(
            "开题报告",
            latest_proposal.title,
            json.dumps(latest_proposal.content or {}, ensure_ascii=False),
            action_url=f"/api/proposal/{latest_proposal.id}/download",
            action_label="下载报告",
        )

    latest_draft = (
        db.query(Draft)
        .filter(Draft.project_id == project.id)
        .order_by(Draft.updated_at.desc())
        .first()
    )
    if latest_draft:
        add_candidate(
            "论文草稿",
            latest_draft.title,
            json.dumps(latest_draft.content or {}, ensure_ascii=False),
            action_url=f"/api/drafts/{latest_draft.id}/download",
            action_label="下载草稿",
        )

    outcomes = (
        db.query(Outcome)
        .filter(Outcome.project_id == project.id)
        .order_by(Outcome.created_at.desc())
        .limit(20)
        .all()
    )
    for outcome in outcomes:
        payload = f"{outcome.name}\n{outcome.description or ''}\n{json.dumps(outcome.extra_data or {}, ensure_ascii=False)}"
        add_candidate(
            f"项目成果[{outcome.outcome_type}]",
            outcome.name,
            payload,
            action_url=f"/api/outcomes/{outcome.id}/download" if outcome.file_path else f"/projects/{project.id}",
            action_label="打开成果" if outcome.file_path else "打开项目",
        )

    note_items = retrieve_project_evidence(db, project.id, query, limit=6, min_confidence=0)
    paper_items = retrieve_project_paper_evidence(db, project.id, query, limit=6)
    if len(note_items) + len(paper_items) < 3:
        fallback_papers = retrieve_project_paper_evidence(db, project.id, "", limit=3)
        existing_titles = {item["title"] for item in paper_items}
        for paper_item in fallback_papers:
            if paper_item["title"] in existing_titles:
                continue
            paper_items.append(paper_item)
            existing_titles.add(paper_item["title"])
    supporting_candidates.sort(key=lambda item: item["score"], reverse=True)

    evidence_candidates = sorted(
        note_items + paper_items,
        key=lambda item: (
            1 if item["kind"] == "paper_note" else 0,
            item["score"],
            item.get("confidence") or 0,
            item.get("citation_count") or 0,
        ),
        reverse=True,
    )
    top_items = evidence_candidates[:6]
    if len(top_items) < 6:
        top_items.extend(supporting_candidates[: 6 - len(top_items)])
    if not top_items:
        return "", []

    lines = [f"当前项目：{project.name}", "以下是与当前问题最相关的项目内资料：", ""]
    for idx, item in enumerate(top_items, 1):
        if item["kind"] == "paper_note":
            lines.append(f"[P{idx}] 内部证据卡片 · {item['title']}")
            lines.append(f"类型：{item.get('note_type') or 'note'}")
            if item.get("source_title"):
                lines.append(f"来源文献：{item['source_title']}")
            if item.get("evidence_text"):
                lines.append(f"证据摘录：{item['evidence_text']}")
            if item.get("confidence") is not None:
                lines.append(f"可靠性：{item['confidence']}/100")
            if item.get("score_reasons"):
                lines.append(f"命中原因：{'、'.join(item['score_reasons'])}")
        elif item["kind"] == "project_paper":
            lines.append(f"[P{idx}] 项目文献 · {item['title']}")
            if item.get("venue") or item.get("year"):
                venue_line = " · ".join(
                    part for part in [item.get("venue"), str(item.get("year")) if item.get("year") else None] if part
                )
                if venue_line:
                    lines.append(f"载体信息：{venue_line}")
            if item.get("citation_count") is not None:
                lines.append(f"引用量：{item['citation_count']}")
            if item.get("score_reasons"):
                lines.append(f"命中原因：{'、'.join(item['score_reasons'])}")
            lines.append(item["content_excerpt"])
        else:
            lines.append(f"[P{idx}] {item['kind']} · {item['title']}")
            lines.append(item["content_excerpt"])
        lines.append("")

    return "\n".join(lines).strip(), top_items


async def _run_literature_search_in_worker(**kwargs) -> dict:
    """在线程池中执行同步文献检索，避免 Playwright Sync API 运行在 asyncio 循环中。"""
    return await asyncio.to_thread(literature_search_agent.search_by_requirement, **kwargs)


def _should_run_keyword_search(
    *,
    cn_keywords: list[str],
    en_keywords: list[str],
    library_scope: str,
) -> bool:
    if library_scope == "cn":
        return bool(cn_keywords)
    if library_scope == "en":
        # 中文关键词可由 LLM 转译为英文检索词，不必跳过
        return bool(cn_keywords or en_keywords)
    return bool(cn_keywords or en_keywords)


def _build_scope_search_status(
    *,
    cn_keywords: list[str],
    en_keywords: list[str],
    library_scope: str,
) -> dict | None:
    if library_scope == "cn":
        if cn_keywords:
            return {"status": "searching_cn", "message": "正在检索中文学术文献..."}
        return {"status": "thinking", "message": "未提取到有效中文关键词，跳过中文文献检索"}
    if library_scope == "en":
        if en_keywords:
            return {"status": "searching_en", "message": "正在检索英文学术文献..."}
        if cn_keywords:
            return {"status": "searching_en", "message": "正在将中文关键词转译为英文并检索英文学术文献..."}
        return {"status": "thinking", "message": "未提取到有效关键词，跳过检索"}

    if cn_keywords and en_keywords:
        return {"status": "searching_all", "message": "正在检索中英文学术文献..."}
    if cn_keywords:
        return {"status": "searching_cn", "message": "正在检索中文学术文献..."}
    if en_keywords:
        return {"status": "searching_en", "message": "正在检索英文学术文献..."}
    return None


@router.post("/send")
async def send_message(
    payload: ChatSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发送消息，以 SSE 流式返回回复。

    流程：
    1. 如果开启学术检索：提取关键词 → 搜索文献 → 发送 status 事件
    2. 流式调用 DeepSeek → 逐 token 发送
    3. 保存对话和消息到数据库
    """

    created_new_conversation = False
    # --- 查找或创建对话 ---
    if payload.conversation_id:
        conversation = db.query(Conversation).filter(
            Conversation.id == payload.conversation_id,
            Conversation.user_id == current_user.id,
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
    else:
        # 用消息前 30 字作为标题
        title = payload.message.strip()[:30] + ("..." if len(payload.message.strip()) > 30 else "")
        conversation = Conversation(title=title, user_id=current_user.id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        created_new_conversation = True

    conv_id = str(conversation.id)

    # --- 获取历史消息 ---
    history_messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in history_messages]

    # --- 学术检索（可选） ---
    search_papers: list[dict] = []
    search_status = None
    search_plan = build_search_plan(
        payload.message,
        research_mode=payload.research_mode,
        library_scope=payload.library_scope,
    )
    project_context = ""
    project_context_items: list[dict] = []
    source_statuses: dict = {}
    search_task_id: str | None = None

    if payload.search_enabled:
        cn_kw, en_kw = extract_keywords(payload.message)
        if cn_kw or en_kw:
            search_status = {"status": "planning", "message": "正在理解问题并规划学术检索..."}
        else:
            search_status = {"status": "thinking", "message": "未提取到有效关键词，跳过检索"}

    async def generate():
        try:
            nonlocal search_papers, project_context, project_context_items, source_statuses, search_task_id
            if payload.project_id:
                get_owned_project(payload.project_id, current_user, db)

            # 发送检索状态
            if search_status:
                yield _sse_event("status", search_status)

            # 执行检索（关键词 + 向量语义检索）
            if payload.search_enabled:
                cn_kw, en_kw = extract_keywords(payload.message)
                keyword_papers: list[dict] = []
                vector_papers: list[dict] = []
                scope_status = _build_scope_search_status(
                    cn_keywords=cn_kw,
                    en_keywords=en_kw,
                    library_scope=search_plan["library_scope"],
                )
                if scope_status:
                    yield _sse_event("status", scope_status)

                # 1. 关键词检索（传统文献搜索）
                if _should_run_keyword_search(
                    cn_keywords=cn_kw,
                    en_keywords=en_kw,
                    library_scope=search_plan["library_scope"],
                ):
                    task = None
                    try:
                        task_payload = LiteratureSearchRequest(
                            project_id=payload.project_id,
                            keywords_cn=cn_kw,
                            keywords_en=en_kw,
                            year_from=2020,
                            year_to=2026,
                            mode=search_plan["research_mode"],
                            library_scope=search_plan["library_scope"],
                            min_citation_count=search_plan["min_citation_count"],
                            prefer_high_impact=search_plan["prefer_high_impact"],
                        )
                        task = create_search_task(db, task_payload)
                        search_task_id = str(task.id)
                        mark_task_running(db, task.id)
                    except Exception as e:
                        logger.warning(f"创建聊天检索任务失败: {e}")
                        db.rollback()
                    try:
                        search_result = await _run_literature_search_in_worker(
                            keywords_cn=cn_kw,
                            keywords_en=en_kw,
                            year_from=2020,
                            year_to=2026,
                            limit=search_plan["limit"],
                            mode=search_plan["research_mode"],
                            library_scope=search_plan["library_scope"],
                            min_citation_count=search_plan["min_citation_count"],
                            prefer_high_impact=search_plan["prefer_high_impact"],
                            open_access_only=False,
                            quality_tags=[],
                        )
                        keyword_papers = search_result.get("papers", [])
                        source_statuses = search_result.get("source_statuses", {})
                        if task:
                            mark_task_success(db, task.id, search_result)
                    except Exception as e:
                        logger.warning(f"学术检索失败: {e}")
                        if task:
                            try:
                                mark_task_failed(db, task.id, str(e))
                            except Exception as task_error:
                                logger.warning(f"保存聊天检索任务失败状态失败: {task_error}")
                                db.rollback()

                # 2. 向量语义检索（在已索引论文中搜索）
                try:
                    yield _sse_event("status", {
                        "status": "evidence_ranking",
                        "message": "正在补充语义检索并整理证据...",
                    })
                    vector_papers = search_similar_papers(
                        db=db,
                        query=payload.message,
                        top_k=5,
                        threshold=0.35,
                    )
                except Exception as e:
                    logger.warning(f"向量检索失败: {e}")

                # 3. 合并去重（关键词结果优先，通过 DOI 去重）
                seen_dois: set[str] = set()
                search_papers = []
                for p in keyword_papers:
                    doi = p.get("doi", "")
                    if doi and doi in seen_dois:
                        continue
                    if doi:
                        seen_dois.add(doi)
                    search_papers.append(p)
                for p in vector_papers:
                    doi = p.get("doi", "")
                    if doi and doi in seen_dois:
                        continue
                    if doi:
                        seen_dois.add(doi)
                    search_papers.append(p)

                # 4. 将关键词检索到的新论文批量存入向量库（后台积累知识）
                if keyword_papers:
                    stored_count = batch_store_papers(db, keyword_papers)
                    if stored_count > 0:
                        logger.info(f"已向量化存储 {stored_count} 篇论文")

                # 5. 发送状态
                total = len(search_papers)
                yield _sse_event("status", {
                    "status": "answering",
                    "message": (
                        f"已按{search_plan['research_mode']}模式找到 {total} 篇相关文献"
                        f"（关键词 {len(keyword_papers)} + 语义 {len(vector_papers)}），正在生成学术回答..."
                    ),
                })

            if payload.project_id:
                yield _sse_event("status", {
                    "status": "project_context",
                    "message": "正在整理当前项目的私有资料证据...",
                })
                try:
                    db.rollback()
                except Exception:
                    pass
                project_context, project_context_items = _build_project_private_context(db, payload.project_id, payload.message)

            if payload.search_enabled or search_papers or project_context_items:
                yield _sse_event("sources", {
                    "external_papers": search_papers[:8],
                    "project_context_items": project_context_items[:6],
                    "source_statuses": source_statuses,
                    "task_id": search_task_id,
                })

            # 流式 LLM 回复
            full_content = ""
            async for token in chat_stream(
                message=payload.message,
                history=history,
                search_papers=search_papers,
                research_mode=payload.research_mode,
                intent=search_plan["intent"],
                project_context=project_context,
            ):
                full_content += token
                yield _sse_event("token", token)

            # 保存前先回滚，确保事务干净（前序向量检索等操作可能中断了事务）
            try:
                db.rollback()
            except Exception:
                pass

            # 保存用户消息和 AI 回复
            user_msg = Message(
                conversation_id=conversation.id,
                role="user",
                content=payload.message,
            )
            db.add(user_msg)

            assistant_msg = Message(
                conversation_id=conversation.id,
                role="assistant",
                content=full_content,
                search_results=(
                    {
                        "external_papers": search_papers[:8],
                        "project_context_items": project_context_items[:6],
                        "source_statuses": source_statuses,
                        "task_id": search_task_id,
                    }
                    if (payload.search_enabled or payload.project_id or search_papers or project_context_items)
                    else None
                ),
            )
            db.add(assistant_msg)

            # 更新对话时间
            conversation.updated_at = datetime.utcnow()
            db.commit()

            yield _sse_event("done", {
                "conversation_id": conv_id,
                "message_id": str(assistant_msg.id),
            })
        except Exception as e:
            logger.warning(f"聊天流处理失败: {e}")
            db.rollback()
            try:
                # 若本次是新建对话且尚未成功落任何消息，则删除空对话，避免历史列表残留空标题
                if created_new_conversation:
                    empty_conv = db.query(Conversation).filter(Conversation.id == conversation.id).first()
                    if empty_conv and len(empty_conv.messages or []) == 0:
                        db.delete(empty_conv)
                        db.commit()
            except Exception:
                db.rollback()
            yield _sse_event("error", {
                "message": str(e) or "对话处理失败",
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取对话列表，按更新时间倒序"""
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for c in conversations:
        if len(c.messages or []) == 0:
            continue
        item = ConversationOut.model_validate(c)
        item.message_count = len(c.messages or [])
        result.append(item)
    return result


@router.get("/conversations/{conv_id}")
def get_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取对话详情（含所有消息）"""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="对话不存在")
    return ConversationDetail.model_validate(conversation)


@router.delete("/conversations/{conv_id}")
def delete_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除对话"""
    from uuid import UUID
    try:
        UUID(conv_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="对话不存在")

    try:
        db.rollback()
    except Exception:
        pass

    try:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        # 先显式删除关联消息，避免 cascade 配置问题
        for msg in conversation.messages or []:
            db.delete(msg)
        db.flush()
        db.delete(conversation)
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")
