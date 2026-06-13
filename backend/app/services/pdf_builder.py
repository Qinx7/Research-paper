"""通用 PDF 构建器 —— 封装 fpdf2，提供学术论文/报告排版方法（中文支持）"""
import os
import logging

from fpdf import FPDF

logger = logging.getLogger(__name__)

# ============================================================
# 字体管理
# ============================================================

_FONT_SEARCH_PATHS_WIN = [
    "C:/Windows/Fonts/simhei.ttf",   # TTF 优先于 TTC，兼容性更好
    "C:/Windows/Fonts/simfang.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/msyh.ttc",
]
_FONT_SEARCH_PATHS_LINUX = [
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def _find_system_cjk_font() -> str | None:
    """按平台检测可用的 CJK 字体，返回第一个存在的路径"""
    import platform

    paths = _FONT_SEARCH_PATHS_WIN if platform.system() == "Windows" else _FONT_SEARCH_PATHS_LINUX
    for p in paths:
        if os.path.isfile(p):
            logger.info(f"找到系统 CJK 字体: {p}")
            return p
    return None


def _ensure_cjk_font() -> str:
    """确保有 CJK 字体可用：
    1. 检查系统字体 → 找到即返回
    2. 检查本地缓存 storage/fonts/ → 有则返回
    3. 自动下载开源的 Noto Sans SC 到本地缓存
    """
    path = _find_system_cjk_font()
    if path:
        return path

    storage_fonts = os.path.join(
        os.path.dirname(__file__), "..", "..", "storage", "fonts"
    )
    os.makedirs(storage_fonts, exist_ok=True)
    cache_path = os.path.join(storage_fonts, "NotoSansSC-Regular.otf")
    if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 100_000:
        logger.info(f"使用本地缓存 CJK 字体: {cache_path}")
        return cache_path

    _download_noto_font(cache_path)
    return cache_path


def _download_noto_font(dest_path: str) -> None:
    """下载 Noto Sans SC Regular OTF 字体（SIL Open Font License）"""
    import httpx

    url = (
        "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/"
        "Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
    )
    logger.info(f"正在下载 CJK 字体 ({url})，约 15MB，仅首次需要...")
    try:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(resp.content)
        logger.info(f"CJK 字体已保存到: {dest_path} ({os.path.getsize(dest_path)} bytes)")
    except Exception as e:
        logger.error(f"CJK 字体下载失败: {e}")
        raise RuntimeError(
            f"无法获取中文字体。请手动下载一个 CJK TTF/OTF 字体到 {dest_path}，"
            f"或安装系统 CJK 字体。下载失败原因: {e}"
        ) from e


# ============================================================
# PDF 构建器
# ============================================================

class _AcademicPDF(FPDF):
    """带页码页脚的 FPDF 子类"""

    def __init__(self, font_path: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self._font_path = font_path
        self.add_font("CJK", "", font_path, uni=True)
        self.add_font("CJK", "B", font_path, uni=True)
        self.set_auto_page_break(auto=True, margin=25)

    def footer(self):
        self.set_y(-20)
        self.set_font("CJK", "", 9)
        self.cell(0, 10, str(self.page_no()), align="C")


class PdfBuilder:
    """通用 PDF 构建器，封装 fpdf2 的 A4 学术排版。

    用法:
        pdf = PdfBuilder("论文标题")
        pdf.add_heading("第一章 绪论")
        pdf.add_body("这是正文内容……")
        pdf_bytes = pdf.output()
    """

    def __init__(self, title: str):
        self._font_path = _ensure_cjk_font()
        self._pdf = _AcademicPDF(self._font_path)
        self._pdf.add_page()

        # 封面标题
        self._pdf.ln(40)
        self._pdf.set_font("CJK", "B", 22)
        self._pdf.multi_cell(0, 14, title, align="C")
        self._pdf.ln(20)

    def add_heading(self, text: str, level: int = 1) -> None:
        """渲染章节标题。level=1 黑体 16pt，level=2 黑体 13pt"""
        size = 16 if level == 1 else 13
        spacing_before = 10 if level == 1 else 6
        spacing_after = 6 if level == 1 else 3

        self._pdf.ln(spacing_before)
        self._pdf.set_font("CJK", "B", size)
        self._pdf.multi_cell(0, size * 0.65, text)
        self._pdf.ln(spacing_after)

    def add_body(self, text: str) -> None:
        """渲染正文段落：宋体 12pt，首行缩进 2 字符，1.5 倍行距"""
        self._pdf.set_font("CJK", "", 12)
        line_height = 9  # 约 1.5 倍行距
        indent = 8.5  # 2 个中文字符宽度

        # 先写占位缩进空格，再用多行文本
        # 注意：fpdf2 的 multi_cell(w=0) 在自定义左边距后 x 可能不重置，用显式宽度
        available_w = self._pdf.w - self._pdf.r_margin - self._pdf.l_margin - indent
        self._pdf.set_x(self._pdf.l_margin + indent)
        self._pdf.multi_cell(available_w, line_height, text, align="L")
        self._pdf.set_x(self._pdf.l_margin)  # 显式重置 x

    def output(self) -> bytes:
        """返回 PDF 字节"""
        return self._pdf.output()
