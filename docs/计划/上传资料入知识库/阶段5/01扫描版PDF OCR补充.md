# 阶段 5：扫描版 PDF OCR 补充

## 1. 目标

在现有“上传资料解析入知识库”基础上，补充扫描版 PDF 的 OCR 能力。当 `pypdf` 提取不到文本时，系统自动进入 OCR fallback，把 PDF 页面渲染为图片，再识别文字，最后复用已有清洗、切分和入库流程。

## 2. 当前环境结论

已检查当前后端虚拟环境：

- 已有：`Pillow`
- 未安装：`pytesseract`、`pdf2image`、`PyMuPDF/fitz`、`PaddleOCR`、`EasyOCR`、`opencv`
- 系统未识别：`tesseract` 命令

因此扫描版 PDF 目前不能直接解析，必须新增 OCR 依赖或安装系统级 OCR 工具。

## 3. 推荐路线

推荐优先采用 `PyMuPDF + pytesseract + Tesseract OCR`：

- `PyMuPDF` 负责把 PDF 页面渲染为图片，不依赖 Poppler。
- `pytesseract` 负责调用本机 Tesseract OCR。
- Tesseract 需要系统安装，并安装中文语言包 `chi_sim`，英文使用 `eng`。
- 优点是轻量、可控、对现有后端侵入小。
- 缺点是需要用户本机安装 Tesseract，可移植性弱于纯 Python 模型。

## 4. 备选路线

### 方案 A：PyMuPDF + pytesseract + Tesseract OCR（推荐）

适合当前项目本地开发和单机部署。依赖相对轻，识别速度尚可，中文识别需要安装语言包。

新增依赖：

- `PyMuPDF`
- `pytesseract`

系统依赖：

- Tesseract OCR Windows 安装包
- 中文语言包 `chi_sim.traineddata`

### 方案 B：PaddleOCR

中文识别效果通常更好，尤其是中文扫描件和复杂版面。但依赖较重，安装包大，Windows 环境更容易遇到兼容问题。

适合后续做“正式 OCR 能力”时再考虑。

### 方案 C：只提示用户安装 OCR，不自动识别

实现最小，但不能满足“扫描版 PDF 也做”的目标，只适合作为失败提示兜底。

## 5. 设计改动

在 `document_parse_service.py` 中调整 PDF 解析流程：

1. 先用 `pypdf` 提取文本。
2. 如果文本为空或过短，判断为可能扫描件。
3. 调用 OCR fallback：
   - 用 PyMuPDF 渲染前 N 页或全部页。
   - 用 pytesseract 识别图片文字。
   - 合并每页识别结果。
4. 若 OCR 仍为空，返回明确错误：`PDF 未提取到文字，OCR 识别为空。`

## 6. 安全与性能边界

- 默认限制 OCR 页数，建议先设为 20 页，避免大 PDF 阻塞后端。
- 默认 DPI 建议 180 到 220，兼顾速度和识别质量。
- OCR 失败不能影响原文件下载。
- 错误信息要明确区分：缺少 OCR 引擎、缺少中文语言包、识别为空、文件损坏。

## 7. 验收标准

- 文本型 PDF 仍走 `pypdf`，不被 OCR 拖慢。
- 扫描版 PDF 在安装 OCR 环境后能提取出文字并入库。
- 未安装 Tesseract 时返回清晰错误，不出现 500 空白失败。
- 成果管理页能显示解析失败原因。
- 后端解析测试和前端构建通过。
