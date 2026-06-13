"""认证 API 路由：注册、登录、当前用户"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.user import User
from ..schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserOut,
)
from ..services.auth_service import register_user, authenticate_user, create_access_token
from ..services.auth_dependency import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(req: UserRegisterRequest, db: Session = Depends(get_db)):
    """注册新用户，成功后直接返回 Token"""
    try:
        user = register_user(db, req.email, req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        username=user.username,
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: UserLoginRequest, db: Session = Depends(get_db)):
    """邮箱 + 密码登录，返回 JWT Token"""
    user = authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        username=user.username,
        email=user.email,
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return UserOut(
        id=str(current_user.id),
        email=current_user.email,
        username=current_user.username,
        is_active=current_user.is_active,
        created_at=str(current_user.created_at) if current_user.created_at else "",
    )
