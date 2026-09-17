from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
from jose import jwt, JWTError
import bcrypt
import secrets
from app.core.config import settings


class UserRole:
    SUPER_ADMIN = "super_admin"
    ADMINISTRATOR = "administrator"
    OPERATOR = "operator"
    VIEWER = "viewer"

    ALL_ROLES = [SUPER_ADMIN, ADMINISTRATOR, OPERATOR, VIEWER]
    WRITE_ROLES = [SUPER_ADMIN, ADMINISTRATOR, OPERATOR]
    ADMIN_ROLES = [SUPER_ADMIN, ADMINISTRATOR]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def create_access_token(subject: Union[str, Any], role: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role,
        "type": "access_token"
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_agent_token() -> str:
    return f"mapt_ag_{secrets.token_urlsafe(32)}"
