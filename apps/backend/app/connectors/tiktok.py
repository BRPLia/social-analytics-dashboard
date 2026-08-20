from __future__ import annotations

from datetime import datetime, timezone
import json
import urllib.parse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.models import PlatformSnapshot, TopContent


APIFY_TIKTOK_PROFILE_ACTOR = "clockworks~tiktok-profile-scraper"
APIFY_TIKTOK_ENDPOINT = f"https://api.apify.com/v2/acts/{APIFY_TIKTOK_PROFILE_ACTOR}/run-sync-get-dataset-items"
DEFAULT_LIMIT = 30


class TikTokConnector:
    platform = "tiktok"

    def __init__(self, api_token: str, profile: str) -> None:
        self.api_token = api_token.strip()
        self.profile = normalize_tiktok_profile(profile)
        self.enabled = bool(self.api_token and self.profile)

    def fetch(self, channel_id: str, max_results: int = DEFAULT_LIMIT) -> tuple[PlatformSnapshot, list[TopContent]]:
        if not self.enabled:
            raise RuntimeError("Faltan APIFY_API_TOKEN o perfil TikTok.")

        payload = {
            "profiles": [self.profile],
            "profileScrapeSections": ["videos"],
            "profileSorting": "latest",
            "resultsPerPage": max(1, min(max_results, DEFAULT_LIMIT)),
            "excludePinnedPosts": False,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
            "downloadSubtitlesOptions": "NEVER_DOWNLOAD_SUBTITLES",
            "shouldDownloadSlideshowImages": False,
            "shouldDownloadAvatars": False,
        }
        query = urllib.parse.urlencode({"token": self.api_token})
        req = Request(
            f"{APIFY_TIKTOK_ENDPOINT}?{query}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Dashboard-Redes",
            },
            method="POST",
        )

        try:
            with urlopen(req, timeout=180) as response:
                raw_items = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Apify TikTok HTTP {exc.code}: {exc.reason}. {body[:240]}") from exc

        if not isinstance(raw_items, list):
            raise RuntimeError("Apify TikTok devolvio un formato inesperado.")

        content = [self._content_from_item(channel_id, item) for item in raw_items if isinstance(item, dict)]
        content = [item for item in content if item is not None]

        first_author = next((item.get("authorMeta", {}) for item in raw_items if isinstance(item, dict)), {})
        followers = _int(first_author.get("fans"))
        total_likes = _int(first_author.get("heart"))
        profile_video_count = _int(first_author.get("video"))
        views = sum(item.views for item in content)
        likes = sum(_int(item.extra.get("likes")) for item in content)
        comments = sum(_int(item.extra.get("comments")) for item in content)
        shares = sum(_int(item.extra.get("shares")) for item in content)
        saves = sum(_int(item.extra.get("saves")) for item in content)
        interactions = likes + comments + shares + saves
        now = datetime.now(timezone.utc).isoformat()

        snapshot = PlatformSnapshot(
            channel_id=channel_id,
            platform="tiktok",
            exposure=None,
            views=views,
            watch_time_hours=None,
            retention_rate=None,
            retention_delta=0.0,
            engagement_quality=_rate(interactions, views),
            audience_growth=None,
            interactions=interactions,
            followers_count=followers if followers else None,
            post_count=len(content) or profile_video_count,
            extra={
                "likes": float(likes),
                "comments": float(comments),
                "shares": float(shares),
                "saves": float(saves),
                "followers": float(followers),
                "profile_total_likes": float(total_likes),
                "profile_video_count": float(profile_video_count),
                "views_source": "apify_public_profile_scraper",
            },
            status="ok",
            last_sync=now,
        )
        return snapshot, content

    def _content_from_item(self, channel_id: str, item: dict) -> TopContent | None:
        video_id = str(item.get("id") or "").strip()
        if not video_id:
            return None

        views = _int(item.get("playCount"))
        likes = _int(item.get("diggCount"))
        comments = _int(item.get("commentCount"))
        shares = _int(item.get("shareCount"))
        saves = _int(item.get("collectCount"))
        interactions = likes + comments + shares + saves
        video_meta = item.get("videoMeta") if isinstance(item.get("videoMeta"), dict) else {}
        published_at = str(item.get("createTimeISO") or "")
        if not published_at and item.get("createTime"):
            try:
                published_at = datetime.fromtimestamp(int(item["createTime"]), tz=timezone.utc).isoformat()
            except (TypeError, ValueError, OSError):
                published_at = ""

        return TopContent(
            id=video_id,
            channel_id=channel_id,
            platform="tiktok",
            title=str(item.get("text") or "Video TikTok").strip()[:240],
            published_at=published_at,
            url=str(item.get("webVideoUrl") or ""),
            content_type="video",
            exposure=None,
            views=views,
            average_view_duration_sec=None,
            retention_rate=None,
            engagement_quality=_rate(interactions, views),
            audience_growth=None,
            extra={
                "likes": float(likes),
                "comments": float(comments),
                "shares": float(shares),
                "saves": float(saves),
                "duration_seconds": float(_int(video_meta.get("duration"))),
                "views_source": "apify_public_profile_scraper",
                "is_pinned": str(bool(item.get("isPinned"))),
            },
        )


def normalize_tiktok_profile(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if "tiktok.com" in value:
        parsed = urllib.parse.urlparse(value if "://" in value else f"https://{value}")
        parts = [part for part in parsed.path.split("/") if part]
        handle = next((part for part in parts if part.startswith("@")), parts[0] if parts else "")
        return handle.lstrip("@")
    return value.lstrip("@")


def _int(value: object) -> int:
    try:
        return max(int(float(value or 0)), 0)
    except (TypeError, ValueError):
        return 0


def _rate(numerator: int, denominator: int) -> float:
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, 2)
