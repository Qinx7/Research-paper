# 阶段 2 · 论文草稿 PDF 导出

## 目标

在 `drafts.py` 中增加 `_build_pdf()` 函数，让 `/api/drafts/{id}/download` 支持 `?format=pdf`。

## 步骤

### 2.1 新增 `_build_pdf(draft) -> bytes`

在 `drafts.py` 中（与 `_build_docx` 同位置）新增：

```python
def _build_pdf(draft: Draft) -> bytes:
    """将论文草稿渲染为 PDF 字节"""
    from ..services.pdf_builder import PdfBuilder

    pdf = PdfBuilder(draft.title)

    content = draft.content or {}
    for key in PAPER_CHAPTER_KEYS:
        ch = content.get(key, {})
        ch_title = PAPER_CHAPTER_LABELS.get(key, key)
        ch_content = ch.get("content", "") if isinstance(ch, dict) else str(ch)

        pdf.add_heading(ch_title, level=1)

        if ch_content:
            for para_text in ch_content.strip().split("\n"):
                para_text = para_text.strip()
                if not para_text:
                    continue
                pdf.add_body(para_text)

    return pdf.output()
```

### 2.2 改造 `download_draft` 端点

在现有 `GET /{draft_id}/download` 函数中增加 `format` 查询参数：

```python
@router.get("/{draft_id}/download")
def download_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    format: str = Query("docx", regex="^(docx|pdf)$"),
):
    ...
    if format == "pdf":
        content_type = "application/pdf"
        filename = ...  # .pdf 后缀
        object_key = f"drafts/draft_{draft_id}.pdf"
        buf = io.BytesIO(_build_pdf(draft))
    else:
        # 原有 docx 逻辑不变
```

要点：
- 默认 `docx` 保持向后兼容
- PDF 也走 MinIO 优先 → 本地 fallback 路径
- PDF 缓存 key 与 DOCX 分开（不同 object_key）

### 2.3 验证

```bash
# 生成 PDF
curl -o draft.pdf "http://localhost:8000/api/drafts/{draft_id}/download?format=pdf"
# 打开 draft.pdf 检查：封面标题 → 各章节标题 → 正文 → 无乱码

# 默认仍返回 DOCX
curl -o draft.docx "http://localhost:8000/api/drafts/{draft_id}/download"
# 确认 docx 行为未受影响
```
