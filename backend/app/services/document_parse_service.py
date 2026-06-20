"""上传资料文本解析与切分服务。"""
from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass

from docx import Document

from ..core.config import settings


class UnsupportedDocumentType(ValueError):
    """文件类型暂不支持解析。"""


class DocumentParseError(ValueError):
    """文件内容解析失败。"""


@dataclass(frozen=True)
class ParsedChunk:
    """解析后可入库的文本片段。"""

    index: int
    content: str


@dataclass(frozen=True)
class ParsedDocument:
    """解析后的文档正文和元数据。"""

    text: str
    source_type: str
    meta: dict


SUPPORTED_PARSE_EXTENSIONS = {".txt", ".md", ".docx", ".pdf"}
OCR_MAX_PAGES = 20
OCR_DPI = 200


def extract_text_from_bytes(data: bytes, filename: str) -> ParsedDocument:
    """按文件扩展名从字节内容中提取正文。"""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in SUPPORTED_PARSE_EXTENSIONS:
        raise UnsupportedDocumentType(f"不支持解析该文件类型：{ext or '未知类型'}")

    if ext in {".txt", ".md"}:
        text = _decode_text(data)
        return ParsedDocument(text=clean_extracted_text(text), source_type=ext, meta={"parser": "text"})

    if ext == ".docx":
        text = _extract_docx_text(data)
        return ParsedDocument(text=clean_extracted_text(text), source_type=ext, meta={"parser": "python-docx"})

    return _extract_pdf_document(data)


def clean_extracted_text(text: str) -> str:
    """清洗解析文本，保留段落边界并移除多余空白。"""
    normalized = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    lines = [line.strip() for line in normalized.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def chunk_text(text: str, *, chunk_size: int = 1600, overlap: int = 200) -> list[ParsedChunk]:
    """按字符长度切分文本，保留少量重叠避免跨段信息断裂。"""
    cleaned = clean_extracted_text(text)
    if not cleaned:
        return []

    safe_size = max(1, chunk_size)
    safe_overlap = max(0, min(overlap, safe_size // 2))
    chunks: list[ParsedChunk] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + safe_size)
        if end < len(cleaned):
            split_at = max(cleaned.rfind("\n", start, end), cleaned.rfind("。", start, end))
            if split_at > start + safe_size // 2:
                end = split_at + 1
        content = cleaned[start:end].strip()
        if content:
            chunks.append(ParsedChunk(index=len(chunks), content=content))
        if end >= len(cleaned):
            break
        start = max(0, end - safe_overlap)
    return chunks


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentParseError("文本编码无法识别，请转换为 UTF-8 后重试。")


def _extract_docx_text(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
        paragraphs = [paragraph.text.strip() for paragraph in doc.paragraphs if paragraph.text.strip()]
        return "\n".join(paragraphs)
    except Exception as exc:
        raise DocumentParseError(f"DOCX 解析失败：{exc}") from exc


def _extract_pdf_document(data: bytes) -> ParsedDocument:
    """先用 pypdf 提取文本，文本为空时回退到 OCR。"""
    text = _extract_pdf_text(data)
    cleaned = clean_extracted_text(text)
    if cleaned:
        return ParsedDocument(text=cleaned, source_type=".pdf", meta={"parser": "pypdf"})

    ocr_text = _ocr_pdf_text(data)
    cleaned_ocr = clean_extracted_text(ocr_text)
    if not cleaned_ocr:
        raise DocumentParseError("PDF 未提取到文字，OCR 识别结果为空。")
    return ParsedDocument(text=cleaned_ocr, source_type=".pdf", meta={"parser": "pypdf+ocr"})


def _extract_pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise DocumentParseError("当前环境缺少 PDF 解析库 pypdf，请安装依赖后重试。") from exc

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(pages).strip()
    except Exception as exc:
        raise DocumentParseError(f"PDF 解析失败：{exc}") from exc


def _ocr_pdf_text(data: bytes, *, max_pages: int = OCR_MAX_PAGES, dpi: int = OCR_DPI) -> str:
    """将扫描版 PDF 页面渲染为图片并调用 Tesseract OCR。"""
    try:
        import fitz
        import pytesseract
        from PIL import Image
    except Exception as exc:
        raise DocumentParseError("当前环境缺少 OCR 依赖 PyMuPDF 或 pytesseract，请安装后重试。") from exc

    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

    try:
        pytesseract.get_tesseract_version()
    except Exception as exc:
        raise DocumentParseError("当前环境缺少 OCR 引擎 Tesseract，请先安装 Tesseract OCR 和中文语言包。") from exc

    try:
        doc = fitz.open(stream=data, filetype="pdf")
        page_count = min(len(doc), max_pages)
        zoom = dpi / 72
        matrix = fitz.Matrix(zoom, zoom)
        texts: list[str] = []
        for index in range(page_count):
            page = doc.load_page(index)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            try:
                page_text = pytesseract.image_to_string(image, lang="chi_sim+eng")
            except Exception:
                page_text = pytesseract.image_to_string(image, lang="eng")
            if page_text.strip():
                texts.append(page_text)
        return "\n".join(texts)
    except DocumentParseError:
        raise
    except Exception as exc:
        raise DocumentParseError(f"PDF OCR 识别失败：{exc}") from exc
