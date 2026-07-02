# 闃舵 2 姝ラ 01锛欰PI 绔偣 + 绔犺妭鐢熸垚鑷姩妫€鏌?
## 鐩爣

鍦?drafts API 涓柊澧炲悎瑙勬鏌ョ鐐癸紝骞跺湪绔犺妭鐢熸垚浠诲姟瀹屾垚鍚庤嚜鍔ㄨЕ鍙戣鍒欐鏌ャ€?
## 1. API 绔偣锛堜慨鏀?`backend/app/api/drafts.py`锛?
### 1.1 杩愯鍚堣妫€鏌?
```python
@router.post("/{draft_id}/check-compliance")
def check_compliance(
    draft_id: str,
    enable_ai: bool = Query(False, description="鏄惁鍚敤 AI 娣卞害妫€鏌?),
    db: Session = Depends(get_db),
):
    """瀵硅鏂囪崏绋胯繍琛屽叏閮ㄥ悎瑙勬鏌ワ紙瑙勫垯 + 鍙€?AI 璇箟瀵规瘮锛?""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="鑽夌涓嶅瓨鍦?)

    outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
    papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()

    result = check_draft(draft, outcomes, papers, enable_ai=enable_ai)

    # 鎸佷箙鍖栧悎瑙勭粨鏋滃埌 draft.content 鐨?_compliance 瀛楁
    content = draft.content or {}
    content["_compliance"] = result.model_dump(mode="json")
    draft.content = content
    db.commit()

    return result
```

### 1.2 鐢ㄦ埛纭 issues

```python
@router.post("/{draft_id}/confirm-compliance")
def confirm_compliance(
    draft_id: str,
    payload: ComplianceConfirmRequest,
    db: Session = Depends(get_db),
):
    """鐢ㄦ埛纭/蹇界暐/淇鏌愪釜鍚堣 issue"""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="鑽夌涓嶅瓨鍦?)

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

### 1.3 鑾峰彇鍚堣鐘舵€?
```python
@router.get("/{draft_id}/compliance-status")
def get_compliance_status(draft_id: str, db: Session = Depends(get_db)):
    """鑾峰彇璁烘枃鑽夌鐨勫悎瑙勬鏌ョ姸鎬?""
    draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
    if not draft:
        raise HTTPException(status_code=404, detail="鑽夌涓嶅瓨鍦?)

    content = draft.content or {}
    compliance = content.get("_compliance")
    if not compliance:
        return {"checked": False, "message": "灏氭湭鎵ц鍚堣妫€鏌?}

    return compliance
```

## 2. 绔犺妭鐢熸垚鍚庤嚜鍔ㄨ鍒欐鏌ワ紙淇敼 `backend/app/tasks/paper_task.py`锛?
鍦?`generate_chapter_task` 涓紝绔犺妭鍐呭淇濆瓨鍒?DB 鍚庯紝杩藉姞锛?
```python
# 鑷姩杩愯瑙勫垯妫€鏌ワ紙涓嶅惈 AI锛?from ..services.compliance_checker import check_draft
outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()
result = check_draft(draft, outcomes, papers, enable_ai=False)

# 瀛樺叆 draft.content._compliance
content = draft.content or {}
content["_compliance"] = result.model_dump(mode="json")
draft.content = content
db.commit()
```

AI 娣卞害妫€鏌ヤ笉鑷姩瑙﹀彂锛堣€楁椂杈冮暱锛屼笉閫傚悎鍦?Celery 浠诲姟涓繍琛岋級锛岀敱鐢ㄦ埛鍦ㄥ墠绔墜鍔ㄨЕ鍙戙€?
## 3. 楠岃瘉

1. `POST /api/drafts/{id}/check-compliance` 鈫?杩斿洖 ComplianceResult
2. `POST /api/drafts/{id}/check-compliance?enable_ai=true` 鈫?杩斿洖鍚?AI 妫€鏌ョ粨鏋滅殑 ComplianceResult
3. `POST /api/drafts/{id}/confirm-compliance` 鈫?issue 纭鎴愬姛
4. 璋冪敤 `generate_chapter_task` 鍚?鈫?`_compliance` 瀛楁鑷姩鍐欏叆

