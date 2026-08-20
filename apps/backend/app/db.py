from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SocialChannelOrm(Base):
    __tablename__ = "social_channels"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#84CC16")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    accounts: Mapped[list["SocialAccountOrm"]] = relationship(back_populates="channel")


class SocialAccountOrm(Base):
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("platform", "external_id", name="uq_social_account_platform_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[str] = mapped_column(ForeignKey("social_channels.id"), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    handle: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    channel: Mapped[SocialChannelOrm] = relationship(back_populates="accounts")
    content_items: Mapped[list["ContentItemOrm"]] = relationship(back_populates="account")


class ContentItemOrm(Base):
    __tablename__ = "content_items"
    __table_args__ = (UniqueConstraint("platform", "external_id", name="uq_content_platform_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("social_accounts.id"), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str] = mapped_column(String(180), nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[str] = mapped_column(String(700), nullable=False, default="")
    thumbnail_url: Mapped[str] = mapped_column(String(700), nullable=False, default="")
    published_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    raw_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    account: Mapped[SocialAccountOrm] = relationship(back_populates="content_items")


class AccountMetricSnapshotOrm(Base):
    __tablename__ = "account_metric_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("social_accounts.id"), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    exposure: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    watch_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    retention_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    engagement_quality: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    audience_growth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Nuevas columnas unificadas
    interactions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    followers_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    extra_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class ContentMetricSnapshotOrm(Base):
    __tablename__ = "content_metric_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("content_items.id"), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    exposure: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    average_view_duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    retention_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    engagement_quality: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    audience_growth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    
    # Nuevas columnas unificadas
    interactions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    extra_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class SyncRunOrm(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("social_accounts.id"), nullable=True)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    channel_id: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="running")
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ApiCredentialOrm(Base):
    __tablename__ = "api_credentials"
    __table_args__ = (UniqueConstraint("credential_key", name="uq_credential_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    credential_key: Mapped[str] = mapped_column(String(120), nullable=False)
    credential_value: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # "valid", "expired", "pending"
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class IntegrationCredentialOrm(Base):
    __tablename__ = "integration_credentials"
    __table_args__ = (
        UniqueConstraint("channel_id", "platform", "credential_key", name="uq_integration_credential_scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[str] = mapped_column(ForeignKey("social_channels.id"), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    credential_key: Mapped[str] = mapped_column(String(120), nullable=False)
    credential_value: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


def _database_path() -> Path:
    settings = get_settings()
    return settings.project_root / "storage" / "dashboard_redes.db"


engine = create_engine(f"sqlite:///{_database_path()}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    _database_path().parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    
    import sqlite3
    db_file = str(_database_path())
    conn = sqlite3.connect(db_file)
    try:
        cursor = conn.cursor()
        
        cursor.execute("PRAGMA table_info(account_metric_snapshots)")
        columns = [row[1] for row in cursor.fetchall()]
        if "interactions" not in columns:
            cursor.execute("ALTER TABLE account_metric_snapshots ADD COLUMN interactions INTEGER NOT NULL DEFAULT 0")
        if "followers_count" not in columns:
            cursor.execute("ALTER TABLE account_metric_snapshots ADD COLUMN followers_count INTEGER NULL")
            
        cursor.execute("PRAGMA table_info(content_metric_snapshots)")
        columns_content = [row[1] for row in cursor.fetchall()]
        if "interactions" not in columns_content:
            cursor.execute("ALTER TABLE content_metric_snapshots ADD COLUMN interactions INTEGER NOT NULL DEFAULT 0")

        cursor.execute(
            """
            UPDATE content_items
            SET url = 'https://www.youtube.com/watch?v=' || external_id
            WHERE platform = 'youtube' AND (url IS NULL OR url = '')
            """
        )
            
        conn.commit()
    finally:
        conn.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    init_db()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
