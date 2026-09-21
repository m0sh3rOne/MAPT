from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.security import get_password_hash, UserRole
from app.models.user import User
from app.storage.minio import ensure_bucket_exists
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Initializing MAPT platform backend...")

    # Création des tables si nécessaire (mode direct/dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Initialisation du bucket MinIO
    ensure_bucket_exists()

    # Création du compte super administrateur initial si aucun utilisateur n'existe
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        if not result.scalar_one_or_none():
            admin_user = User(
                username=settings.INITIAL_ADMIN_USERNAME,
                email=settings.INITIAL_ADMIN_EMAIL,
                password_hash=get_password_hash(settings.INITIAL_ADMIN_PASSWORD),
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()
            logger.info(f"Super Admin user created (username: '{settings.INITIAL_ADMIN_USERNAME}')")

    logger.info("MAPT backend startup completed successfully.")
    yield
    logger.info("Shutting down MAPT backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routes de l'API REST v1
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/scripts/install-agent.ps1")
@app.get("/scripts/install.ps1")
async def get_ps1_root(request: Request, token: str = None):
    from app.api.agent.enroll import get_agent_installer_script
    return await get_agent_installer_script(request, token)


@app.get("/scripts/install-agent.bat")
@app.get("/scripts/install.bat")
async def get_bat_root(request: Request, token: str = None):
    from app.api.agent.enroll import get_agent_installer_batch
    return await get_agent_installer_batch(request, token)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "MAPT Backend",
        "version": "1.0.0"
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Bienvenue sur l'API MAPT (Plateforme de Déploiement et Administration de Parc)",
        "docs": f"{settings.API_V1_STR}/docs"
    }

