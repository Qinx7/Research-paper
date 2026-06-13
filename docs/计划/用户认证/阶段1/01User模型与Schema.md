# 阶段1-01：User 模型 + Auth Schema

## 1.1 User 模型

新建 `backend/app/models/user.py`：

```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID, primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
```

- `email` + `username` 双唯一标识
- `is_active` 用于后续禁用账户
- 密码存储 bcrypt hash，不存明文

## 1.2 Project 模型扩展

修改 `backend/app/models/project.py`，添加 `user_id` 字段：

```python
user_id = Column(UUID, ForeignKey("users.id"), nullable=True, comment="所属用户")
```

- `nullable=True`：历史数据 user_id 留空，不破坏现有数据
- 新建项目时强制要求 user_id

## 1.3 Auth Schema

新建 `backend/app/schemas/auth.py`：

```python
class UserRegisterRequest(BaseModel):
    email: str = Field(..., max_length=255)
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)

class UserLoginRequest(BaseModel):
    email: str = Field(..., description="邮箱地址")
    password: str = Field(..., description="密码")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    email: str

class UserOut(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    created_at: str
```

## 1.4 验证

```python
from backend.app.models.user import User
from backend.app.models.project import Project
# 确认模型可导入，字段正确
```
