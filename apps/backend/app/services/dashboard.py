from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import json

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import (
    AccountMetricSnapshotOrm,
    ContentItemOrm,
    ContentMetricSnapshotOrm,
    SocialAccountOrm,
    SocialChannelOrm,
)
from app.models import (
    Channel,
    ConnectorStatus,
    DashboardPayload,
    KpiSummary,
    MetricFocus,
    PlatformMetricProfile,
    PlatformSnapshot,
    SocialAccount,
    TimePoint,
    TopContent,
)
from app.services.content_scoring import ContentScoreInput, evaluate_content_score


class DashboardService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def payload(self) -> DashboardPayload:
        channels = self._channels()
        accounts = self._accounts()
        platforms = self._platform_snapshots()
        top_content = self._top_content()
        
        # Periodo global de las vistas agregadas: se prefiere la ventana analitica
        # de YouTube y se cae al rango de publicacion de las demas redes.
        period_start = None
        period_end = None
        for wanted in ("youtube", "facebook", "instagram", "tiktok"):
            match = next(
                (p for p in platforms if p.platform == wanted and p.period_start and p.period_end),
                None,
            )
            if match:
                period_start = match.period_start
                period_end = match.period_end
                break

        return DashboardPayload(
            generated_at=datetime.now(timezone.utc).isoformat(),
            source="sqlite" if any(row.last_sync for row in platforms) else "sqlite_empty",
            channels=channels,
            accounts=accounts,
            summary=self._summary(platforms),
            platforms=platforms,
            series=self._series(channels),
            top_content=top_content,
            connector_status=self._connector_status(accounts),
            metric_focus=self._metric_focus(),
            platform_profiles=self._platform_profiles(),
            period_start=period_start,
            period_end=period_end,
        )

    def _channels(self) -> list[Channel]:
        rows = self.session.query(SocialChannelOrm).order_by(SocialChannelOrm.id).all()
        result: list[Channel] = []
        for row in rows:
            platforms = sorted({account.platform for account in row.accounts if account.enabled})
            result.append(Channel(id=row.id, name=row.name, color=row.color, platforms=platforms))
        return result

    def _accounts(self) -> list[SocialAccount]:
        rows = self.session.query(SocialAccountOrm).order_by(SocialAccountOrm.channel_id, SocialAccountOrm.platform).all()
        return [
            SocialAccount(
                id=row.id,
                channel_id=row.channel_id,
                platform=row.platform,
                external_id=row.external_id,
                name=row.name,
                handle=row.handle,
                url=row.url,
                enabled=row.enabled,
                status=row.status,
                last_sync_at=row.last_sync_at.isoformat() if row.last_sync_at else None,
            )
            for row in rows
        ]

    def _content_periods(self) -> dict[int, tuple[str, str]]:
        """Rango de publicacion (min, max) por cuenta. Es el periodo medido de las
        plataformas que no exponen una ventana analitica propia."""
        rows = (
            self.session.query(
                ContentItemOrm.account_id,
                func.min(ContentItemOrm.published_at),
                func.max(ContentItemOrm.published_at),
            )
            .filter(ContentItemOrm.published_at.isnot(None))
            .group_by(ContentItemOrm.account_id)
            .all()
        )
        return {row[0]: (str(row[1]), str(row[2])) for row in rows if row[1] and row[2]}

    def _platform_snapshots(self) -> list[PlatformSnapshot]:
        accounts = self.session.query(SocialAccountOrm).order_by(SocialAccountOrm.channel_id, SocialAccountOrm.platform).all()
        content_periods = self._content_periods()
        snapshots: list[PlatformSnapshot] = []
        for account in accounts:
            snapshots_query = (
                self.session.query(AccountMetricSnapshotOrm)
                .filter(AccountMetricSnapshotOrm.account_id == account.id)
                .order_by(AccountMetricSnapshotOrm.captured_at.desc())
                .limit(2)
                .all()
            )
            latest = snapshots_query[0] if len(snapshots_query) > 0 else None
            previous = snapshots_query[1] if len(snapshots_query) > 1 else None

            # Contar publicaciones
            post_count = self.session.query(ContentItemOrm).filter(ContentItemOrm.account_id == account.id).count()
            if previous:
                post_count_delta = self.session.query(ContentItemOrm).filter(
                    ContentItemOrm.account_id == account.id,
                    ContentItemOrm.created_at > previous.captured_at
                ).count()
            else:
                post_count_delta = post_count

            if latest is None:
                snapshots.append(
                    PlatformSnapshot(
                        channel_id=account.channel_id,
                        platform=account.platform,
                        views=0,
                        views_delta=0,
                        engagement_quality=0,
                        status=account.status,
                        last_sync=account.last_sync_at.isoformat() if account.last_sync_at else "",
                        period_start=content_periods.get(account.id, (None, None))[0],
                        period_end=content_periods.get(account.id, (None, None))[1],
                    )
                )
                continue

            # Load extra_json
            latest_extra = json.loads(latest.extra_json or "{}")
            previous_extra = json.loads(previous.extra_json or "{}") if previous else {}

            views = latest.views
            watch_time_hours = latest.watch_time_hours
            retention_rate = latest.retention_rate
            engagement_quality = latest.engagement_quality
            audience_growth = latest.audience_growth
            interactions = latest.interactions
            followers_count = latest.followers_count

            # Previous values for deltas
            prev_views = previous.views if previous else 0
            prev_retention = previous.retention_rate if previous else 0.0
            prev_interactions = previous.interactions if previous else 0
            prev_followers = previous.followers_count if previous else 0
            prev_growth = previous.audience_growth if previous else 0

            # Override for youtube if we have the period
            if account.platform == "youtube":
                pfx = "hist_"
                
                views = int(latest_extra.get(f"{pfx}views", latest.views))
                watch_time_hours = float(latest_extra.get(f"{pfx}watch_hours", latest.watch_time_hours or 0.0))
                retention_rate = float(latest_extra.get(f"{pfx}retention", latest.retention_rate or 0.0))
                
                likes = float(latest_extra.get(f"{pfx}likes", 0.0))
                comments = float(latest_extra.get(f"{pfx}comments", 0.0))
                shares = float(latest_extra.get(f"{pfx}shares", 0.0))
                interactions = int(likes + comments + shares)
                
                engagement_quality = round(((likes + comments + shares) / views * 100), 2) if views else 0.0
                
                subs_gained = float(latest_extra.get(f"{pfx}subs_gained", 0.0))
                subs_lost = float(latest_extra.get(f"{pfx}subs_lost", 0.0))
                audience_growth = int(subs_gained - subs_lost)

                # Previous override for deltas
                if previous:
                    prev_views = int(previous_extra.get(f"{pfx}views", previous.views))
                    prev_retention = float(previous_extra.get(f"{pfx}retention", previous.retention_rate or 0.0))
                    prev_likes = float(previous_extra.get(f"{pfx}likes", 0.0))
                    prev_comments = float(previous_extra.get(f"{pfx}comments", 0.0))
                    prev_shares = float(previous_extra.get(f"{pfx}shares", 0.0))
                    prev_interactions = int(prev_likes + prev_comments + prev_shares)
                    
                    prev_subs_gained = float(previous_extra.get(f"{pfx}subs_gained", 0.0))
                    prev_subs_lost = float(previous_extra.get(f"{pfx}subs_lost", 0.0))
                    prev_growth = int(prev_subs_gained - prev_subs_lost)

            # Deltas calculation
            views_delta = views - prev_views
            retention_delta = round((retention_rate or 0.0) - (prev_retention or 0.0), 1)
            interactions_delta = interactions - prev_interactions
            followers_delta = (followers_count or 0) - (prev_followers or 0) if (followers_count is not None and prev_followers is not None) else 0
            audience_growth_delta = (audience_growth or 0) - (prev_growth or 0)

            # Calcular delta de compromiso e inyectarlo en extra
            prev_engagement_quality = previous.engagement_quality if previous else 0.0
            engagement_delta = round(engagement_quality - prev_engagement_quality, 2)
            latest_extra["engagement_delta"] = engagement_delta

            # Periodo medido propio de esta cuenta: YouTube expone su ventana de
            # Analytics; el resto se deriva del rango real de publicacion.
            period_start, period_end = content_periods.get(account.id, (None, None))
            if account.platform == "youtube":
                hist_start = latest_extra.get("hist_start")
                hist_end = latest_extra.get("hist_end")
                if isinstance(hist_start, str) and isinstance(hist_end, str) and hist_start and hist_end:
                    period_start, period_end = hist_start, hist_end

            snapshots.append(
                PlatformSnapshot(
                    channel_id=account.channel_id,
                    platform=account.platform,
                    period_start=period_start,
                    period_end=period_end,
                    exposure=latest.exposure,
                    views=views,
                    views_delta=views_delta,
                    watch_time_hours=watch_time_hours,
                    retention_rate=retention_rate,
                    retention_delta=retention_delta,
                    engagement_quality=engagement_quality,
                    audience_growth=audience_growth,
                    audience_growth_delta=audience_growth_delta,
                    interactions=interactions,
                    interactions_delta=interactions_delta,
                    followers_count=followers_count,
                    followers_delta=followers_delta,
                    post_count=post_count,
                    post_count_delta=post_count_delta,
                    extra=latest_extra,
                    status=account.status,
                    last_sync=latest.captured_at.isoformat(),
                )
            )
        return snapshots

    def _top_content(self) -> list[TopContent]:
        # 1. Obtener los últimos 50 contenidos por cada cuenta social habilitada
        accounts = self.session.query(SocialAccountOrm).filter(SocialAccountOrm.enabled == True).all()
        accounts_map = {acc.id: acc for acc in accounts}
        
        items = []
        for acc in accounts:
            acc_items = (
                self.session.query(ContentItemOrm)
                .filter(ContentItemOrm.account_id == acc.id)
                .order_by(ContentItemOrm.published_at.desc())
                .limit(50)
                .all()
            )
            items.extend(acc_items)
            
        # Ordenar globalmente por fecha descendente
        items.sort(key=lambda x: x.published_at or "", reverse=True)
        
        # 2. Cargar todos los content items históricos de la base de datos para armar las poblaciones completas
        all_items = self.session.query(ContentItemOrm).all()
        
        # 3. Traer el snapshot más reciente para cada content item histórico
        all_snaps = (
            self.session.query(ContentMetricSnapshotOrm)
            .order_by(ContentMetricSnapshotOrm.captured_at.desc())
            .all()
        )
        latest_snaps = {}
        for snap in all_snaps:
            if snap.content_id not in latest_snaps:
                latest_snaps[snap.content_id] = snap
                
        # 4. Construir poblaciones completas de referencia agrupadas por (channel_id, platform, content_type)
        views_by_group = defaultdict(list)
        retention_by_group = defaultdict(list)
        signal_by_group = defaultdict(list)
        conversion_by_group = defaultdict(list)
        
        pfx = "hist_"
        
        for item in all_items:
            account = accounts_map.get(item.account_id)
            if not account:
                continue
            latest = latest_snaps.get(item.id)
            if latest is None:
                continue
                
            extra_data = json.loads(latest.extra_json or "{}")
            
            # Resolver tipo de contenido
            content_type = item.content_type
            if content_type == "unknown" and item.platform == "youtube":
                content_type = "short" if float(extra_data.get("duration_seconds") or 0) <= 60 else "video"
                
            # Extraer métricas históricas
            if item.platform == "youtube":
                views = int(extra_data.get(f"{pfx}views", latest.views))
                retention = float(extra_data.get(f"{pfx}retention", latest.retention_rate or 0.0))
                likes = float(extra_data.get(f"{pfx}likes", 0.0))
                comments = float(extra_data.get(f"{pfx}comments", 0.0))
                shares = float(extra_data.get(f"{pfx}shares", 0.0))
                saves = float(extra_data.get(f"{pfx}saves", 0.0))
                subs_gained = float(extra_data.get(f"{pfx}subs_gained", 0.0))
                subs_lost = float(extra_data.get(f"{pfx}subs_lost", 0.0))
                growth = int(subs_gained - subs_lost)
            else:
                views = latest.views
                retention = latest.retention_rate
                likes = float(extra_data.get("likes", 0.0))
                comments = float(extra_data.get("comments", 0.0))
                shares = float(extra_data.get("shares", 0.0))
                saves = float(extra_data.get("saves", 0.0))
                growth = latest.audience_growth or 0
                
            conversion_rate = (growth / views) * 1000 if views > 0 else 0.0
            reach = float(extra_data.get("reach", 0.0))
            denominator = reach if item.platform in ("facebook", "instagram") and reach > 0 else float(views)
            weighted_signal = likes + (comments * 4) + (shares * 6) + (saves * 8)
            weighted_signal_rate = round((weighted_signal / denominator * 100), 2) if denominator else 0.0
            retention_for_score = min(retention, 100.0) if retention is not None else None
            
            group = (account.channel_id, item.platform, content_type)
            views_by_group[group].append(views)
            if retention_for_score is not None:
                retention_by_group[group].append(retention_for_score)
            signal_by_group[group].append(weighted_signal_rate)
            if conversion_rate > 0:
                conversion_by_group[group].append(conversion_rate)

        # 5. Procesar los 50 ítems de salida utilizando las poblaciones del histórico completo
        rows: list[TopContent] = []
        for item in items:
            account = accounts_map.get(item.account_id)
            if not account:
                continue
            latest = latest_snaps.get(item.id)
            if latest is None:
                continue
                
            extra_data = json.loads(latest.extra_json or "{}")
            
            # Resolver tipo de contenido
            content_type = item.content_type
            if content_type == "unknown" and item.platform == "youtube":
                content_type = "short" if float(extra_data.get("duration_seconds") or 0) <= 60 else "video"
                
            if item.platform == "youtube":
                views = int(extra_data.get(f"{pfx}views", latest.views))
                retention = float(extra_data.get(f"{pfx}retention", latest.retention_rate or 0.0))
                likes = float(extra_data.get(f"{pfx}likes", 0.0))
                comments = float(extra_data.get(f"{pfx}comments", 0.0))
                shares = float(extra_data.get(f"{pfx}shares", 0.0))
                saves = float(extra_data.get(f"{pfx}saves", 0.0))
                
                subs_gained = float(extra_data.get(f"{pfx}subs_gained", 0.0))
                subs_lost = float(extra_data.get(f"{pfx}subs_lost", 0.0))
                growth = int(subs_gained - subs_lost)
                avg_duration = float(extra_data.get(f"{pfx}avg_duration", latest.average_view_duration_sec or 0.0))
                
                # Inyectar vistas secundarias
                extra_data["secondary_views"] = float(extra_data.get("public_total_views", latest.views))
                extra_data["secondary_label"] = "Vistas públicas"
            else:
                views = latest.views
                retention = latest.retention_rate
                likes = float(extra_data.get("likes", 0.0))
                comments = float(extra_data.get("comments", 0.0))
                shares = float(extra_data.get("shares", 0.0))
                saves = float(extra_data.get("saves", 0.0))
                growth = latest.audience_growth or 0
                avg_duration = latest.average_view_duration_sec

            growth_per_1k = (growth / views) * 1000 if views > 0 else 0.0
            reach = float(extra_data.get("reach", 0.0))
            denominator = reach if item.platform in ("facebook", "instagram") and reach > 0 else float(views)
            interactions = likes + comments + shares + saves
            engagement = round((interactions / denominator * 100), 2) if denominator else 0.0
            weighted_signal = likes + (comments * 4) + (shares * 6) + (saves * 8)
            weighted_signal_rate = round((weighted_signal / denominator * 100), 2) if denominator else 0.0
            retention_for_score = min(retention, 100.0) if retention is not None else None
            
            group = (account.channel_id, item.platform, content_type)
            
            # Obtener percentiles dentro del grupo histórico total
            percentil_views = _percentile_score(views, views_by_group[group])
            percentil_retention = _percentile_score(retention_for_score, retention_by_group[group]) if retention_for_score is not None else None
            percentil_signal = _percentile_score(weighted_signal_rate, signal_by_group[group])
            percentil_engagement = percentil_signal
            percentil_conversion = _percentile_score(growth_per_1k, conversion_by_group[group]) if conversion_by_group[group] else None
            
            score_result = evaluate_content_score(
                ContentScoreInput(
                    platform=item.platform,
                    content_type=content_type,
                    views=views,
                    reach=reach,
                    retention_rate=retention,
                    likes=likes,
                    comments=comments,
                    shares=shares,
                    saves=saves,
                    audience_growth=growth,
                    percentil_views=percentil_views,
                    percentil_retention=percentil_retention,
                    percentil_signal=percentil_signal,
                    percentil_conversion=percentil_conversion,
                    group_size=len(views_by_group[group]),
                )
            )
            extra_data["score_details"] = score_result.details

            rows.append(
                TopContent(
                    id=item.external_id,
                    channel_id=account.channel_id,
                    platform=item.platform,
                    title=item.title,
                    published_at=item.published_at,
                    url=item.url or _default_url(item.platform, item.external_id),
                    content_type=content_type,
                    exposure=latest.exposure,
                    views=views,
                    average_view_duration_sec=avg_duration,
                    retention_rate=retention,
                    engagement_quality=engagement,
                    audience_growth=growth,
                    score=score_result.score,
                    extra=extra_data,
                    diagnosis=score_result.diagnosis,
                )
            )
        return sorted(rows, key=lambda row: row.published_at, reverse=True)

    def _summary(self, rows: list[PlatformSnapshot]) -> KpiSummary:
        return KpiSummary(
            exposure=sum(row.exposure or 0 for row in rows),
            exposure_delta=0,
            views=sum(row.views for row in rows),
            views_delta=sum(row.views_delta for row in rows),
            watch_time_hours=round(sum(row.watch_time_hours or 0.0 for row in rows), 2),
            watch_time_delta=0.0,
            retention_rate=_avg([row.retention_rate for row in rows]) or 0.0,
            retention_delta=_avg([row.retention_delta for row in rows]) or 0.0,
            engagement_quality=_avg([row.engagement_quality for row in rows]) or 0.0,
            engagement_delta=0.0,
            audience_growth=sum(row.audience_growth or 0 for row in rows),
            audience_growth_delta=sum(row.audience_growth_delta or 0 for row in rows),
            interactions=sum(row.interactions for row in rows),
            interactions_delta=sum(row.interactions_delta for row in rows),
            followers_count=sum(row.followers_count or 0 for row in rows),
            followers_delta=sum(row.followers_delta for row in rows),
            post_count=sum(row.post_count for row in rows),
            post_count_delta=sum(row.post_count_delta for row in rows),
        )

    def _series(self, channels: list[Channel]) -> dict[str, list[TimePoint]]:
        by_channel: dict[str, dict[str, dict[str, float]]] = {
            channel.id: defaultdict(lambda: {"exposure": 0, "views": 0, "retention_sum": 0, "retention_count": 0})
            for channel in channels
        }
        rows = (
            self.session.query(AccountMetricSnapshotOrm, SocialAccountOrm)
            .join(SocialAccountOrm, AccountMetricSnapshotOrm.account_id == SocialAccountOrm.id)
            .order_by(AccountMetricSnapshotOrm.captured_at.asc())
            .all()
        )
        for snapshot, account in rows:
            date = snapshot.captured_at.date().isoformat()
            bucket = by_channel.setdefault(account.channel_id, defaultdict(dict))[date]
            bucket["exposure"] = bucket.get("exposure", 0) + (snapshot.exposure or 0)
            bucket["views"] = bucket.get("views", 0) + snapshot.views
            if snapshot.retention_rate is not None:
                bucket["retention_sum"] = bucket.get("retention_sum", 0) + snapshot.retention_rate
                bucket["retention_count"] = bucket.get("retention_count", 0) + 1
        result: dict[str, list[TimePoint]] = {}
        for channel in channels:
            result[channel.id] = [
                TimePoint(
                    date=date,
                    exposure=int(values.get("exposure", 0)),
                    views=int(values.get("views", 0)),
                    retention_rate=round(values.get("retention_sum", 0) / max(values.get("retention_count", 0), 1), 1),
                )
                for date, values in sorted(by_channel.get(channel.id, {}).items())
            ]
        return result

    def _connector_status(self, accounts: list[SocialAccount]) -> list[ConnectorStatus]:
        states: dict[str, list[str]] = defaultdict(list)
        for account in accounts:
            if account.enabled:
                states[account.platform].append(account.status)
        result = []
        for platform in ["youtube", "facebook", "instagram", "tiktok", "linkedin"]:
            values = states.get(platform)
            if not values:
                result.append(ConnectorStatus(platform=platform, state="pending", mode="pendiente", message="Sin cuentas activas configuradas."))
                continue
            if all(value == "ok" for value in values):
                state = "ok"
            elif any(value == "degraded" for value in values):
                state = "degraded"
            else:
                state = "pending"
            message = "Listo para sincronizar." if state == "ok" else "Pendiente o requiere credenciales/configuracion."
            result.append(ConnectorStatus(platform=platform, state=state, mode="sqlite+api", message=message))
        return result

    def _platform_profiles(self) -> dict[str, PlatformMetricProfile]:
        raw = json.loads(self.settings.platform_kpis_path.read_text(encoding="utf-8"))
        return {platform: PlatformMetricProfile(**profile) for platform, profile in raw["profiles"].items()}

    @staticmethod
    def _metric_focus() -> list[MetricFocus]:
        return [
            MetricFocus(id="exposure", label="Distribucion inicial (Exposure)", category="Entra", priority=1, why="Confirma si la red social esta probando el contenido.", platforms=["youtube", "facebook", "instagram", "tiktok", "linkedin"], api_status="oficial/parcial"),
            MetricFocus(id="views", label="Vistas (Views)", category="Entra", priority=2, why="Mide si la exposicion se convierte en consumo real.", platforms=["youtube", "facebook", "instagram", "tiktok"], api_status="oficial"),
            MetricFocus(id="retention", label="Retencion (Retention)", category="Retiene", priority=3, why="Diagnostica hook, ritmo y duracion.", platforms=["youtube", "facebook", "instagram", "tiktok"], api_status="oficial/parcial"),
            MetricFocus(id="strong_signal", label="Senal fuerte (Strong signal)", category="Senal", priority=4, why="Prioriza compartidos, guardados y comentarios sobre likes.", platforms=["youtube", "facebook", "instagram", "tiktok", "linkedin"], api_status="oficial"),
            MetricFocus(id="conversion", label="Conversion a audiencia (Audience growth)", category="Convierte", priority=5, why="Separa viralidad vacia de crecimiento real.", platforms=["youtube", "instagram", "facebook", "tiktok", "linkedin"], api_status="oficial/parcial"),
        ]


def _avg(values: list[float | None]) -> float | None:
    filtered = [value for value in values if value is not None]
    if not filtered:
        return None
    return round(sum(filtered) / len(filtered), 2)


def _percentile_score(value: float | int | None, values: list[float | int]) -> float:
    if value is None or not values:
        return 0.0
    numeric_value = float(value)
    if numeric_value <= 0:
        return 0.0
    sorted_values = sorted(float(item) for item in values)
    if len(sorted_values) == 1:
        return 50.0
    if sorted_values[0] == sorted_values[-1]:
        return 50.0
    below_or_equal = sum(1 for item in sorted_values if item <= numeric_value)
    return min(100.0, round(((below_or_equal - 1) / (len(sorted_values) - 1)) * 100, 1))


def _default_url(platform: str, external_id: str) -> str:
    if platform == "youtube":
        return f"https://www.youtube.com/watch?v={external_id}"
    return ""
