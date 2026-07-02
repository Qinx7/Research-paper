# 闃舵1-03锛欰uth API 璺敱

## 3.1 绔偣璁捐

鏂板缓 `backend/app/api/auth.py`锛岃矾鐢卞墠缂€ `/api/auth`锛?
| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/register` | 娉ㄥ唽鏂扮敤鎴凤紝杩斿洖 Token |
| `POST` | `/login` | 閭+瀵嗙爜鐧诲綍锛岃繑鍥?Token |
| `GET` | `/me` | 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅锛堥渶瑕?Token锛?|

## 3.2 瀹炵幇瑕佺偣

### POST /register

```python
async def register(req: UserRegisterRequest, db = Depends(get_db)):
    # 1. 妫€鏌?email 鏄惁宸茶娉ㄥ唽
    # 2. 妫€鏌?username 鏄惁宸茶鍗犵敤
    # 3. 璋冪敤 register_user() 鍒涘缓鐢ㄦ埛
    # 4. 鐢熸垚 JWT Token
    # 5. 杩斿洖 TokenResponse
```

### POST /login

```python
async def login(req: UserLoginRequest, db = Depends(get_db)):
    # 1. 璋冪敤 authenticate_user() 楠岃瘉鍑嵁
    # 2. 澶辫触杩斿洖 401
    # 3. 鎴愬姛鐢熸垚 JWT Token
    # 4. 杩斿洖 TokenResponse
```

### GET /me

```python
async def get_me(current_user = Depends(get_current_user)):
    # 杩斿洖褰撳墠鐧诲綍鐢ㄦ埛鐨勪俊鎭紙鎺掗櫎瀵嗙爜锛?    return UserOut(...)
```

## 3.3 娉ㄥ唽璺敱

淇敼 `backend/app/main.py`锛?```python
from .api.auth import router as auth_router
app.include_router(auth_router, prefix="/api")
```

