"""认证相关 Schema"""
from pydantic import BaseModel, Field


class UserRegisterRequest(BaseModel):
    email: str = Field(..., max_length=255, description="邮箱地址")
    username: str = Field(..., min_length=2, max_length=100, description="用户名")
    password: str = Field(..., min_length=6, max_length=128, description="密码（最少6位）")


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
