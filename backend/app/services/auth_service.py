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
        email = user_in.email or f"{user_in.username.lower()}@mapt.local"
        if await self.user_repo.get_by_email(email):
            raise HTTPException(status_code=400, detail="Cette adresse email est déjà utilisée.")

        user = User(
            username=user_in.username,
            email=email,
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

    async def change_password(self, user: User, current_password: str, new_password: str, ip_address: Optional[str] = None) -> bool:
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Le mot de passe actuel est incorrect.")
        if len(new_password) < 4:
            raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 4 caractères.")

        user.password_hash = get_password_hash(new_password)
        await self.user_repo.update(user)

        await self.audit_repo.create(
            action=AuditAction.USER_PASSWORD_CHANGED,
            entity_type="user",
            user_id=user.id,
            entity_id=user.id,
            details={"username": user.username, "action": "password_changed_by_user"},
            ip_address=ip_address
        )
        return True

    async def update_profile(self, user: User, email: Optional[str] = None, ip_address: Optional[str] = None) -> User:
        if email and email != user.email:
            existing = await self.user_repo.get_by_email(email)
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Cette adresse email est déjà utilisée.")
            user.email = email
            await self.user_repo.update(user)

            await self.audit_repo.create(
                action=AuditAction.USER_UPDATED,
                entity_type="user",
                user_id=user.id,
                entity_id=user.id,
                details={"username": user.username, "email": email},
                ip_address=ip_address
            )
        return user

    async def get_all_users(self, skip: int = 0, limit: int = 100) -> list[User]:
        return await self.user_repo.get_all(skip=skip, limit=limit)

    async def get_user_by_id(self, user_id: UUID) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
        return user

    async def update_user(self, user_id: UUID, user_in: UserUpdate, current_user_id: UUID, ip_address: Optional[str] = None) -> User:
        user = await self.get_user_by_id(user_id)

        if user_in.username and user_in.username != user.username:
            existing = await self.user_repo.get_by_username(user_in.username)
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà utilisé.")
            user.username = user_in.username

        if user_in.email and user_in.email != user.email:
            existing = await self.user_repo.get_by_email(user_in.email)
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Cette adresse email est déjà utilisée.")
            user.email = user_in.email

        if user_in.role is not None:
            user.role = user_in.role

        if user_in.is_active is not None:
            if user.id == current_user_id and not user_in.is_active:
                raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte.")
            user.is_active = user_in.is_active

        if user_in.password:
            if len(user_in.password) < 4:
                raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 4 caractères.")
            user.password_hash = get_password_hash(user_in.password)

        updated = await self.user_repo.update(user)

        await self.audit_repo.create(
            action=AuditAction.USER_UPDATED,
            entity_type="user",
            user_id=current_user_id,
            entity_id=updated.id,
            details={"username": updated.username, "role": updated.role, "is_active": updated.is_active},
            ip_address=ip_address
        )
        return updated

    async def delete_user(self, user_id: UUID, current_user_id: UUID, ip_address: Optional[str] = None) -> bool:
        if user_id == current_user_id:
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte.")

        user = await self.get_user_by_id(user_id)
        username = user.username
        role = user.role

        await self.user_repo.delete(user)

        await self.audit_repo.create(
            action=AuditAction.USER_DELETED,
            entity_type="user",
            user_id=current_user_id,
            entity_id=user_id,
            details={"username": username, "role": role},
            ip_address=ip_address
        )
        return True
