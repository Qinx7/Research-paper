# 阶段 2 · 开题报告 PDF 导出

## 目标

在 `proposal.py` 中增加 `_build_pdf()` 函数，让 `/api/proposal/{id}/download` 支持 `?format=pdf`。

## 步骤

### 2.1 新增 `_build_pdf(proposal) -> bytes`

在 `proposal.py` 中（与 `_build_docx` 同位置）新增：

```python
def _build_pdf(proposal: Proposal) -> bytes:
    """将开题报告渲染为 PDF 字节"""
    from ..services.pdf_builder import PdfBuilder

    pdf = PdfBuilder(proposal.title)

    content = proposal.content or {}
    for key in SECTION_KEYS:  # proposal 用 SECTION_KEYS，不是 PAPER_CHAPTER_KEYS
        section = content.get(key, {})
        sec_title = SECTION_LABELS.get(key, key)
        sec_content = section.get("content", "") if isinstance(section, dict) else str(section)

        pdf.add_heading(sec_title, level=1)

        if sec_content:
            for para_text in sec_content.strip().split("\n"):
                para_text = para_text.strip()
                if not para_text:
                    continue
                pdf.add_body(para_text)

    return pdf.output()
```

### 2.2 改造 `download_proposal` 端点

在现有 `GET /{proposal_id}/download` 函数中增加 `format` 查询参数：

```python
@router.get("/{proposal_id}/download")
def download_proposal(
    proposal_id: str,
    db: Session = Depends(get_db),
    format: str = Query("docx", regex="^(docx|pdf)$"),
):
    ...
    if format == "pdf":
        content_type = "application/pdf"
        filename = ...  # .pdf 后缀
        buf = io.BytesIO(_build_pdf(proposal))
    else:
        # 原有 docx 逻辑不变
```

要点：
- 使用 `SECTION_KEYS`/`SECTION_LABELS`（proposal 的章节常量），不是 drafts 的
- 其余逻辑与 drafts 改动一致

### 2.3 验证

```bash
# 生成 PDF
curl -o proposal.pdf "http://localhost:8000/api/proposal/{proposal_id}/download?format=pdf"

# 默认仍返回 DOCX
curl -o proposal.docx "http://localhost:8000/api/proposal/{proposal_id}/download"
```
