# 闃舵 2 路 璁烘枃鑽夌 PDF 瀵煎嚭

## 鐩爣

鍦?`drafts.py` 涓鍔?`_build_pdf()` 鍑芥暟锛岃 `/api/drafts/{id}/download` 鏀寔 `?format=pdf`銆?
## 姝ラ

### 2.1 鏂板 `_build_pdf(draft) -> bytes`

鍦?`drafts.py` 涓紙涓?`_build_docx` 鍚屼綅缃級鏂板锛?
```python
def _build_pdf(draft: Draft) -> bytes:
    """灏嗚鏂囪崏绋挎覆鏌撲负 PDF 瀛楄妭"""
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

### 2.2 鏀归€?`download_draft` 绔偣

鍦ㄧ幇鏈?`GET /{draft_id}/download` 鍑芥暟涓鍔?`format` 鏌ヨ鍙傛暟锛?
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
        filename = ...  # .pdf 鍚庣紑
        object_key = f"drafts/draft_{draft_id}.pdf"
        buf = io.BytesIO(_build_pdf(draft))
    else:
        # 鍘熸湁 docx 閫昏緫涓嶅彉
```

瑕佺偣锛?- 榛樿 `docx` 淇濇寔鍚戝悗鍏煎
- PDF 涔熻蛋 MinIO 浼樺厛 鈫?鏈湴 fallback 璺緞
- PDF 缂撳瓨 key 涓?DOCX 鍒嗗紑锛堜笉鍚?object_key锛?
### 2.3 楠岃瘉

```bash
# 鐢熸垚 PDF
curl -o draft.pdf "http://localhost:8000/api/drafts/{draft_id}/download?format=pdf"
# 鎵撳紑 draft.pdf 妫€鏌ワ細灏侀潰鏍囬 鈫?鍚勭珷鑺傛爣棰?鈫?姝ｆ枃 鈫?鏃犱贡鐮?
# 榛樿浠嶈繑鍥?DOCX
curl -o draft.docx "http://localhost:8000/api/drafts/{draft_id}/download"
# 纭 docx 琛屼负鏈彈褰卞搷
```

