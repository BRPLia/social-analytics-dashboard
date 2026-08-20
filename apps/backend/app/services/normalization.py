from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import PlatformSnapshot, TopContent


@dataclass(frozen=True)
class NormalizedSnapshot:
    views: int
    retention_rate: float | None
    interactions: int
    followers_count: int | None
    engagement_quality: float
    extra: dict[str, float | str]
    raw: dict[str, Any]


@dataclass(frozen=True)
class NormalizedContent:
    views: int
    retention_rate: float | None
    interactions: int
    engagement_quality: float
    content_type: str
    extra: dict[str, float | str]
    raw: dict[str, Any]


def normalize_snapshot(snapshot: PlatformSnapshot) -> NormalizedSnapshot:
    likes = _nonnegative(snapshot.extra.get("likes"))
    comments = _nonnegative(snapshot.extra.get("comments"))
    shares = _nonnegative(snapshot.extra.get("shares"))
    saves = _nonnegative(snapshot.extra.get("saves"))
    followers = snapshot.extra.get("followers") or snapshot.extra.get("subscriber_count") or snapshot.extra.get("follower_count")
    interactions = int(likes + comments + shares + saves)
    if snapshot.platform in ("facebook", "instagram"):
        # Use connector's pre-calculated weighted ER (handles stale reach)
        engagement = snapshot.engagement_quality
    else:
        engagement = _rate(interactions, snapshot.views)
    extra = {
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "saves": saves,
    }
    for key in [
        "recent_views",
        "analytics_views_28d",
        "public_total_views",
        "engaged_views",
        "period_days",
        "video_count",
        "average_view_duration_sec",
        "subscriber_count",
        "followers",
        "follower_count",
    ]:
        if key in snapshot.extra:
            extra[key] = _num(snapshot.extra.get(key))
    for key in ["period_start", "period_end", "views_source"]:
        if key in snapshot.extra:
            extra[key] = str(snapshot.extra.get(key))
    for key, val in snapshot.extra.items():
        if key.startswith("hist_") or key.startswith("public_total_"):
            if isinstance(val, (int, float)):
                extra[key] = _num(val)
            else:
                extra[key] = str(val)
    return NormalizedSnapshot(
        views=snapshot.views,
        retention_rate=snapshot.retention_rate,
        interactions=interactions,
        followers_count=int(followers) if followers is not None else None,
        engagement_quality=engagement,
        extra=extra,
        raw={
            "source_platform": snapshot.platform,
            "views": snapshot.views,
            "exposure": snapshot.exposure,
            "retention_rate": snapshot.retention_rate,
            "interactions": interactions,
            "followers_count": int(followers) if followers is not None else None,
            "native_keys": sorted(snapshot.extra.keys()),
        },
    )


def normalize_content(item: TopContent) -> NormalizedContent:
    likes = _nonnegative(item.extra.get("likes"))
    comments = _nonnegative(item.extra.get("comments"))
    shares = _nonnegative(item.extra.get("shares"))
    saves = _nonnegative(item.extra.get("saves"))
    interactions = int(likes + comments + shares + saves)
    if item.platform in ("facebook", "instagram"):
        # Reliability check: stale reach data inflates ER
        if item.exposure and item.exposure >= interactions:
            engagement = _rate(interactions, item.exposure)
        else:
            engagement = 0.0
    else:
        engagement = _rate(interactions, item.views)
    extra = {
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "saves": saves,
    }
    for key in [
        "duration_seconds",
        "category_id",
        "video_views",
        "complete_views",
        "view_time_ms",
        "reach",
        "impressions",
        "engaged_views",
        "watch_time_hours",
        "average_view_duration_sec",
        "subscribers_gained",
        "subscribers_lost",
        "net_subscribers",
        "period_days",
        "public_total_views",
    ]:
        if key in item.extra:
            extra[key] = _num(item.extra.get(key))
    for key in ["period_start", "period_end", "views_source"]:
        if key in item.extra:
            extra[key] = str(item.extra.get(key))
    for key, val in item.extra.items():
        if key.startswith("hist_") or key.startswith("public_total_"):
            if isinstance(val, (int, float)):
                extra[key] = _num(val)
            else:
                extra[key] = str(val)
    return NormalizedContent(
        views=item.views,
        retention_rate=item.retention_rate,
        interactions=interactions,
        engagement_quality=engagement,
        content_type=item.content_type,
        extra=extra,
        raw={
            "source_platform": item.platform,
            "external_id": item.id,
            "content_type": item.content_type,
            "views": item.views,
            "exposure": item.exposure,
            "retention_rate": item.retention_rate,
            "interactions": interactions,
            "native_keys": sorted(item.extra.keys()),
        },
    )


def _num(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _nonnegative(value: object) -> float:
    return max(_num(value), 0.0)


def _rate(numerator: float, denominator: float | int | None) -> float:
    if not denominator:
        return 0.0
    return round((numerator / float(denominator)) * 100, 2)
