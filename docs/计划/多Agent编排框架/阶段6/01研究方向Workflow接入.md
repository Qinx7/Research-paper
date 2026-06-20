# 阶段 6：研究方向 Workflow 接入

## 1. 目标

将“文献分析 → 研究方向生成 → 多维评分 → 保存研究方向”这条已有后端能力接入轻量多 Agent 编排框架。

本步骤只覆盖 `/api/research/directions`，不改首页、不恢复 `/chat`，不扩展项目设计、开题报告或开题 PPT 连续向导。

## 2. 已实现范围

- 新增 `research_direction_generation` workflow。
- 拆分为 `direction_generate`、`direction_score`、`direction_save` 三个节点。
- `direction_generate` 复用现有 `research_direction_agent.generate_directions`。
- `direction_score` 复用现有 `research_direction_agent.score_directions`。
- `direction_save` 保存 `ResearchDirection` 记录，并保持原保存字段兼容。
- `/api/research/directions` 已改为调用 workflow。
- workflow run 记录中保留 `user_id`、`project_id`、输入摘要和输出摘要。
- 输出摘要新增 `directions_count`、`direction_titles`、`saved_ids`，便于在运行历史中定位结果。

## 3. 验证方式

- `backend/.venv/Scripts/python.exe -m unittest tests.test_research_direction_workflow`
- `backend/.venv/Scripts/python.exe -m unittest tests.test_research_api_workflow_integration`
- `backend/.venv/Scripts/python.exe -m unittest tests.test_agent_workflow_records`
- `backend/.venv/Scripts/python.exe -m unittest tests.test_agent_workflow_runner tests.test_literature_search_workflow tests.test_agent_workflow_records tests.test_paper_writing_workflow tests.test_paper_task_workflow_integration tests.test_proposal_workflow tests.test_proposal_task_workflow_integration tests.test_research_direction_workflow tests.test_research_api_workflow_integration`
- `backend/.venv/Scripts/python.exe -m compileall app`

## 4. 非本步骤范围

- 不接入项目设计生成 workflow。
- 不新增前端 workflow 历史入口。
- 不实现完整开题主流程向导。
- 不引入 LangGraph 或其他新依赖。
- 不重构 `research.py` 里仍存在的旧辅助保存函数。

## 5. 下一步建议

优先接入“项目设计生成 workflow”或补“workflow 历史前端入口”。如果目标是增强可观测性，应先做历史入口；如果目标是扩大编排覆盖面，应先接项目设计生成。
