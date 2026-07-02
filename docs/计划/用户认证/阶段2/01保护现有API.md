# 闃舵2-01锛氫繚鎶ょ幇鏈?API

## 绛栫暐

閲囩敤娓愯繘寮忎繚鎶わ細鍙湪鍏抽敭鍏ュ彛鐐癸紙Project CRUD锛夋坊鍔?`get_current_user` 渚濊禆锛?瀛愯祫婧愶紙Paper銆丏raft銆丱utcome锛夐€氳繃 project_id 闂存帴闅旂銆?
## 2.1 Project API 淇濇姢

淇敼 `backend/app/api/projects.py`锛?
```python
from ..services.auth_dependency import get_current_user
from ..models.user import User

# 鍒涘缓椤圭洰锛氬己鍒剁粦瀹氬綋鍓嶇敤鎴?@router.post("/", response_model=ProjectOut)
def create_project(req: ProjectCreate, current_user = Depends(get_current_user), ...):
    project = Project(..., user_id=current_user.id)

# 鍒楄〃锛氬彧杩斿洖褰撳墠鐢ㄦ埛鐨勯」鐩?@router.get("/", response_model=list[ProjectOut])
def list_projects(current_user = Depends(get_current_user), ...):
    return db.query(Project).filter(Project.user_id == current_user.id).all()

# 璇︽儏/鏇存柊/鍒犻櫎锛氬厛妫€鏌ユ墍鏈夋潈
@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id, current_user = Depends(get_current_user), ...):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise 404
    return p
```

## 2.2 鍓嶇鍏煎

- 鏈璇佺敤鎴疯闂椤碉細鍏佽锛堥椤典笉闇€瑕佽璇侊級
- 璋冪敤鍙椾繚鎶?API 鏃?401 鈫?閲嶅畾鍚戝埌鐧诲綍椤?
## 2.3 涓嶉渶瑕佸湪姝ら樁娈典繚鎶ょ殑

- `/api/agents/*` 鈥?Agent 璋冪敤灞炰簬涓氬姟閫昏緫锛屽唴閮ㄤ娇鐢?- `/health` 鈥?鍋ュ悍妫€鏌ヤ繚鎸佸叕寮€
- `/api/literature/search` 鈥?鍙殏鏃朵繚鎸佸叕寮€锛堝悗缁闇€姹傚喅瀹氾級

