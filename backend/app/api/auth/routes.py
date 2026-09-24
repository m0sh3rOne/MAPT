from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.auth import (
    LoginRequest, Token, UserResponse, UserCreate, UserUpdate,
    ChangePasswordRequest, UpdateProfileRequest
)
from app.services.auth_service import AuthService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentification & Utilisateurs"])


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
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at.isoformat() if current_user.last_login_at else None
    )


@router.put("/profile", response_model=UserResponse)
async def update_my_profile(
    profile_in: UpdateProfileRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    user = await auth_service.update_profile(current_user, email=profile_in.email, ip_address=client_ip)
    await db.commit()
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None
    )


@router.post("/change-password")
async def change_password(
    pwd_in: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    await auth_service.change_password(
        user=current_user,
        current_password=pwd_in.current_password,
        new_password=pwd_in.new_password,
        ip_address=client_ip
    )
    await db.commit()
    return {"message": "Mot de passe modifié avec succès."}


@router.get("/enrollment-token")
async def get_enrollment_token(current_user: User = Depends(get_current_user)):
    from app.core.config import settings
    return {"enrollment_token": settings.DEFAULT_ENROLLMENT_TOKEN}


# ==================== SUPER ADMIN / ADMIN - GESTION DES UTILISATEURS ====================

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    users = await auth_service.get_all_users(skip=skip, limit=limit)
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login_at=u.last_login_at.isoformat() if u.last_login_at else None
        )
        for u in users
    ]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    user = await auth_service.create_user(user_in, current_user_id=current_user.id, ip_address=client_ip)
    await db.commit()
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=None
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: UUID,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(user_id)
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_in: UserUpdate,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    user = await auth_service.update_user(
        user_id=user_id,
        user_in=user_in,
        current_user_id=current_user.id,
        ip_address=client_ip
    )
    await db.commit()
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    client_ip = request.client.host if request.client else None
    await auth_service.delete_user(
        user_id=user_id,
        current_user_id=current_user.id,
        ip_address=client_ip
    )
    await db.commit()
    return {"message": "Utilisateur supprimé avec succès."}
