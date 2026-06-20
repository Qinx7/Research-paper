# 阶段 2：首页文献检索 Workflow 接入

## 1. 目标

把当前首页文献检索中的多步骤逻辑封装为 workflow，但保持首页“只做文献检索”的产品边界不变。用户仍然从首页输入检索词，后端返回文献结果、来源状态、本次检索总结分析和检索任务记录，不生成连续对话式回答。

## 2. 当前要拆出的节点

### SearchQueryPlannerNode

职责：

- 解析用户检索词。
- 生成中文关键词和英文关键词。
- 识别检索模式：快速、综述、深度。
- 输出 library_scope、sources、year range、limit 等检索参数。

### SourceRouterNode

职责：

- 根据 `library_scope` 和用户选择决定检索源。
- all 模式下保留中文源和英文源的组合策略。
- 对关闭、限流、不可用的来源提前标记状态。

### ExternalLiteratureSearchNode

职责：

- 调用现有 `literature_search_agent.search_by_requirement`。
- 写入或更新检索任务记录。
- 输出 external_papers、source_statuses、task_id。

### ResultNormalizerNode

职责：

- 统一不同来源字段：title、authors、year、venue、doi、abstract、source、url、citation_count。
- 处理空字段和异常字段。
- 保留来源原始状态用于诊断。

### QualityRankerNode

职责：

- 调用现有排序逻辑，或者逐步迁移 `literature_search_agent._rank_results`。
- 输出 relevance、freshness、impact、quality、final_score。
- all 模式下保证中文/英文来源基本平衡。

### SearchSynthesisNode

职责：

- 只基于本次检索返回的文献生成结构化总结。
- 输出研究主题概览、代表性文献、主要研究方法、近期趋势、潜在研究空白。
- 明确标注总结依据来自“本次检索结果”，不引入项目内部资料或外部未检索材料。
- 如果文献不足，输出“本次检索结果不足以形成可靠综述”，并给出补充检索建议。

### SearchDiagnosticsNode

职责：

- 汇总每个来源状态。
- 对 429、504、空结果、未启用中文源等情况给出可读说明。
- 如果没有结果，返回“暂无相关文献”，并说明哪些来源为空或失败。

## 3. 首页兼容策略

现有首页仍然只需要消费：

- 检索结果列表。
- 本次检索总结分析。
- 来源状态。
- 检索任务 ID。
- 空结果提示。

workflow runner 内部可以产出 `WorkflowEvent`，但第一轮不要求前端展示完整节点过程。对前端保持现有文献检索接口响应结构兼容。

## 4. 实施边界

- 不恢复 `/chat` 页面。
- 不把首页改成问答页面。
- 不新增连续对话回答。
- 只允许生成“本次检索结果总结分析”，且必须绑定本次检索结果。
- 不改变首页主交互。
- 不改变现有 `searchLiterature` 前端调用签名。

## 5. 验收标准

- 首页检索仍能返回文献列表。
- 首页检索结果区能展示本次检索总结分析。
- all / cn / en 三种范围行为不变，但来源诊断更清晰。
- CNKI、Semantic Scholar、OpenAlex 等来源失败时，结果中能看到明确状态。
- 无结果时显示“暂无相关文献”，而不是空白。
- 文献不足时总结分析明确提示“依据不足”，不编造研究结论。
- 检索任务记录能关联 workflow run。
- 原有文献检索相关测试通过。
