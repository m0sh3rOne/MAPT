from typing import Optional, List
from uuid import UUID
from fastapi import Depends, HTTPException, status, Header, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import decode_token, UserRole
from app.models.user import User
from app.models.device import Device
from app.repositories.user_repository import UserRepository
from app.services.agent_service import AgentService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token_header: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = token_header or token_query
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expirée ou jeton d'authentification manquant.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton d'authentification invalide.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte utilisateur inactif.")
    return user


def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissions insuffisantes pour effectuer cette action."
            )
        return current_user
    return role_checker


async def get_current_agent(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Device:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton d'agent manquant ou invalide.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    agent_token = authorization.replace("Bearer ", "").strip()
    agent_service = AgentService(db)
    return await agent_service.authenticate_agent(agent_token)
