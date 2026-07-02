# 闃舵 4锛氳鏂囧啓浣?Workflow 鎺ュ叆

## 1. 鐩爣

鎶婅鏂囧啓浣滀腑鐨勨€滆瘉鎹敹闆?鈫?绔犺妭鐢熸垚 鈫?grounding 妫€鏌?鈫?淇濆瓨鑽夌鈥濇暣鐞嗘垚 workflow锛岄檷浣庣敓鎴愬唴瀹规棤渚濇嵁鎴栧嚟绌烘墿鍐欑殑姒傜巼銆?
## 2. 浼樺厛鎺ュ叆绔犺妭鐢熸垚

绔犺妭鐢熸垚姣斿ぇ绾插拰鎽樿鏇村鏄撳嚭鐜板够瑙夛紝鍥犳浼樺厛杩佺Щ锛?
```mermaid
flowchart LR
    A["Draft Context Node"] --> B["Evidence Collect Node"]
    B --> C["Chapter Writer Node"]
    C --> D["Grounding Guard Node"]
    D --> E["Draft Save Node"]
```

## 3. 鑺傜偣鑱岃矗

- `DraftContextNode`锛氳鍙栬崏绋裤€佸ぇ绾层€侀」鐩璁°€佸凡鏈夌珷鑺傘€?- `EvidenceCollectNode`锛氳鍙栭」鐩枃鐚€侀槄璇荤瑪璁般€佷笂浼犺祫鏂?chunk銆佹垚鏋滄憳瑕併€?- `ChapterWriterNode`锛氳皟鐢ㄧ幇鏈?`paper_writing_agent.generate_chapter`銆?- `GroundingGuardNode`锛氳皟鐢ㄧ幇鏈?`validate_generated_chapter_grounding`銆?- `DraftSaveNode`锛氫繚瀛樼珷鑺傘€佹洿鏂扮増鏈€?
## 4. 楠屾敹鏍囧噯

- 绔犺妭鐢熸垚浠嶄繚鎸佸師 API銆?- grounding 澶辫触鏃惰兘鏄庣‘鍛婅瘔鐢ㄦ埛缂哄皯渚濇嵁銆?- workflow 璁板綍閲岃兘鐪嬪埌绔犺妭浣跨敤浜嗗摢浜涜瘉鎹被鍨嬨€?- 涓嶅奖鍝嶆墜鍔ㄧ紪杈戜繚瀛樸€?
