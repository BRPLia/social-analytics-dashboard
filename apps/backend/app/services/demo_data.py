from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import random

from sqlalchemy.orm import Session

from app.db import (
    AccountMetricSnapshotOrm,
    ContentItemOrm,
    ContentMetricSnapshotOrm,
    SocialAccountOrm,
    SocialChannelOrm,
    SyncRunOrm,
)
from app.metrics.calculator import content_score
from app.services.maintenance import MaintenanceService

DEMO_PREFIX = "DEMO-"
SERIES_DAYS = 60
CONTENT_DAYS = 180

CHANNELS = [
    ("DEMO-ESTUDIO", "Estudio Demo", "#84CC16"),
    ("DEMO-TIENDA", "Tienda Demo", "#38BDF8"),
]

ACCOUNTS = [
    ("DEMO-ESTUDIO", "youtube", "Estudio Demo", "@estudiodemo"),
    ("DEMO-ESTUDIO", "instagram", "Estudio Demo", "@estudiodemo"),
    ("DEMO-ESTUDIO", "tiktok", "Estudio Demo", "@estudiodemo"),
    ("DEMO-TIENDA", "facebook", "Tienda Demo", "@tiendademo"),
    ("DEMO-TIENDA", "instagram", "Tienda Demo", "@tiendademo"),
    ("DEMO-TIENDA", "tiktok", "Tienda Demo", "@tiendademo"),
]

TITLES = [
    "Como empezamos el proyecto",
    "Tres errores que cometimos el primer ano",
    "Detras de camaras: un dia completo",
    "Respondemos vuestras preguntas",
    "El antes y el despues",
    "Lo que nadie cuenta del oficio",
    "Probamos algo nuevo",
    "Resumen del mes",
    "Nuestro proceso paso a paso",
    "La pregunta que mas nos hacen",
]


class DemoDataService:
    """Genera un conjunto de datos ficticios para explorar la herramienta sin credenciales."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def is_loaded(self) -> bool:
        return (
            self.session.query(SocialChannelOrm)
            .filter(SocialChannelOrm.id.startswith(DEMO_PREFIX))
            .first()
            is not None
        )

    def load(self) -> dict[str, int | str]:
        if self.is_loaded():
            return {"status": "already_loaded", "channels": 0, "accounts": 0, "content_items": 0}

        rng = random.Random(20260820)
        now = datetime.now(timezone.utc)

        for channel_id, name, color in CHANNELS:
            self.session.add(SocialChannelOrm(id=channel_id, name=name, color=color, status="active"))
        self.session.flush()

        content_count = 0
        for channel_id, platform, name, handle in ACCOUNTS:
            account = SocialAccountOrm(
                channel_id=channel_id,
                platform=platform,
                external_id=f"{DEMO_PREFIX}{platform}-{channel_id}",
                name=f"{name} {platform.capitalize()}",
                handle=handle,
                url="",
                enabled=True,
                status="ok",
                last_sync_at=now,
            )
            self.session.add(account)
            self.session.flush()

            self._account_series(account, rng, now)
            content_count += self._content(account, rng, now)

            self.session.add(
                SyncRunOrm(
                    account_id=account.id,
                    platform=platform,
                    channel_id=channel_id,
                    status="success",
                    message="Datos de ejemplo",
                    started_at=now,
                    finished_at=now,
                    duration_ms=rng.randint(400, 2600),
                )
            )

        return {
            "status": "success",
            "channels": len(CHANNELS),
            "accounts": len(ACCOUNTS),
            "content_items": content_count,
        }

    def unload(self) -> dict[str, int | str]:
        maintenance = MaintenanceService(self.session)
        channels = (
            self.session.query(SocialChannelOrm)
            .filter(SocialChannelOrm.id.startswith(DEMO_PREFIX))
            .all()
        )
        removed = 0
        for channel in channels:
            maintenance.delete_channel_cascade(channel.id)
            removed += 1
        return {"status": "success", "channels_removed": removed}

    def _account_series(self, account: SocialAccountOrm, rng: random.Random, now: datetime) -> None:
        followers = rng.randint(4_000, 45_000)
        views = rng.randint(1_800, 9_000)
        for offset in range(SERIES_DAYS, -1, -1):
            captured = now - timedelta(days=offset)
            views = max(300, int(views * rng.uniform(0.94, 1.09)))
            followers += rng.randint(-20, 140)
            interactions = int(views * rng.uniform(0.03, 0.11))
            retention = round(rng.uniform(28, 62), 1)
            self.session.add(
                AccountMetricSnapshotOrm(
                    account_id=account.id,
                    captured_at=captured,
                    exposure=int(views * rng.uniform(1.2, 2.4)),
                    views=views,
                    watch_time_hours=round(views * retention / 100 * 0.6 / 60, 1),
                    retention_rate=retention,
                    engagement_quality=round(interactions / max(views, 1) * 100, 2),
                    audience_growth=rng.randint(-15, 120),
                    interactions=interactions,
                    followers_count=followers,
                    extra_json="{}",
                )
            )

    def _content(self, account: SocialAccountOrm, rng: random.Random, now: datetime) -> int:
        total = rng.randint(18, 26)
        for index in range(total):
            published = now - timedelta(days=rng.randint(1, CONTENT_DAYS))
            views = int(rng.lognormvariate(8.2, 1.1))
            retention = round(rng.uniform(22, 71), 1)
            likes = int(views * rng.uniform(0.02, 0.09))
            comments = int(likes * rng.uniform(0.02, 0.15))
            shares = int(likes * rng.uniform(0.01, 0.12))
            saves = int(likes * rng.uniform(0.01, 0.2))
            growth = rng.randint(-4, 90)
            interactions = likes + comments + shares + saves
            quality = round(interactions / max(views, 1) * 100, 2)

            content = ContentItemOrm(
                account_id=account.id,
                platform=account.platform,
                external_id=f"{DEMO_PREFIX}{account.platform}-{account.id}-{index}",
                content_type="short" if rng.random() < 0.5 else "video",
                title=f"{rng.choice(TITLES)} {index + 1}",
                caption="Contenido de ejemplo generado localmente.",
                url="",
                thumbnail_url="",
                published_at=published.date().isoformat(),
                raw_json="{}",
            )
            self.session.add(content)
            self.session.flush()

            extra = {"likes": likes, "comments": comments, "shares": shares, "saves": saves}
            if account.platform == "youtube":
                extra.update(
                    {
                        "hist_views": views,
                        "hist_retention": retention,
                        "hist_likes": likes,
                        "hist_comments": comments,
                        "hist_shares": shares,
                        "hist_saves": saves,
                        "hist_subs_gained": max(growth, 0),
                        "hist_subs_lost": max(-growth, 0),
                        "duration_seconds": rng.choice([35, 48, 240, 620]),
                    }
                )

            self.session.add(
                ContentMetricSnapshotOrm(
                    content_id=content.id,
                    captured_at=now,
                    exposure=int(views * rng.uniform(1.1, 2.2)),
                    views=views,
                    average_view_duration_sec=round(retention / 100 * rng.uniform(30, 400), 1),
                    retention_rate=retention,
                    engagement_quality=quality,
                    audience_growth=growth,
                    score=content_score(views, retention, quality, growth),
                    interactions=interactions,
                    extra_json=json.dumps(extra, ensure_ascii=True),
                )
            )
        return total
