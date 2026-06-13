# 阶段 1 步骤 01：合规检查服务 + Schema

## 目标

新建 `compliance_checker.py` 服务和 `compliance.py` Schema，实现全部 5 项检查逻辑。

## 1. Schema 定义 (`backend/app/schemas/compliance.py`)

```python
# 检查结果类型
class ComplianceIssue(BaseModel):
    issue_type: str       # data_fabrication | fake_reference | missing_marker | suspicious_statistic | ai_flag
    severity: str         # error | warning | info
    chapter_key: str      # 所属章节
    location: str         # 文本位置描述，如"第3段"
    description: str      # 问题描述
    snippet: str | None   # 相关文本片段
    suggestion: str       # 修正建议

class ChapterCompliance(BaseModel):
    chapter_key: str
    passed: bool          # 无 error 即为通过
    issues: list[ComplianceIssue]
    confirmed: bool       # 用户是否已确认
    confirmed_at: datetime | None

class ComplianceResult(BaseModel):
    draft_id: str
    overall_score: int    # 0-100，每项 error -20，warning -10
    passed: bool          # 无 error
    chapters: dict[str, ChapterCompliance]  # keyed by chapter_key
    checked_at: datetime

class ComplianceConfirmRequest(BaseModel):
    chapter_key: str
    issue_index: int      # 确认第几个 issue
    action: str           # "accept" | "ignore" | "fixed"
```

## 2. ComplianceChecker 服务 (`backend/app/services/compliance_checker.py`)

### 2.1 主入口

```python
def check_draft(
    draft: Draft,
    outcomes: list[Outcome],
    papers: list[Paper] | None = None,
    enable_ai: bool = False,
) -> ComplianceResult:
```

### 2.2 规则检查函数

#### check_1_data_authenticity(chapter_text, is_data_based) → list[ComplianceIssue]
- 违禁词列表（仅在 `data_based=False` 时触发）：
  - "实验结果表明"、"实验结果显示"、"测试结果表明"
  - "数据显示"、"数据表明"、"如图X所示.*数据"
  - "准确率达到"、"精度达到"、"性能提升了"
  - "通过实验验证"、"实验证明"、"实践表明"
- 例外：如果文本中同时包含 `[实验设计方案]` 标记，则降级为 warning

#### check_2_reference_authenticity(chapter_text, draft_references) → list[ComplianceIssue]
- 提取正文中所有 `[数字]` 或 `[数字,数字]` 引用标记
- 比对：数字 > len(draft_references) 则标记为 fake_reference
- DOI 格式校验：对每条 reference 的 doi 字段做正则 `10.\d{4,}/.+\..+`
- 编造特征检测：作者字段含 "et al." 但只有 1 位作者、标题过短（<10 字符）、年份超出合理范围

#### check_3_chapter_marker(chapter_key, chapter_text, is_data_based) → list[ComplianceIssue]
- 仅检查 chapter_4_implementation 和 chapter_5_experiment
- 搜索 `[基于真实数据]` 或 `[实验设计方案]` 标记
- 缺少标记 → warning
- 标记与 data_based 字段不一致 → warning

#### check_4_statistic_fabrication(chapter_text, is_data_based, outcomes) → list[ComplianceIssue]
- 正则匹配数值断言模式：
  - `(达到|提升|降低|提高|改善|优于|超过)\s*\d+(\.\d+)?%`
  - `(准确率|精确率|召回率|F1|BLEU|ROUGE|MSE|RMSE|AUC)\s*(达到|为|是)?\s*\d+(\.\d+)?`
- 仅在 `is_data_based=False` 且无 experiment_data 类型 outcome 时报告
- 检查数值是否能在 outcomes 的 extra_data 中找到依据

### 2.3 AI 接地对比检查

```python
def check_5_ai_deep_audit(
    chapter_text: str,
    chapter_key: str,
    outcomes_summary: str,   # 仅提供成果名称+类型+简要描述
    references_list: str,     # 仅提供文献标题+作者+年份
) → list[ComplianceIssue]:
```

System prompt 约束：
- "你是一位学术合规审计员，只负责对照检查，不创作、不推断、不补充。"
- "仅将正文中的断言与提供的成果/文献清单逐一比对。"
- "如果正文中某个实验结果或数据在成果清单中找不到对应项，标记为 issue。"
- "如果没有发现任何不一致，返回空列表 []。"
- "禁止：推断缺失数据、建议替代写法、补充分析意见。"

只会输出：
```json
[
  {
    "issue_type": "ai_flag",
    "severity": "info",
    "chapter_key": "chapter_5_experiment",
    "location": "第2段",
    "description": "正文声称'系统响应时间降低到120ms'，但成果清单中无此数据记录",
    "snippet": "经测试，系统平均响应时间降低到了120ms",
    "suggestion": "请上传对应的性能测试数据，或将该断言改为'预期响应时间目标为120ms'"
  }
]
```

### 2.4 评分逻辑

```
overall_score = 100
每个 error:   -20
每个 warning: -10
每个 info:    -5
最低 0 分
passed = (error 数量 == 0)
```

## 3. 验证

```python
# 测试 1：无数据 + 有违禁词
text = "实验结果表明，该模型准确率达到 95.3%。"
issues = check_1_data_authenticity(text, is_data_based=False)
assert len(issues) >= 2  # "实验结果表明" + "准确率达到"

# 测试 2：有数据 + 正常措辞
text = "如实验数据所示（见上传的 experiment_results.csv），模型表现良好。"
issues = check_1_data_authenticity(text, is_data_based=True)
assert len(issues) == 0

# 测试 3：假引用
issues = check_2_reference_authenticity("如前所述[15]", [{"title": "只有5篇"}]*5)
assert any(i.issue_type == "fake_reference" for i in issues)
```
