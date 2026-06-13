# 阶段 2 步骤 01：API 端点 + 章节生成自动检查

## 目标

在 drafts API 中新增合规检查端点，并在章节生成任务完成后自动触发规则检查。

## 1. API 端点（修改 `backend/app/api/drafts.py`）

### 1.1 运行合规检查

```python
@router.post("/{draft_id}/check-compliance")
def check_compliance(
    draft_id: str,
    enable_ai: bool = Query(False, description="是否启用 AI 深度检查"),
    db: Session = Depends(get_db),
):
    """对论文草稿运行全部合规检查（规则 + 可选 AI 语义对比）"""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")

    outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
    papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()

    result = check_draft(draft, outcomes, papers, enable_ai=enable_ai)

    # 持久化合规结果到 draft.content 的 _compliance 字段
    content = draft.content or {}
    content["_compliance"] = result.model_dump(mode="json")
    draft.content = content
    db.commit()

    return result
```

### 1.2 用户确认 issues

```python
@router.post("/{draft_id}/confirm-compliance")
def confirm_compliance(
    draft_id: str,
    payload: ComplianceConfirmRequest,
    db: Session = Depends(get_db),
):
    """用户确认/忽略/修正某个合规 issue"""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")

    content = draft.content or {}
    compliance = content.get("_compliance", {})
    chapters = compliance.get("chapters", {})

    chapter = chapters.get(payload.chapter_key)
    if chapter and payload.issue_index < len(chapter.get("issues", [])):
        issue = chapter["issues"][payload.issue_index]
        issue["user_action"] = payload.action
        issue["confirmed_at"] = datetime.utcnow().isoformat()

    content["_compliance"] = compliance
    draft.content = content
    db.commit()

    return {"status": "ok", "chapter_key": payload.chapter_key}
```

### 1.3 获取合规状态

```python
@router.get("/{draft_id}/compliance-status")
def get_compliance_status(draft_id: str, db: Session = Depends(get_db)):
    """获取论文草稿的合规检查状态"""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")

    content = draft.content or {}
    compliance = content.get("_compliance")
    if not compliance:
        return {"checked": False, "message": "尚未执行合规检查"}

    return compliance
```

## 2. 章节生成后自动规则检查（修改 `backend/app/tasks/paper_task.py`）

在 `generate_chapter_task` 中，章节内容保存到 DB 后，追加：

```python
# 自动运行规则检查（不含 AI）
from ..services.compliance_checker import check_draft
outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()
result = check_draft(draft, outcomes, papers, enable_ai=False)

# 存入 draft.content._compliance
content = draft.content or {}
content["_compliance"] = result.model_dump(mode="json")
draft.content = content
db.commit()
```

AI 深度检查不自动触发（耗时较长，不适合在 Celery 任务中运行），由用户在前端手动触发。

## 3. 验证

1. `POST /api/drafts/{id}/check-compliance` → 返回 ComplianceResult
2. `POST /api/drafts/{id}/check-compliance?enable_ai=true` → 返回含 AI 检查结果的 ComplianceResult
3. `POST /api/drafts/{id}/confirm-compliance` → issue 确认成功
4. 调用 `generate_chapter_task` 后 → `_compliance` 字段自动写入
