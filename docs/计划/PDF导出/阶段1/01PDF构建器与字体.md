# 阶段 1 · PDF 构建器与字体管理

## 目标

安装 fpdf2，创建通用 PDF 构建服务模块，解决中文字体问题。

## 步骤

### 1.1 安装 fpdf2

```bash
pip install fpdf2
```

`requirements.txt` 追加一行 `fpdf2`（版本不锁定，让 pip 解析兼容版本）。

### 1.2 新建 `backend/app/services/pdf_builder.py`

#### 设计原则

- 类 `PdfBuilder` 封装 fpdf2 的 FPDF 实例
- 提供论文/报告场景的预设布局方法（封面标题、一级标题、正文段落、页码）
- 与 `_build_docx()` 调用风格一致，替换成本低

#### 核心 API

```python
class PdfBuilder:
    """通用 PDF 构建器。封装 fpdf2，提供学术论文/报告排版方法。"""

    def __init__(self, title: str):
        # A4 纸，自动分页，注册中文字体
        ...

    def add_heading(self, text: str, level: int = 1) -> None:
        """一级/二级标题。level=1 黑体 16pt，level=2 黑体 13pt"""
        ...

    def add_body(self, text: str) -> None:
        """正文段落。宋体 12pt，首行缩进 2 字符，1.5 倍行距"""
        ...

    def add_page_number(self) -> None:
        """页脚居中页码"""
        ...

    def output(self) -> bytes:
        """返回 PDF 字节"""
        ...
```

#### 字体管理（模块级辅助函数）

```python
# 优先级从高到低的字体搜索路径
_FONT_SEARCH_PATHS_WIN = [
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/msyh.ttc",
]
_FONT_SEARCH_PATHS_LINUX = [
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
]

_FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "fonts")

def _find_system_cjk_font() -> str | None:
    """按平台检测可用的 CJK 字体，返回第一个存在的 ttf/ttc 路径。"""
    ...

def _ensure_cjk_font() -> str:
    """
    确保有 CJK 字体可用：
    1. 检查系统字体 → 找到即返回
    2. 检查 storage/fonts/ 是否有已下载的字体 → 有则返回
    3. 自动下载 Noto Sans SC Regular 到 storage/fonts/ → 返回路径
    """
    ...
```

#### 字体自动下载

若系统无 CJK 字体，从 Google Fonts 下载 Noto Sans SC（SIL Open Font License，可自由分发）：

- URL：`https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf`
- 保存到 `storage/fonts/NotoSansSC-Regular.ttf`
- 一次性操作，约 10MB，后续直接读取本地文件
- 使用 httpx 下载，复用项目现有的 httpx 依赖

### 1.3 验证

在 Python 交互环境中测试：

```python
from app.services.pdf_builder import PdfBuilder

b = PdfBuilder("测试论文标题")
b.add_heading("第一章 绪论", level=1)
b.add_body("这是一段中文测试正文，用于验证中文字体渲染是否正常。")
b.add_heading("1.1 研究背景", level=2)
b.add_body("首行缩进 2 字符，1.5 倍行距。包含中文标点：，。；：""！")
pdf_bytes = b.output()
with open("test_output.pdf", "wb") as f:
    f.write(pdf_bytes)
```

检查点：
- PDF 文件可正常打开
- 中文无乱码，无豆腐块
- 首行缩进、行距符合预期
- A4 纸尺寸正确
