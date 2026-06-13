# 阶段1-02：Auth 服务 + JWT 依赖注入

## 2.1 Auth 服务

新建 `backend/app/services/auth_service.py`：

```python
def hash_password(password: str) -> str:
    """使用 bcrypt 哈希密码"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: str, email: str) -> str:
    """生成 JWT access token"""
    from datetime import datetime, timedelta
    from jose import jwt
    from ..core.config import settings

    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def register_user(db, email: str, username: str, password: str) -> User:
    """注册新用户：校验唯一性 → 哈希密码 → 写 DB"""
    # 检查 email/username 是否已被使用
    # 哈希密码
    # 创建 User 记录
    # 返回 User 对象

def authenticate_user(db, email: str, password: str) -> User | None:
    """验证登录凭据"""
    # 查 email
    # 验密码
    # 返回 User 或 None
```

## 2.2 JWT 依赖注入

新建 `backend/app/services/auth_dependency.py`：

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

security_scheme = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """从 Authorization: Bearer <token> 解析当前用户。
    作为 FastAPI 依赖注入，任何受保护的路由添加此依赖即可。
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
    except JWTError:
        raise HTTPException(status_code=401, detail="认证令牌解析失败")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")

    return user

# 可选依赖：允许未登录访问，但解析用户信息（用于公开数据标记）
def get_optional_user(...) -> User | None:
    """与 get_current_user 相同，但无 Token 时返回 None 而非 401"""
```

## 2.3 验证

```python
# 测试密码哈希
assert verify_password("test123", hash_password("test123")) is True
# 测试 JWT 往返
token = create_access_token("uuid", "test@test.com")
# decode 成功
```
