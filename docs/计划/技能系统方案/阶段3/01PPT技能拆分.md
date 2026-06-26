# 阶段3：PPT 技能拆分

## 1. 目标

把开题 PPT 与答辩 PPT 生成流程拆成 skill，而不是继续只靠单一 Agent 入口。

## 2. 建议 skill

### 2.1 开题 PPT

- `ppt.proposal_outline`
- `ppt.proposal_render`

### 2.2 答辩 PPT

- `ppt.defense_outline`
- `ppt.defense_render`
- `ppt.script_generate`

## 3. 当前最小接入建议

第一阶段只真正接入：

1. `ppt.defense_outline`
2. `ppt.defense_render`

因为答辩 PPT 当前已经更接近稳定产品路径。
