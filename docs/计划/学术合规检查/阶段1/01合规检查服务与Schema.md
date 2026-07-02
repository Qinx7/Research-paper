# 闃舵 1 姝ラ 01锛氬悎瑙勬鏌ユ湇鍔?+ Schema

## 鐩爣

鏂板缓 `compliance_checker.py` 鏈嶅姟鍜?`compliance.py` Schema锛屽疄鐜板叏閮?5 椤规鏌ラ€昏緫銆?
## 1. Schema 瀹氫箟 (`backend/app/schemas/compliance.py`)

```python
# 妫€鏌ョ粨鏋滅被鍨?class ComplianceIssue(BaseModel):
    issue_type: str       # data_fabrication | fake_reference | missing_marker | suspicious_statistic | ai_flag
    severity: str         # error | warning | info
    chapter_key: str      # 鎵€灞炵珷鑺?    location: str         # 鏂囨湰浣嶇疆鎻忚堪锛屽"绗?娈?
    description: str      # 闂鎻忚堪
    snippet: str | None   # 鐩稿叧鏂囨湰鐗囨
    suggestion: str       # 淇寤鸿

class ChapterCompliance(BaseModel):
    chapter_key: str
    passed: bool          # 鏃?error 鍗充负閫氳繃
    issues: list[ComplianceIssue]
    confirmed: bool       # 鐢ㄦ埛鏄惁宸茬‘璁?    confirmed_at: datetime | None

class ComplianceResult(BaseModel):
    draft_id: str
    overall_score: int    # 0-100锛屾瘡椤?error -20锛寃arning -10
    passed: bool          # 鏃?error
    chapters: dict[str, ChapterCompliance]  # keyed by chapter_key
    checked_at: datetime

class ComplianceConfirmRequest(BaseModel):
    chapter_key: str
    issue_index: int      # 纭绗嚑涓?issue
    action: str           # "accept" | "ignore" | "fixed"
```

## 2. ComplianceChecker 鏈嶅姟 (`backend/app/services/compliance_checker.py`)

### 2.1 涓诲叆鍙?
```python
def check_draft(
    draft: Draft,
    outcomes: list[Outcome],
    papers: list[Paper] | None = None,
    enable_ai: bool = False,
) -> ComplianceResult:
```

### 2.2 瑙勫垯妫€鏌ュ嚱鏁?
#### check_1_data_authenticity(chapter_text, is_data_based) 鈫?list[ComplianceIssue]
- 杩濈璇嶅垪琛紙浠呭湪 `data_based=False` 鏃惰Е鍙戯級锛?  - "瀹為獙缁撴灉琛ㄦ槑"銆?瀹為獙缁撴灉鏄剧ず"銆?娴嬭瘯缁撴灉琛ㄦ槑"
  - "鏁版嵁鏄剧ず"銆?鏁版嵁琛ㄦ槑"銆?濡傚浘X鎵€绀?*鏁版嵁"
  - "鍑嗙‘鐜囪揪鍒?銆?绮惧害杈惧埌"銆?鎬ц兘鎻愬崌浜?
  - "閫氳繃瀹為獙楠岃瘉"銆?瀹為獙璇佹槑"銆?瀹炶返琛ㄦ槑"
- 渚嬪锛氬鏋滄枃鏈腑鍚屾椂鍖呭惈 `[瀹為獙璁捐鏂规]` 鏍囪锛屽垯闄嶇骇涓?warning

#### check_2_reference_authenticity(chapter_text, draft_references) 鈫?list[ComplianceIssue]
- 鎻愬彇姝ｆ枃涓墍鏈?`[鏁板瓧]` 鎴?`[鏁板瓧,鏁板瓧]` 寮曠敤鏍囪
- 姣斿锛氭暟瀛?> len(draft_references) 鍒欐爣璁颁负 fake_reference
- DOI 鏍煎紡鏍￠獙锛氬姣忔潯 reference 鐨?doi 瀛楁鍋氭鍒?`10.\d{4,}/.+\..+`
- 缂栭€犵壒寰佹娴嬶細浣滆€呭瓧娈靛惈 "et al." 浣嗗彧鏈?1 浣嶄綔鑰呫€佹爣棰樿繃鐭紙<10 瀛楃锛夈€佸勾浠借秴鍑哄悎鐞嗚寖鍥?
#### check_3_chapter_marker(chapter_key, chapter_text, is_data_based) 鈫?list[ComplianceIssue]
- 浠呮鏌?chapter_4_implementation 鍜?chapter_5_experiment
- 鎼滅储 `[鍩轰簬鐪熷疄鏁版嵁]` 鎴?`[瀹為獙璁捐鏂规]` 鏍囪
- 缂哄皯鏍囪 鈫?warning
- 鏍囪涓?data_based 瀛楁涓嶄竴鑷?鈫?warning

#### check_4_statistic_fabrication(chapter_text, is_data_based, outcomes) 鈫?list[ComplianceIssue]
- 姝ｅ垯鍖归厤鏁板€兼柇瑷€妯″紡锛?  - `(杈惧埌|鎻愬崌|闄嶄綆|鎻愰珮|鏀瑰杽|浼樹簬|瓒呰繃)\s*\d+(\.\d+)?%`
  - `(鍑嗙‘鐜噟绮剧‘鐜噟鍙洖鐜噟F1|BLEU|ROUGE|MSE|RMSE|AUC)\s*(杈惧埌|涓簗鏄??\s*\d+(\.\d+)?`
- 浠呭湪 `is_data_based=False` 涓旀棤 experiment_data 绫诲瀷 outcome 鏃舵姤鍛?- 妫€鏌ユ暟鍊兼槸鍚﹁兘鍦?outcomes 鐨?extra_data 涓壘鍒颁緷鎹?
### 2.3 AI 鎺ュ湴瀵规瘮妫€鏌?
```python
def check_5_ai_deep_audit(
    chapter_text: str,
    chapter_key: str,
    outcomes_summary: str,   # 浠呮彁渚涙垚鏋滃悕绉?绫诲瀷+绠€瑕佹弿杩?    references_list: str,     # 浠呮彁渚涙枃鐚爣棰?浣滆€?骞翠唤
) 鈫?list[ComplianceIssue]:
```

System prompt 绾︽潫锛?- "浣犳槸涓€浣嶅鏈悎瑙勫璁″憳锛屽彧璐熻矗瀵圭収妫€鏌ワ紝涓嶅垱浣溿€佷笉鎺ㄦ柇銆佷笉琛ュ厖銆?
- "浠呭皢姝ｆ枃涓殑鏂█涓庢彁渚涚殑鎴愭灉/鏂囩尞娓呭崟閫愪竴姣斿銆?
- "濡傛灉姝ｆ枃涓煇涓疄楠岀粨鏋滄垨鏁版嵁鍦ㄦ垚鏋滄竻鍗曚腑鎵句笉鍒板搴旈」锛屾爣璁颁负 issue銆?
- "濡傛灉娌℃湁鍙戠幇浠讳綍涓嶄竴鑷达紝杩斿洖绌哄垪琛?[]銆?
- "绂佹锛氭帹鏂己澶辨暟鎹€佸缓璁浛浠ｅ啓娉曘€佽ˉ鍏呭垎鏋愭剰瑙併€?

鍙細杈撳嚭锛?```json
[
  {
    "issue_type": "ai_flag",
    "severity": "info",
    "chapter_key": "chapter_5_experiment",
    "location": "绗?娈?,
    "description": "姝ｆ枃澹扮О'绯荤粺鍝嶅簲鏃堕棿闄嶄綆鍒?20ms'锛屼絾鎴愭灉娓呭崟涓棤姝ゆ暟鎹褰?,
    "snippet": "缁忔祴璇曪紝绯荤粺骞冲潎鍝嶅簲鏃堕棿闄嶄綆鍒颁簡120ms",
    "suggestion": "璇蜂笂浼犲搴旂殑鎬ц兘娴嬭瘯鏁版嵁锛屾垨灏嗚鏂█鏀逛负'棰勬湡鍝嶅簲鏃堕棿鐩爣涓?20ms'"
  }
]
```

### 2.4 璇勫垎閫昏緫

```
overall_score = 100
姣忎釜 error:   -20
姣忎釜 warning: -10
姣忎釜 info:    -5
鏈€浣?0 鍒?passed = (error 鏁伴噺 == 0)
```

## 3. 楠岃瘉

```python
# 娴嬭瘯 1锛氭棤鏁版嵁 + 鏈夎繚绂佽瘝
text = "瀹為獙缁撴灉琛ㄦ槑锛岃妯″瀷鍑嗙‘鐜囪揪鍒?95.3%銆?
issues = check_1_data_authenticity(text, is_data_based=False)
assert len(issues) >= 2  # "瀹為獙缁撴灉琛ㄦ槑" + "鍑嗙‘鐜囪揪鍒?

# 娴嬭瘯 2锛氭湁鏁版嵁 + 姝ｅ父鎺緸
text = "濡傚疄楠屾暟鎹墍绀猴紙瑙佷笂浼犵殑 experiment_results.csv锛夛紝妯″瀷琛ㄧ幇鑹ソ銆?
issues = check_1_data_authenticity(text, is_data_based=True)
assert len(issues) == 0

# 娴嬭瘯 3锛氬亣寮曠敤
issues = check_2_reference_authenticity("濡傚墠鎵€杩癧15]", [{"title": "鍙湁5绡?}]*5)
assert any(i.issue_type == "fake_reference" for i in issues)
```

