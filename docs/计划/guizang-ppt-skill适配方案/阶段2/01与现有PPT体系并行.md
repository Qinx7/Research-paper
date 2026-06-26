# 阶段2：与现有 PPT 体系并行

## 1. 目标

确保 HTML deck 是新增能力，而不是替换当前 `.pptx` 正式链路。

## 2. 并行策略

### 当前正式链路

- `ppt.proposal_render`
- `ppt.defense_render`
- `.pptx`

### 新增实验链路

- `ppt.web_html_deck`
- `.html`

## 3. 前端建议

第一阶段前端只新增一个可选入口，例如：

- `预览 HTML Deck`

不要替换：

- `下载 PPTX`
- `生成答辩 PPT`

## 4. 验收

- 用户仍能正常使用现有 PPT
- HTML deck 作为附加输出存在
