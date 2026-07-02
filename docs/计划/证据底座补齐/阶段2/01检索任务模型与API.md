# 闃舵 2 姝ラ 01锛氭绱换鍔℃ā鍨嬩笌 API

## 鐩爣

鏂板 `literature_search_tasks` 鎸佷箙鍖栬兘鍔涳紝璁板綍姣忔瀛︽湳妫€绱㈢殑鏌ヨ鍙傛暟銆佹墽琛岀姸鎬併€佹潵婧愯瘖鏂拰缁撴灉鎽樿銆?
## 鍏抽敭鍋囪

- 妫€绱换鍔″厛浠ュ悓姝ユ绱㈢粨鏋滆惤搴撲负涓伙紝涓嶇珛鍒诲紩鍏?Celery 寮傛妫€绱€?- 浠诲姟鐘舵€佸厛鍖呮嫭锛歚pending`銆乣running`銆乣success`銆乣partial`銆乣failed`銆?- 鏉ユ簮鐘舵€佸鐢ㄥ綋鍓嶆悳绱㈣繑鍥炰腑鐨?`source_statuses`銆?- 浠诲姟缁撴灉鍙互淇濆瓨绮剧畝鐗堟枃鐚垪琛紝涓嶄繚瀛樺叏鏂囧唴瀹广€?
## 寤鸿鏀瑰姩

### 1. 鍚庣妯″瀷

鏂板 `backend/app/models/literature_search_task.py`锛?
```python
"""瀛︽湳妫€绱换鍔¤褰曟ā鍨嬨€?""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..core.database import Base


class LiteratureSearchTask(Base):
    __tablename__ = "literature_search_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    query = Column(Text, nullable=False)
    mode = Column(String(40), nullable=False, default="literature_review")
    library_scope = Column(String(40), nullable=False, default="all")
    selected_sources = Column(JSONB, nullable=True, default=list)
    status = Column(String(40), nullable=False, default="pending", index=True)
    total_results = Column(Integer, nullable=False, default=0)
    source_statuses = Column(JSONB, nullable=True, default=dict)
    result_snapshot = Column(JSONB, nullable=True, default=list)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

鍚屾淇敼锛?
- `backend/app/models/__init__.py`
- 鏁版嵁搴撳垵濮嬪寲鍔犺浇銆?
### 2. Schema

鏂板 `backend/app/schemas/literature_search_task.py`锛?
- `LiteratureSearchTaskCreate`
- `LiteratureSearchTaskOut`
- `LiteratureSearchTaskUpdate`

### 3. 鏈嶅姟灞?
鏂板 `backend/app/services/literature_search_task_service.py`锛?
- `create_search_task(db, payload)`
- `mark_task_running(db, task_id)`
- `mark_task_success(db, task_id, result)`
- `mark_task_failed(db, task_id, message)`
- `infer_task_status(source_statuses, total_results)`

鐘舵€佽鍒欙細

- 鍏ㄩ儴鏉ユ簮澶辫触涓旂粨鏋滀负 0锛歚failed`
- 閮ㄥ垎鏉ユ簮澶辫触浣嗘湁缁撴灉锛歚partial`
- 鏃犲け璐ヤ笖鏈夌粨鏋滐細`success`
- 鏃犲け璐ヤ絾缁撴灉涓?0锛歚success`锛屽墠绔樉绀衡€滄殏鏃犵浉鍏虫枃鐚€?
### 4. API

鏂板 `backend/app/api/literature_search_tasks.py`锛?
- `GET /api/literature-search-tasks?project_id=&limit=`
- `GET /api/literature-search-tasks/{task_id}`
- `DELETE /api/literature-search-tasks/{task_id}`

鎺ュ叆 `backend/app/main.py`锛?
```python
from .api.literature_search_tasks import router as literature_search_tasks_router

app.include_router(literature_search_tasks_router, prefix="/api")
```

### 5. 鎺ュ叆鐜版湁妫€绱㈡帴鍙?
淇敼 `backend/app/api/literature.py` 鐨?`/api/literature/search`锛?
- 璇锋眰寮€濮嬫椂鍒涘缓浠诲姟銆?- 妫€绱㈡垚鍔熷悗鍐欏叆 `source_statuses`銆乣selected_sources`銆乣total_results`銆乣result_snapshot`銆?- 妫€绱㈠紓甯告椂鍐欏叆 `failed` 鍜岄敊璇憳瑕併€?- 鍝嶅簲涓鍔?`task_id` 瀛楁锛屼繚鎸佹棫瀛楁鍏煎銆?
## 娴嬭瘯璁″垝

鏂板 `backend/tests/test_literature_search_tasks.py`锛?
- 鍒涘缓浠诲姟鍚庣姸鎬佷负 `pending`銆?- 鎴愬姛妫€绱㈠悗鐘舵€佷负 `success` 鎴?`partial`銆?- 鏉ユ簮鍏ㄩ儴澶辫触涓旂粨鏋滀负绌烘椂鐘舵€佷负 `failed`銆?- 鏌ヨ浠诲姟璇︽儏杩斿洖鏉ユ簮鐘舵€併€?
杩愯锛?
```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest tests.test_literature_search_tasks tests.test_search_resilience
```

## 椋庨櫓

- 濡傛灉鐩存帴鎶婂畬鏁存悳绱㈢粨鏋?JSON 瀛樺叆浠诲姟锛岃褰曞彲鑳藉亸澶э紱寤鸿淇濆瓨绮剧畝瀛楁锛氭爣棰樸€佷綔鑰呫€佸勾浠姐€佹潵婧愩€佹憳瑕佺墖娈点€乁RL銆佸紩鐢ㄦ暟銆?- 鎼滅储鎺ュ彛鐩墠鍙兘琚椤靛拰鑱婂ぉ鍏辩敤锛岄渶瑕佷繚鎸佸搷搴斿吋瀹癸紝涓嶈兘璁╂棫鍓嶇鍥犱负鏂板瀛楁鎶ラ敊銆?

