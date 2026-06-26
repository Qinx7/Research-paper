# 阶段2 01 当前 Schema 基线迁移

## 目标

为当前模型结构建立一份明确的初始迁移。

## 建议策略

1. 以当前 `models` 为准生成基线
2. 迁移内容至少覆盖当前主表与关键索引
3. 对已由 `schema_compat` 兜底的列，也应纳入正式迁移

## 特别关注

1. `conversations.user_id`
2. `research_directions.content`
3. `project_designs.content`
4. 现有 `project_document_chunks`
5. `generated_artifacts`

## 风险

1. 自动生成迁移可能漏索引、默认值或 PostgreSQL 特性
2. 基线迁移需要人工审查，不能盲信 autogenerate

## 验证点

1. 空库执行 upgrade 能建出主表
2. 关键 JSONB / UUID / 索引正确生成
