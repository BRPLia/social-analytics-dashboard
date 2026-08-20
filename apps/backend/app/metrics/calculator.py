from __future__ import annotations


def percent(numerator: float | int | None, denominator: float | int | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return round((float(numerator) / float(denominator)) * 100, 2)


def engagement_rate(likes: float, comments: float, shares: float, saves: float, views: float) -> float:
    return percent(likes + comments + shares + saves, views) or 0


def share_rate(shares: float, views: float) -> float | None:
    return percent(shares, views)


def save_rate(saves: float, views: float) -> float | None:
    return percent(saves, views)


def comment_rate(comments: float, views: float) -> float | None:
    return percent(comments, views)


def completion_rate(complete_views: float, views: float) -> float | None:
    return percent(complete_views, views)


def watch_time_hours(milliseconds: float | None = None, minutes: float | None = None) -> float | None:
    if milliseconds is not None:
        return round(milliseconds / 1000 / 3600, 2)
    if minutes is not None:
        return round(minutes / 60, 2)
    return None


def growth_per_1k_views(growth: float | None, views: float | None) -> float | None:
    if growth is None or not views:
        return None
    return round((growth / views) * 1000, 2)


def content_score(
    views: float,
    retention_rate: float | None,
    engagement_quality: float,
    audience_growth: float | None,
) -> float:
    retention_component = retention_rate or 0
    growth_component = growth_per_1k_views(audience_growth, views) or 0
    return round((views * 0.001) + (retention_component * 1.5) + (engagement_quality * 8) + (growth_component * 12), 2)
