# 阶段1-03：Auth API 路由

## 3.1 端点设计

新建 `backend/app/api/auth.py`，路由前缀 `/api/auth`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/register` | 注册新用户，返回 Token |
| `POST` | `/login` | 邮箱+密码登录，返回 Token |
| `GET` | `/me` | 获取当前用户信息（需要 Token） |

## 3.2 实现要点

### POST /register

```python
async def register(req: UserRegisterRequest, db = Depends(get_db)):
    # 1. 检查 email 是否已被注册
    # 2. 检查 username 是否已被占用
    # 3. 调用 register_user() 创建用户
    # 4. 生成 JWT Token
    # 5. 返回 TokenResponse
```

### POST /login

```python
async def login(req: UserLoginRequest, db = Depends(get_db)):
    # 1. 调用 authenticate_user() 验证凭据
    # 2. 失败返回 401
    # 3. 成功生成 JWT Token
    # 4. 返回 TokenResponse
```

### GET /me

```python
async def get_me(current_user = Depends(get_current_user)):
    # 返回当前登录用户的信息（排除密码）
    return UserOut(...)
```

## 3.3 注册路由

修改 `backend/app/main.py`：
```python
from .api.auth import router as auth_router
app.include_router(auth_router, prefix="/api")
```
