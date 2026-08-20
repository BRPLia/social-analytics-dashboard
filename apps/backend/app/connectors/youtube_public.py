from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen
import json

from app.models import PlatformSnapshot, TopContent


API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubePublicConnector:
    def __init__(self, api_key: str, channel_id: str) -> None:
        self.api_key = api_key
        self.channel_id = channel_id

    @property
    def enabled(self) -> bool:
        return bool(self.api_key and self.channel_id)

    def _get(self, path: str, params: dict[str, str | int]) -> dict[str, Any]:
        query = urlencode({**params, "key": self.api_key})
        with urlopen(f"{API_BASE}/{path}?{query}", timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch(self, channel_id: str, max_results: int = 10) -> tuple[PlatformSnapshot, list[TopContent]]:
        channel = self._get(
            "channels",
            {
                "part": "id,snippet,statistics,contentDetails",
                "id": self.channel_id,
            },
        )["items"][0]
        uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]
        playlist = self._get(
            "playlistItems",
            {
                "part": "contentDetails",
                "playlistId": uploads,
                "maxResults": max_results,
            },
        )
        video_ids = ",".join(item["contentDetails"]["videoId"] for item in playlist.get("items", []))
        videos = []
        if video_ids:
            videos = self._get(
                "videos",
                {
                    "part": "snippet,statistics,contentDetails,status",
                    "id": video_ids,
                    "maxResults": max_results,
                },
            ).get("items", [])

        total_views = int(channel.get("statistics", {}).get("viewCount", 0))
        subscriber_count = int(channel.get("statistics", {}).get("subscriberCount", 0))
        video_count = int(channel.get("statistics", {}).get("videoCount", 0))
        recent_views = sum(int(video.get("statistics", {}).get("viewCount", 0)) for video in videos)
        recent_likes = sum(int(video.get("statistics", {}).get("likeCount", 0)) for video in videos)
        recent_comments = sum(int(video.get("statistics", {}).get("commentCount", 0)) for video in videos)
        engagement_quality = round(((recent_likes + recent_comments) / recent_views) * 100, 2) if recent_views else 0

        snapshot = PlatformSnapshot(
            channel_id=channel_id,
            platform="youtube",
            exposure=None,
            views=total_views,
            watch_time_hours=None,
            retention_rate=None,
            engagement_quality=engagement_quality,
            audience_growth=None,
            extra={
                "subscriber_count": float(subscriber_count),
                "video_count": float(video_count),
                "recent_views": float(recent_views),
                "likes": float(recent_likes),
                "comments": float(recent_comments),
            },
            status="degraded",
            last_sync=datetime.now(timezone.utc).isoformat(),
        )

        content: list[TopContent] = []
        for video in videos:
            stats = video.get("statistics", {})
            views = int(stats.get("viewCount", 0))
            likes = int(stats.get("likeCount", 0))
            comments = int(stats.get("commentCount", 0))
            engagement = round(((likes + comments) / views) * 100, 2) if views else 0
            content.append(
                TopContent(
                    id=video["id"],
                    channel_id=channel_id,
                    platform="youtube",
                    title=video["snippet"]["title"],
                    published_at=video["snippet"]["publishedAt"],
                    url=f"https://www.youtube.com/watch?v={video['id']}",
                    content_type="short" if _duration_to_seconds(video["contentDetails"]["duration"]) <= 60 else "video",
                    exposure=None,
                    views=views,
                    average_view_duration_sec=None,
                    retention_rate=None,
                    engagement_quality=engagement,
                    audience_growth=None,
                    extra={
                        "likes": float(likes),
                        "comments": float(comments),
                        "duration_seconds": float(_duration_to_seconds(video["contentDetails"]["duration"])),
                        "category_id": float(video["snippet"].get("categoryId", 0)),
                    },
                )
            )
        return snapshot, content


def _duration_to_seconds(duration: str) -> int:
    # Minimal ISO-8601 parser for YouTube short durations like PT36S, PT1M05S.
    if not duration.startswith("PT"):
        return 0
    value = duration[2:]
    number = ""
    seconds = 0
    for char in value:
        if char.isdigit():
            number += char
            continue
        amount = int(number or 0)
        number = ""
        if char == "H":
            seconds += amount * 3600
        elif char == "M":
            seconds += amount * 60
        elif char == "S":
            seconds += amount
    return seconds
