import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, BigInteger, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Package(Base):
    __tablename__ = "packages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    package_type = Column(String(50), nullable=False, default="msi")  # msi, exe, zip
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    archived = Column(Boolean, default=False, nullable=False)

    versions = relationship("PackageVersion", back_populates="package", cascade="all, delete-orphan", order_by="desc(PackageVersion.created_at)")


class PackageVersion(Base):
    __tablename__ = "package_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_id = Column(UUID(as_uuid=True), ForeignKey("packages.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(String(100), nullable=False)
    filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=False)
    sha256 = Column(String(64), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    run_with = Column(String(500), nullable=True)  # ex: c:\windows\system32\msiexec.exe, cscript.exe
    run_with_args = Column(String(500), nullable=True)  # ex: /i
    package_args = Column(String(1000), nullable=True)  # ex: /qn /norestart, /S
    run_as_admin = Column(Boolean, default=True, nullable=False)
    is_interactive = Column(Boolean, default=False, nullable=False)  # exécution graphique sur la session de l'utilisateur connecté
    destination_folder = Column(String(500), nullable=True, default="%APPDATA%\\MAPT\\packages")
    install_command = Column(Text, nullable=True)
    uninstall_command = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    package = relationship("Package", back_populates="versions")
    deployments = relationship("Deployment", back_populates="package_version")
