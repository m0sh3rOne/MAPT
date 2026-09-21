from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.auth import LoginRequest, Token, UserResponse, UserCreate
from app.services.auth_service import AuthService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentification"])


@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    return await auth_service.authenticate(login_data, ip_address=client_ip)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        last_login_at=current_user.last_login_at.isoformat() if current_user.last_login_at else None
    )


@router.get("/enrollment-token")
async def get_enrollment_token(current_user: User = Depends(get_current_user)):
    from app.core.config import settings
    return {"enrollment_token": settings.DEFAULT_ENROLLMENT_TOKEN}



@router.post("/users", response_model=UserResponse)
async def create_user(
    user_in: UserCreate,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    user = await auth_service.create_user(user_in, current_user_id=current_user.id, ip_address=client_ip)
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        last_login_at=None
    )
