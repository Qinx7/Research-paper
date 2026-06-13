# 阶段2-01：保护现有 API

## 策略

采用渐进式保护：只在关键入口点（Project CRUD）添加 `get_current_user` 依赖，
子资源（Paper、Draft、Outcome）通过 project_id 间接隔离。

## 2.1 Project API 保护

修改 `backend/app/api/projects.py`：

```python
from ..services.auth_dependency import get_current_user
from ..models.user import User

# 创建项目：强制绑定当前用户
@router.post("/", response_model=ProjectOut)
def create_project(req: ProjectCreate, current_user = Depends(get_current_user), ...):
    project = Project(..., user_id=current_user.id)

# 列表：只返回当前用户的项目
@router.get("/", response_model=list[ProjectOut])
def list_projects(current_user = Depends(get_current_user), ...):
    return db.query(Project).filter(Project.user_id == current_user.id).all()

# 详情/更新/删除：先检查所有权
@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id, current_user = Depends(get_current_user), ...):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise 404
    return p
```

## 2.2 前端兼容

- 未认证用户访问首页：允许（首页不需要认证）
- 调用受保护 API 时 401 → 重定向到登录页

## 2.3 不需要在此阶段保护的

- `/api/agents/*` — Agent 调用属于业务逻辑，内部使用
- `/health` — 健康检查保持公开
- `/api/literature/search` — 可暂时保持公开（后续视需求决定）
