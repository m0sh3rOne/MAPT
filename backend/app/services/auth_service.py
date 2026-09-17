from datetime import datetime, timezone
from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.audit import AuditAction
from app.repositories.user_repository import UserRepository
from app.repositories.audit_repository import AuditRepository
from app.core.security import verify_password, get_password_hash, create_access_token
from app.schemas.auth import LoginRequest, Token, UserCreate, UserUpdate


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.audit_repo = AuditRepository(db)

    async def authenticate(self, login_data: LoginRequest, ip_address: Optional[str] = None) -> Token:
        user = await self.user_repo.get_by_username(login_data.username)
        if not user or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Nom d'utilisateur ou mot de passe incorrect."
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ce compte utilisateur est désactivé."
            )

        user.last_login_at = datetime.now(timezone.utc)
        await self.user_repo.update(user)

        # Audit login
        await self.audit_repo.create(
            action=AuditAction.USER_LOGIN,
            entity_type="user",
            user_id=user.id,
            entity_id=user.id,
            details={"username": user.username, "role": user.role},
            ip_address=ip_address
        )

        access_token = create_access_token(subject=str(user.id), role=user.role)
        return Token(
            access_token=access_token,
            token_type="bearer",
            user_id=user.id,
            username=user.username,
            role=user.role
        )

    async def create_user(self, user_in: UserCreate, current_user_id: Optional[UUID] = None, ip_address: Optional[str] = None) -> User:
        if await self.user_repo.get_by_username(user_in.username):
            raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà utilisé.")
        if await self.user_repo.get_by_email(user_in.email):
            raise HTTPException(status_code=400, detail="Cette adresse email est déjà utilisée.")

        user = User(
            username=user_in.username,
            email=user_in.email,
            password_hash=get_password_hash(user_in.password),
            role=user_in.role,
            is_active=True
        )
        created = await self.user_repo.create(user)

        await self.audit_repo.create(
            action=AuditAction.USER_CREATED,
            entity_type="user",
            user_id=current_user_id,
            entity_id=created.id,
            details={"username": created.username, "role": created.role},
            ip_address=ip_address
        )
        return created
