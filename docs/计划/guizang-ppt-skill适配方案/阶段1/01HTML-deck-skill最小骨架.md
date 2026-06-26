# 阶段1：HTML deck skill 最小骨架

## 1. 目标

在不影响现有 `.pptx` 主链路的前提下，新增一个实验型 skill：

- `ppt.web_html_deck`

## 2. 建议新增文件

```text
backend/app/skills/definitions/ppt_web_html_deck.py
backend/app/services/web_deck_render_service.py
```

## 3. 最小输入

建议输入：

- `deck_title`
- `deck_mode`
- `theme`
- `slides_outline`
- `source_context`

## 4. 最小输出

建议输出：

- `artifact_type`
- `title`
- `object_key`
- `preview_url`
- `download_url`

## 5. 第一阶段不做

- 不接图片自动生成
- 不接多平台封面
- 不接原仓库的全部模板体系
