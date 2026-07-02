# 闃舵1-01锛歎ser 妯″瀷 + Auth Schema

## 1.1 User 妯″瀷

鏂板缓 `backend/app/models/user.py`锛?
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

- `email` + `username` 鍙屽敮涓€鏍囪瘑
- `is_active` 鐢ㄤ簬鍚庣画绂佺敤璐︽埛
- 瀵嗙爜瀛樺偍 bcrypt hash锛屼笉瀛樻槑鏂?
## 1.2 Project 妯″瀷鎵╁睍

淇敼 `backend/app/models/project.py`锛屾坊鍔?`user_id` 瀛楁锛?
```python
user_id = Column(UUID, ForeignKey("users.id"), nullable=True, comment="鎵€灞炵敤鎴?)
```

- `nullable=True`锛氬巻鍙叉暟鎹?user_id 鐣欑┖锛屼笉鐮村潖鐜版湁鏁版嵁
- 鏂板缓椤圭洰鏃跺己鍒惰姹?user_id

## 1.3 Auth Schema

鏂板缓 `backend/app/schemas/auth.py`锛?
```python
class UserRegisterRequest(BaseModel):
    email: str = Field(..., max_length=255)
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)

class UserLoginRequest(BaseModel):
    email: str = Field(..., description="閭鍦板潃")
    password: str = Field(..., description="瀵嗙爜")

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

## 1.4 楠岃瘉

```python
from backend.app.models.user import User
from backend.app.models.project import Project
# 纭妯″瀷鍙鍏ワ紝瀛楁姝ｇ‘
```

