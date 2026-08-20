"""
REGLA ARQUITECTÓNICA — AISLAMIENTO POR PLATAFORMA (Backend)

Cada plataforma (Facebook, Instagram) tiene su propio método aislado:
  - _facebook_account()  → Lógica, métricas y fórmulas exclusivas de Facebook
  - _instagram_account() → Lógica, métricas y fórmulas exclusivas de Instagram

Un cambio en la fórmula de engagement de Instagram NO DEBE afectar Facebook.
Si se modifica el cálculo de retención en Facebook NO DEBE tocar Instagram.

Engagement Rate:
  - Facebook: (reactions + comments + shares) / reach × 100  [datos lifetime]
  - Instagram: weighted ER solo con posts de reach confiable  [reach stale para posts antiguos]

Normalización (normalization.py):
  - Content: reliability check (exposure >= interactions) para fb/ig
  - Snapshot: pass-through del ER precalculado del conector para fb/ig
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import urllib.parse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.models import PlatformSnapshot, TopContent


GRAPH = "https://graph.facebook.com/v25.0"


class MetaConnector:
    """Conector local: usa user token largo y deriva Page tokens via /me/accounts."""

    def __init__(self, user_token: str) -> None:
        self.user_token = user_token

    @property
    def enabled(self) -> bool:
        return bool(self.user_token)

    def fetch_for_account(
        self,
        channel_id: str,
        platform: str,
        external_id: str,
    ) -> tuple[PlatformSnapshot, list[TopContent]]:
        pages = self._pages()
        
        if platform == "facebook":
            page_data = pages.get(external_id)
            if not page_data:
                raise RuntimeError(
                    f"No se encontró la página de Facebook con ID {external_id} "
                    f"en tu cuenta de Meta. Asegúrate de que el token sea correcto "
                    f"y que tenga permisos para administrar la página."
                )
            token = page_data.get("access_token")
            if not token:
                raise RuntimeError(f"No se obtuvo access_token para la página de Facebook {external_id}.")
            return self._facebook_page(channel_id, external_id, str(token))
            
        elif platform == "instagram":
            token = None
            for p_data in pages.values():
                ig_acc = p_data.get("instagram_business_account")
                if ig_acc and str(ig_acc.get("id")) == external_id:
                    token = p_data.get("access_token")
                    break
            if not token:
                raise RuntimeError(
                    f"No se encontró la cuenta de Instagram con ID {external_id} "
                    f"vinculada a tus páginas de Facebook administradas."
                )
            return self._instagram_account(channel_id, external_id, str(token))
            
        else:
            raise ValueError(f"Plataforma no soportada por MetaConnector: {platform}")

    def _pages(self) -> dict[str, dict[str, object]]:
        data = self._get(
            "me/accounts",
            self.user_token,
            {"fields": "id,name,access_token,instagram_business_account"},
        ).get("data", [])
        return {str(page["id"]): page for page in data if "id" in page}

    def _facebook_page(
        self,
        channel_id: str,
        page_id: str,
        token: str,
    ) -> tuple[PlatformSnapshot, list[TopContent]]:
        now = datetime.now(timezone.utc).isoformat()
        page = self._get(page_id, token, {"fields": "fan_count,followers_count"})
        followers = int(page.get("followers_count") or page.get("fan_count") or 0)
        posts_data = []
        next_cursor = None
        while len(posts_data) < 50:
            limit_needed = 50 - len(posts_data)
            params = {
                "fields": "id,message,created_time,permalink_url,shares,comments.summary(true),reactions.summary(true)",
                "limit": str(limit_needed),
            }
            if next_cursor:
                params["after"] = next_cursor
            try:
                res = self._get(f"{page_id}/posts", token, params)
            except Exception:
                break
            page_posts = res.get("data", [])
            if not page_posts:
                break
            posts_data.extend(page_posts)
            paging = res.get("paging", {})
            next_cursor = paging.get("cursors", {}).get("after") if "cursors" in paging else None
            if not next_cursor:
                break
        posts = posts_data[:50]

        top_content: list[TopContent] = []
        reactions_total = 0
        comments_total = 0
        shares_total = 0
        views_total = 0
        reach_total = 0
        view_time_ms_total = 0
        complete_views_total = 0

        for post in posts:
            post_id = str(post.get("id"))
            insights = self._facebook_post_insights(post_id, token)
            reactions = self._summary_count(post, "reactions")
            comments = self._summary_count(post, "comments")
            shares = int((post.get("shares") or {}).get("count") or 0)
            views = int(insights.get("post_media_view") or insights.get("post_video_views") or 0)
            reach = int(insights.get("post_impressions_unique") or insights.get("post_video_views_unique") or 0)
            views = views or reach
            avg_watch_ms = int(insights.get("post_video_avg_time_watched") or 0)
            complete_views = int(insights.get("post_video_complete_views_organic") or 0)
            view_time_ms = int(insights.get("post_video_view_time") or 0)
            content_type = "video" if int(insights.get("post_video_views") or 0) or view_time_ms else "post"
            interactions = reactions + comments + shares
            reactions_total += reactions
            comments_total += comments
            shares_total += shares
            views_total += views
            reach_total += reach
            view_time_ms_total += view_time_ms
            complete_views_total += complete_views
            top_content.append(
                TopContent(
                    id=post_id,
                    channel_id=channel_id,
                    platform="facebook",
                    title=self._title(post.get("message") or "Publicacion sin texto"),
                    published_at=str(post.get("created_time") or "")[:10],
                    url=post.get("permalink_url") or "",
                    content_type=content_type,
                    exposure=reach or None,
                    views=views,
                    average_view_duration_sec=round(avg_watch_ms / 1000, 1) if avg_watch_ms else None,
                    retention_rate=round((complete_views / max(views, 1)) * 100, 1) if complete_views else None,
                    engagement_quality=round((interactions / max(views, 1)) * 100, 2) if views else 0,
                    audience_growth=None,
                    extra={
                        "likes": float(reactions),
                        "comments": float(comments),
                        "shares": float(shares),
                        "video_views": float(insights.get("post_video_views") or 0),
                        "complete_views": float(complete_views),
                        "view_time_ms": float(view_time_ms),
                        "reach": float(reach),
                    },
                )
            )

        engagement = reactions_total + comments_total + shares_total
        snapshot = PlatformSnapshot(
            channel_id=channel_id,
            platform="facebook",
            exposure=reach_total or None,
            views=views_total,
            watch_time_hours=round(view_time_ms_total / 1000 / 3600, 2) if view_time_ms_total else None,
            retention_rate=round((complete_views_total / max(views_total, 1)) * 100, 1) if complete_views_total else None,
            engagement_quality=round((engagement / max(reach_total, 1)) * 100, 2) if reach_total else 0,
            audience_growth=None,
            extra={
                "likes": float(reactions_total),
                "comments": float(comments_total),
                "shares": float(shares_total),
                "followers": float(followers),
                "complete_views": float(complete_views_total),
            },
            status="ok",
            last_sync=now,
        )
        return snapshot, top_content

    def _facebook_post_insights(self, post_id: str, token: str) -> dict[str, object]:
        metrics = [
            "post_media_view",
            "post_impressions_unique",
            "post_clicks",
            "post_reactions_by_type_total",
            "post_activity_by_action_type",
            "post_video_views",
            "post_video_views_unique",
            "post_video_avg_time_watched",
            "post_video_complete_views_organic",
            "post_video_view_time",
        ]
        combined = ",".join(metrics)
        try:
            data = self._get(
                f"{post_id}/insights",
                token,
                {"metric": combined, "period": "lifetime"},
            ).get("data", [])
            return {
                item["name"]: (item.get("values") or [{}])[0].get("value") or 0
                for item in data
                if "name" in item
            }
        except Exception:
            pass

        result: dict[str, object] = {}
        for metric in metrics:
            try:
                data = self._get(
                    f"{post_id}/insights",
                    token,
                    {"metric": metric, "period": "lifetime"},
                ).get("data", [])
            except Exception:
                continue
            if not data:
                continue
            values = data[0].get("values") or [{}]
            result[metric] = values[0].get("value") or 0
        return result

    def _instagram_account(
        self,
        channel_id: str,
        ig_id: str,
        token: str,
    ) -> tuple[PlatformSnapshot, list[TopContent]]:
        now = datetime.now(timezone.utc).isoformat()
        
        # Obtener seguidores reales de la cuenta de Instagram
        try:
            ig_user = self._get(ig_id, token, {"fields": "followers_count"})
            followers = int(ig_user.get("followers_count") or 0)
        except Exception:
            followers = 0

        account_metrics = self._get(
            f"{ig_id}/insights",
            token,
            {
                "metric": "views,reach,total_interactions",
                "metric_type": "total_value",
                "period": "day",
            },
        ).get("data", [])
        account = {
            item["name"]: int((item.get("total_value") or {}).get("value") or 0)
            for item in account_metrics
            if "name" in item
        }
        media = self._get(
            f"{ig_id}/media",
            token,
            {
                "fields": "id,caption,media_type,permalink,timestamp,like_count,comments_count",
                "limit": "50",
            },
        ).get("data", [])

        top_content: list[TopContent] = []
        saves_total = 0
        shares_total = 0
        likes_total = 0
        comments_total = 0

        for item in media:
            insights = self._media_insights(str(item["id"]), token)
            reach = int(insights.get("reach") or 0)
            impressions = int(insights.get("impressions") or 0)
            views = int(insights.get("views") or impressions or reach or 0)
            likes = int(insights.get("likes") or item.get("like_count") or 0)
            comments = int(insights.get("comments") or item.get("comments_count") or 0)
            shares = int(insights.get("shares") or 0)
            saves = int(insights.get("saved") or 0)
            interactions = int(insights.get("total_interactions") or likes + comments + shares + saves)
            # Ponderación algorítmica para Instagram: priorizar señales de alto valor
            weighted_interactions = (likes * 1) + (comments * 5) + (shares * 8) + (saves * 10)
            saves_total += saves
            shares_total += shares
            likes_total += likes
            comments_total += comments
            top_content.append(
                TopContent(
                    id=str(item.get("id")),
                    channel_id=channel_id,
                    platform="instagram",
                    title=self._title(item.get("caption") or f"{item.get('media_type', 'Media')} sin texto"),
                    published_at=str(item.get("timestamp") or "")[:10],
                    url=item.get("permalink") or "",
                    content_type=self._instagram_type(str(item.get("media_type") or "")),
                    exposure=reach or None,
                    views=views,
                    average_view_duration_sec=None,
                    retention_rate=None,
                    engagement_quality=round((weighted_interactions / reach) * 100, 2) if reach and reach >= interactions else 0.0,
                    audience_growth=None,
                    extra={
                        "likes": float(likes),
                        "comments": float(comments),
                        "shares": float(shares),
                        "saves": float(saves),
                        "reach": float(reach),
                        "impressions": float(impressions),
                    },
                )
            )

        views = sum(item.views for item in top_content)
        interactions = likes_total + comments_total + shares_total + saves_total
        reach_total = sum(item.exposure for item in top_content if item.exposure)
        # ER global ponderado: solo posts con reach confiable (reach >= interactions)
        reliable = [p for p in top_content if p.engagement_quality > 0 and p.exposure]
        if reliable:
            r_reach = sum(p.exposure for p in reliable)
            r_inter_weighted = sum(
                (int(p.extra.get("likes", 0)) * 1) + 
                (int(p.extra.get("comments", 0)) * 5) +
                (int(p.extra.get("shares", 0)) * 8) + 
                (int(p.extra.get("saves", 0)) * 10)
                for p in reliable
            )
            engagement_quality_global = round((r_inter_weighted / r_reach) * 100, 2) if r_reach else 0.0
        else:
            engagement_quality_global = 0.0

        snapshot = PlatformSnapshot(
            channel_id=channel_id,
            platform="instagram",
            exposure=reach_total or None,
            views=views,
            watch_time_hours=None,
            retention_rate=None,
            engagement_quality=engagement_quality_global,
            audience_growth=None,
            extra={
                "likes": float(likes_total),
                "comments": float(comments_total),
                "shares": float(shares_total),
                "saves": float(saves_total),
                "followers": float(followers),
            },
            status="ok",
            last_sync=now,
        )
        return snapshot, top_content

    def _media_insights(self, media_id: str, token: str) -> dict[str, int]:
        metric_sets = [
            "views,reach,likes,comments,shares,saved,total_interactions",
            "views,impressions,reach,likes,comments,shares,saved,total_interactions",
            "reach,likes,comments,shares,saved,total_interactions",
            "impressions,reach,engagement,saved",
        ]
        for metrics in metric_sets:
            try:
                data = self._get(f"{media_id}/insights", token, {"metric": metrics}).get("data", [])
            except Exception:
                continue
            return {
                item["name"]: int((item.get("values") or [{}])[0].get("value") or 0)
                for item in data
                if "name" in item
            }
        return {}

    def _get(self, path: str, token: str, params: dict[str, str] | None = None) -> dict[str, object]:
        query = {"access_token": token}
        if params:
            query.update(params)
        url = f"{GRAPH}/{path}?{urllib.parse.urlencode(query)}"
        try:
            with urlopen(Request(url), timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                message = json.loads(body).get("error", {}).get("message", "Meta Graph API error")
            except json.JSONDecodeError:
                message = "Meta Graph API error"
            raise RuntimeError(f"Meta Graph API {exc.code}: {message}") from exc

    @staticmethod
    def _summary_count(post: dict[str, object], key: str) -> int:
        return int(((post.get(key) or {}).get("summary") or {}).get("total_count") or 0)

    @staticmethod
    def _title(text: str, limit: int = 92) -> str:
        clean = " ".join(text.split())
        if len(clean) <= limit:
            return clean
        return f"{clean[: limit - 1]}..."

    @staticmethod
    def _instagram_type(media_type: str) -> str:
        value = media_type.upper()
        if value == "VIDEO":
            return "reel"
        if value == "CAROUSEL_ALBUM":
            return "carousel"
        if value == "IMAGE":
            return "image"
        return "unknown"
