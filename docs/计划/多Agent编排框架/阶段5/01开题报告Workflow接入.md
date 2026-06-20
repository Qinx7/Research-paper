# 阶段 5：开题报告 Workflow 接入

## 1. 目标

将已有开题报告生成能力接入轻量多 Agent 编排框架，使同步 API 与异步 Celery 任务都通过统一 workflow 执行，并留下 workflow run / step 记录。

本步骤只覆盖“开题报告生成与保存”，不扩展开题主流程向导，不新增 UI，不改变报告 DOCX/PDF 下载逻辑。

## 2. 已实现范围

- 新增 `proposal_generation` workflow。
- 拆分为 `proposal_context`、`proposal_generate`、`proposal_save` 三个节点。
- `proposal_context` 负责从项目设计中提取允许引用的真实文献白名单。
- `proposal_generate` 复用现有 `proposal_agent.generate`。
- `proposal_save` 负责保存 `Proposal` 记录。
- 同步接口 `/api/proposal/generate` 已改为调用 workflow。
- 异步任务 `generate_proposal_task` 已改为调用 workflow。
- 异步任务已传入 `user_id`，保证 workflow 记录可按用户归属查询。
- workflow 输出摘要已包含 `proposal_title`，便于运行历史快速展示。

## 3. 验证方式

- `backend/.venv/Scripts/python.exe -m unittest tests.test_proposal_workflow`
- `backend/.venv/Scripts/python.exe -m unittest tests.test_proposal_task_workflow_integration`
- `backend/.venv/Scripts/python.exe -m unittest tests.test_agent_workflow_runner tests.test_literature_search_workflow tests.test_agent_workflow_records tests.test_paper_writing_workflow tests.test_paper_task_workflow_integration tests.test_proposal_workflow tests.test_proposal_task_workflow_integration`
- `backend/.venv/Scripts/python.exe -m compileall app`

## 4. 非本步骤范围

- 不实现完整开题向导。
- 不接入项目设计生成 workflow。
- 不接入开题 PPT workflow。
- 不新增前端 workflow 历史页面。
- 不引入 LangGraph 或其他新依赖。

## 5. 下一步建议

优先补一个“工作流运行历史”的轻量前端入口，展示当前用户的 workflow run 和 step 状态。这样可以把文献检索、论文写作、开题报告三个已接入 workflow 的能力统一可视化，方便定位失败节点。
