# 阶段 4：Skill 调用面收敛

## 1. 目标

把 skill runtime 正式作为 workflow 节点调用专业能力的统一入口。业务 workflow 可以继续调用已有 Agent，但应通过 skill 定义表达能力、输入、输出、校验和版本。

## 2. 当前基础

已有文件：

- `backend/app/skills/models.py`
- `backend/app/skills/registry.py`
- `backend/app/skills/router.py`
- `backend/app/skills/executor.py`
- `backend/app/skills/runtime.py`
- `backend/app/skills/definitions/paper.py`
- `backend/app/skills/definitions/research.py`
- `backend/app/skills/definitions/ppt.py`

已有 skill：

- `paper.plan`
- `paper.outline_generate`
- `paper.review_pass`
- `paper.revision_apply`
- `paper.full_review_pass`
- `paper.full_revision_apply`
- `paper.chapter_draft`
- `paper.chapter_grounding`
- `research.direction_generate`
- `research.direction_score`
- `research.project_design_generate`
- `ppt.web_html_deck`

## 3. 收敛原则

1. 生成、校验、渲染类节点优先通过 skill runtime 调用。
2. 检索、数据库读写、文件解析这类服务型能力可以保持 service 调用。
3. skill definition 必须声明 `input_schema` 和 `output_schema` 的 required 字段。
4. skill 执行结果必须写入节点 metadata：`skill_id`、`skill_version`、`domain`、`action`。
5. 不为已下线能力新增 skill。

## 4. 建议新增辅助能力

### 4.1 SkillNodeMixin

为 workflow 节点提供轻量辅助方法：

- 解析 `domain + action`。
- 执行 skill。
- 把 `skill_id` 和版本写入 metadata。
- 把 skill 异常转换为 `AgentNodeResult.failed`。

该辅助能力不要变成复杂基类体系，先保持小而清晰。

### 4.2 Skill 调用诊断

每次 skill 调用建议记录：

- `domain`
- `action`
- `skill_id`
- `skill_version`
- `input_required`
- `output_keys`
- `duration_ms`

这些信息进入内部诊断，不出现在普通用户页面。

## 5. 主链路适配顺序

1. 论文写作 workflow：已经接入最多，优先规范 metadata 和异常转换。
2. 研究方向 workflow：统一 `resolved_skills` 和 step skill 字段。
3. 项目设计 workflow：统一 skill 字段和 result_ref。
4. PPT / Deck workflow：补齐正式 workflow 包装。
5. 首页检索 workflow：保留检索 Agent 直接调用，但把“总结分析”和“来源诊断”按节点契约记录清楚。

## 6. 验收标准

1. 所有生成类节点都能在 step 记录里看到 skill 调用信息。
2. skill route 缺失时返回清晰错误。
3. skill 输出不符合 required 字段时被拦截，并写入 workflow 错误。
4. 不影响现有论文写作、研究方向、PPT 生成接口。
5. 单测覆盖 skill route、executor、workflow skill metadata。
