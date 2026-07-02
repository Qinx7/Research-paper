# 闃舵1-02锛欰uth 鏈嶅姟 + JWT 渚濊禆娉ㄥ叆

## 2.1 Auth 鏈嶅姟

鏂板缓 `backend/app/services/auth_service.py`锛?
```python
def hash_password(password: str) -> str:
    """浣跨敤 bcrypt 鍝堝笇瀵嗙爜"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """楠岃瘉瀵嗙爜"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: str, email: str) -> str:
    """鐢熸垚 JWT access token"""
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
    """娉ㄥ唽鏂扮敤鎴凤細鏍￠獙鍞竴鎬?鈫?鍝堝笇瀵嗙爜 鈫?鍐?DB"""
    # 妫€鏌?email/username 鏄惁宸茶浣跨敤
    # 鍝堝笇瀵嗙爜
    # 鍒涘缓 User 璁板綍
    # 杩斿洖 User 瀵硅薄

def authenticate_user(db, email: str, password: str) -> User | None:
    """楠岃瘉鐧诲綍鍑嵁"""
    # 鏌?email
    # 楠屽瘑鐮?    # 杩斿洖 User 鎴?None
```

## 2.2 JWT 渚濊禆娉ㄥ叆

鏂板缓 `backend/app/services/auth_dependency.py`锛?
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
    """浠?Authorization: Bearer <token> 瑙ｆ瀽褰撳墠鐢ㄦ埛銆?    浣滀负 FastAPI 渚濊禆娉ㄥ叆锛屼换浣曞彈淇濇姢鐨勮矾鐢辨坊鍔犳渚濊禆鍗冲彲銆?    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="鏃犳晥鐨勮璇佷护鐗?)
    except JWTError:
        raise HTTPException(status_code=401, detail="璁よ瘉浠ょ墝瑙ｆ瀽澶辫触")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="鐢ㄦ埛涓嶅瓨鍦ㄦ垨宸茬鐢?)

    return user

# 鍙€変緷璧栵細鍏佽鏈櫥褰曡闂紝浣嗚В鏋愮敤鎴蜂俊鎭紙鐢ㄤ簬鍏紑鏁版嵁鏍囪锛?def get_optional_user(...) -> User | None:
    """涓?get_current_user 鐩稿悓锛屼絾鏃?Token 鏃惰繑鍥?None 鑰岄潪 401"""
```

## 2.3 楠岃瘉

```python
# 娴嬭瘯瀵嗙爜鍝堝笇
assert verify_password("test123", hash_password("test123")) is True
# 娴嬭瘯 JWT 寰€杩?token = create_access_token("uuid", "test@test.com")
# decode 鎴愬姛
```

