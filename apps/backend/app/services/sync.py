from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import time

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.connectors.meta import MetaConnector
from app.connectors.tiktok import TikTokConnector
from app.connectors.youtube_analytics import YouTubeAnalyticsConnector
from app.connectors.youtube_public import YouTubePublicConnector
from app.core.config import Settings
from app.db import (
    AccountMetricSnapshotOrm,
    ContentItemOrm,
    ContentMetricSnapshotOrm,
    ApiCredentialOrm,
    IntegrationCredentialOrm,
    SocialAccountOrm,
    SyncRunOrm,
)
from app.metrics.calculator import content_score
from app.models import PlatformSnapshot, SyncRunRecord, SyncSummary, TopContent
from app.services.normalization import normalize_content, normalize_snapshot

ACCOUNT_SNAPSHOT_DAYS = 365
CONTENT_SNAPSHOT_DAYS = 90


class SyncService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def sync_all(self) -> SyncSummary:
        accounts = (
            self.session.query(SocialAccountOrm)
            .filter(SocialAccountOrm.enabled.is_(True))
            .order_by(SocialAccountOrm.channel_id, SocialAccountOrm.platform)
            .all()
        )
        return self._sync_accounts(accounts)

    def sync_platform(self, platform: str) -> SyncSummary:
        accounts = (
            self.session.query(SocialAccountOrm)
            .filter(SocialAccountOrm.enabled.is_(True), SocialAccountOrm.platform == platform)
            .order_by(SocialAccountOrm.channel_id)
            .all()
        )
        return self._sync_accounts(accounts)

    def sync_account(self, platform: str, account_id: int) -> SyncSummary:
        account = (
            self.session.query(SocialAccountOrm)
            .filter(
                SocialAccountOrm.id == account_id,
                SocialAccountOrm.platform == platform,
                SocialAccountOrm.enabled.is_(True),
            )
            .one_or_none()
        )
        return self._sync_accounts([account] if account else [])

    def latest_runs(self, limit: int = 30) -> list[SyncRunRecord]:
        rows = self.session.query(SyncRunOrm).order_by(SyncRunOrm.started_at.desc()).limit(limit).all()
        return [self._run_record(row) for row in rows]

    def _sync_accounts(self, accounts: list[SocialAccountOrm]) -> SyncSummary:
        records = [self._sync_one(account) for account in accounts]
        if not records:
            status = "empty"
        elif all(item.status in {"success", "skipped"} for item in records):
            status = "success"
        elif any(item.status == "success" for item in records):
            status = "partial_success"
        else:
            status = "failed"
        return SyncSummary(status=status, runs=records)

    def _sync_one(self, account: SocialAccountOrm) -> SyncRunRecord:
        started = time.perf_counter()
        run = SyncRunOrm(account_id=account.id, platform=account.platform, channel_id=account.channel_id, status="running")
        self.session.add(run)
        self.session.flush()
        try:
            metadata = json.loads(account.metadata_json or "{}")
            if metadata.get("placeholder") or account.platform in {"linkedin"}:
                run.status = "skipped"
                run.message = "Conector pendiente o cuenta sin external_id real."
                account.status = "pending"
                return self._finish(run, started)

            with self.session.begin_nested():
                snapshot, content = self._fetch(account)
                self._store_snapshot(account, snapshot)
                for item in content:
                    self._store_content(account, item)
                account.status = snapshot.status
                account.last_sync_at = datetime.now(timezone.utc)

            run.status = "success"
            run.message = f"{len(content)} contenidos sincronizados."
            return self._finish(run, started)
        except Exception as exc:
            account.status = "degraded"
            run.status = "failed"
            run.message = str(exc)
            return self._finish(run, started)

    def _fetch(self, account: SocialAccountOrm) -> tuple[PlatformSnapshot, list[TopContent]]:
        if account.platform == "youtube":
            return self._fetch_youtube(account)
        if account.platform in {"facebook", "instagram"}:
            return self._fetch_meta(account)
        if account.platform == "tiktok":
            return self._fetch_tiktok(account)
        raise RuntimeError(f"Conector no implementado: {account.platform}")

    def _fetch_youtube(self, account: SocialAccountOrm) -> tuple[PlatformSnapshot, list[TopContent]]:
        connector = YouTubePublicConnector(api_key=self._credential(account, "YOUTUBE_API_KEY"), channel_id=account.external_id)
        if not connector.enabled:
            raise RuntimeError("Faltan YOUTUBE_API_KEY o external_id del canal.")
        snapshot, content = connector.fetch(max_results=50, channel_id=account.channel_id)
        analytics = YouTubeAnalyticsConnector(
            client_id=self._credential(account, "GOOGLE_CLIENT_ID"),
            client_secret=self._credential(account, "GOOGLE_CLIENT_SECRET"),
            refresh_token=self._credential(account, "YOUTUBE_REFRESH_TOKEN"),
        )
        if analytics.enabled:
            try:
                days_hist = analytics.days_since_origin()
                
                # Fetch historical summary & video reports
                summary_hist = analytics.summarize(days=days_hist)
                per_video_hist = analytics.report_by_video(days=days_hist, max_results=50)
                
                public_total_views = snapshot.views
                public_total_likes = snapshot.extra.get("likes", 0)
                public_total_comments = snapshot.extra.get("comments", 0)
                
                # Preserve public total
                snapshot.extra["public_total_views"] = float(public_total_views)
                snapshot.extra["public_total_likes"] = float(public_total_likes)
                snapshot.extra["public_total_comments"] = float(public_total_comments)
                
                # Histórico (lifetime)
                snapshot.extra["hist_views"] = summary_hist["analytics_views"]
                snapshot.extra["hist_likes"] = summary_hist["analytics_likes"]
                snapshot.extra["hist_comments"] = summary_hist["analytics_comments"]
                snapshot.extra["hist_shares"] = summary_hist["shares"]
                snapshot.extra["hist_retention"] = summary_hist["average_view_percentage"]
                snapshot.extra["hist_avg_duration"] = summary_hist["average_view_duration"]
                snapshot.extra["hist_watch_hours"] = summary_hist["watch_time_hours"]
                snapshot.extra["hist_subs_gained"] = summary_hist["subscribers_gained"]
                snapshot.extra["hist_subs_lost"] = summary_hist["subscribers_lost"]
                if "engaged_views" in summary_hist:
                    snapshot.extra["engaged_views"] = summary_hist["engaged_views"]
                    snapshot.extra["hist_engaged_views"] = summary_hist["engaged_views"]
                snapshot.extra["hist_start"] = str(summary_hist["period_start"])
                snapshot.extra["hist_end"] = str(summary_hist["period_end"])
                
                # For backward compatibility, map direct columns to historical
                snapshot.views = int(summary_hist["analytics_views"])
                snapshot.watch_time_hours = summary_hist["watch_time_hours"]
                snapshot.retention_rate = summary_hist["average_view_percentage"]
                snapshot.audience_growth = int(summary_hist["net_subscribers"])
                snapshot.engagement_quality = round(((summary_hist["analytics_likes"] + summary_hist["analytics_comments"] + summary_hist["shares"]) / summary_hist["analytics_views"] * 100), 2) if summary_hist["analytics_views"] else 0.0
                
                for item in content:
                    # Preserve public total
                    public_item_views = float(item.views)
                    public_item_likes = float(item.extra.get("likes", 0))
                    public_item_comments = float(item.extra.get("comments", 0))
                    
                    item.extra["public_total_views"] = public_item_views
                    item.extra["public_total_likes"] = public_item_likes
                    item.extra["public_total_comments"] = public_item_comments
                    
                    # Histórico (lifetime) with Data API v3 fallback
                    v_data_hist = per_video_hist.get(item.id)
                    if v_data_hist is None:
                        try:
                            v_data_hist = analytics.report_for_single_video(item.id, days=days_hist)
                        except Exception:
                            v_data_hist = None
                    
                    if v_data_hist is not None:
                        item.extra["hist_views"] = float(v_data_hist["analytics_views"])
                        item.extra["hist_likes"] = float(v_data_hist["likes"])
                        item.extra["hist_comments"] = float(v_data_hist["comments"])
                        item.extra["hist_shares"] = float(v_data_hist["shares"])
                        item.extra["hist_retention"] = float(v_data_hist["average_view_percentage"])
                        item.extra["hist_avg_duration"] = float(v_data_hist["average_view_duration_sec"])
                        item.extra["hist_watch_hours"] = float(v_data_hist["watch_time_hours"])
                        item.extra["hist_subs_gained"] = float(v_data_hist["subscribers_gained"])
                        item.extra["hist_subs_lost"] = float(v_data_hist["subscribers_lost"])
                        item.extra["hist_start"] = str(v_data_hist["period_start"])
                        item.extra["hist_end"] = str(v_data_hist["period_end"])
                    else:
                        item.extra["hist_views"] = public_item_views
                        item.extra["hist_likes"] = public_item_likes
                        item.extra["hist_comments"] = public_item_comments
                        item.extra["hist_shares"] = 0.0
                        item.extra["hist_retention"] = 0.0
                        item.extra["hist_avg_duration"] = 0.0
                        item.extra["hist_watch_hours"] = 0.0
                        item.extra["hist_subs_gained"] = 0.0
                        item.extra["hist_subs_lost"] = 0.0
                        item.extra["hist_start"] = ""
                        item.extra["hist_end"] = ""
                        item.extra["hist_fallback"] = "data_api"
                    
                    # Map primary fields to historical for compatibility
                    item.views = int(item.extra["hist_views"])
                    item.average_view_duration_sec = item.extra["hist_avg_duration"]
                    item.retention_rate = item.extra["hist_retention"]
                    item.audience_growth = int(item.extra["hist_subs_gained"] - item.extra["hist_subs_lost"])
                    item.engagement_quality = round(((item.extra["hist_likes"] + item.extra["hist_comments"] + item.extra["hist_shares"]) / item.views * 100), 2) if item.views else 0.0
                
                snapshot.status = "ok"
            except Exception as oauth_err:
                snapshot.extra["oauth_error"] = str(oauth_err)
                snapshot.status = "ok"
        return snapshot, content

    def _fetch_meta(self, account: SocialAccountOrm) -> tuple[PlatformSnapshot, list[TopContent]]:
        connector = MetaConnector(
            user_token=self._credential(account, "META_USER_ACCESS_TOKEN")
        )
        if not connector.enabled:
            raise RuntimeError("Falta la credencial META_USER_ACCESS_TOKEN para conectar con Facebook/Instagram.")
        return connector.fetch_for_account(
            channel_id=account.channel_id,
            platform=account.platform,
            external_id=account.external_id
        )

    def _fetch_tiktok(self, account: SocialAccountOrm) -> tuple[PlatformSnapshot, list[TopContent]]:
        connector = TikTokConnector(
            api_token=self._credential(account, "APIFY_API_TOKEN"),
            profile=account.external_id or account.handle or account.url,
        )
        if not connector.enabled:
            raise RuntimeError("Faltan APIFY_API_TOKEN o perfil TikTok.")
        return connector.fetch(channel_id=account.channel_id, max_results=30)

    def _credential(self, account: SocialAccountOrm, key: str) -> str:
        if key in {"YOUTUBE_API_KEY", "APIFY_API_TOKEN"}:
            legacy = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).one_or_none()
            if legacy and legacy.credential_value:
                return legacy.credential_value
            return ""

        scoped = (
            self.session.query(IntegrationCredentialOrm)
            .filter_by(channel_id=account.channel_id, platform=account.platform, credential_key=key)
            .one_or_none()
        )
        if scoped and scoped.credential_value:
            return scoped.credential_value
        legacy = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).one_or_none()
        if legacy and legacy.credential_value:
            return legacy.credential_value
        return ""

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).date().isoformat()

    @staticmethod
    def _cutoff(days: int) -> datetime:
        return datetime.now(timezone.utc) - timedelta(days=days)

    def _store_snapshot(self, account: SocialAccountOrm, snapshot: PlatformSnapshot) -> None:
        normalized = normalize_snapshot(snapshot)
        values = {
            "exposure": snapshot.exposure,
            "views": normalized.views,
            "watch_time_hours": snapshot.watch_time_hours,
            "retention_rate": normalized.retention_rate,
            "engagement_quality": normalized.engagement_quality,
            "audience_growth": snapshot.audience_growth,
            "interactions": normalized.interactions,
            "followers_count": normalized.followers_count,
            "extra_json": json.dumps(normalized.extra, ensure_ascii=True),
        }
        same_day = (
            self.session.query(AccountMetricSnapshotOrm)
            .filter(AccountMetricSnapshotOrm.account_id == account.id)
            .filter(func.date(AccountMetricSnapshotOrm.captured_at) == self._today())
            .order_by(AccountMetricSnapshotOrm.captured_at.desc())
            .first()
        )
        if same_day is not None:
            for key, value in values.items():
                setattr(same_day, key, value)
            same_day.captured_at = datetime.now(timezone.utc)
        else:
            self.session.add(AccountMetricSnapshotOrm(account_id=account.id, **values))
        self.session.flush()
        self.session.query(AccountMetricSnapshotOrm).filter(
            AccountMetricSnapshotOrm.account_id == account.id,
            AccountMetricSnapshotOrm.captured_at < self._cutoff(ACCOUNT_SNAPSHOT_DAYS),
        ).delete(synchronize_session=False)

    def _store_content(self, account: SocialAccountOrm, item: TopContent) -> None:
        content = (
            self.session.query(ContentItemOrm)
            .filter(ContentItemOrm.platform == item.platform, ContentItemOrm.external_id == item.id)
            .one_or_none()
        )
        if content is None:
            content = ContentItemOrm(
                account_id=account.id, 
                platform=item.platform, 
                external_id=item.id, 
                title=item.title,
                url=item.url
            )
            self.session.add(content)
            self.session.flush()
        else:
            content.url = item.url
            
        content.account_id = account.id
        content.title = item.title
        content.published_at = item.published_at
        normalized = normalize_content(item)
        content.content_type = normalized.content_type
        content.raw_json = json.dumps(normalized.raw, ensure_ascii=True)

        values = {
            "exposure": item.exposure,
            "views": normalized.views,
            "average_view_duration_sec": item.average_view_duration_sec,
            "retention_rate": normalized.retention_rate,
            "engagement_quality": normalized.engagement_quality,
            "audience_growth": item.audience_growth,
            "score": content_score(normalized.views, normalized.retention_rate, normalized.engagement_quality, item.audience_growth),
            "interactions": normalized.interactions,
            "extra_json": json.dumps(normalized.extra, ensure_ascii=True),
        }
        same_day = (
            self.session.query(ContentMetricSnapshotOrm)
            .filter(ContentMetricSnapshotOrm.content_id == content.id)
            .filter(func.date(ContentMetricSnapshotOrm.captured_at) == self._today())
            .order_by(ContentMetricSnapshotOrm.captured_at.desc())
            .first()
        )
        if same_day is not None:
            for key, value in values.items():
                setattr(same_day, key, value)
            same_day.captured_at = datetime.now(timezone.utc)
        else:
            self.session.add(ContentMetricSnapshotOrm(content_id=content.id, **values))
        self.session.flush()
        self.session.query(ContentMetricSnapshotOrm).filter(
            ContentMetricSnapshotOrm.content_id == content.id,
            ContentMetricSnapshotOrm.captured_at < self._cutoff(CONTENT_SNAPSHOT_DAYS),
        ).delete(synchronize_session=False)

    def _finish(self, run: SyncRunOrm, started: float) -> SyncRunRecord:
        run.finished_at = datetime.now(timezone.utc)
        run.duration_ms = int((time.perf_counter() - started) * 1000)
        self.session.flush()
        return self._run_record(run)

    @staticmethod
    def _run_record(run: SyncRunOrm) -> SyncRunRecord:
        return SyncRunRecord(
            id=run.id,
            account_id=run.account_id,
            platform=run.platform,
            channel_id=run.channel_id,
            status=run.status,
            message=run.message,
            started_at=run.started_at.isoformat(),
            finished_at=run.finished_at.isoformat() if run.finished_at else None,
            duration_ms=run.duration_ms,
        )
