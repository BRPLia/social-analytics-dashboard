from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json


class YouTubeAnalyticsConnector:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret and self.refresh_token)

    def _access_token(self) -> str:
        body = urlencode(
            {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }
        ).encode("utf-8")
        request = Request(
            "https://oauth2.googleapis.com/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))["access_token"]

    def _period(self, days: int) -> tuple[date, date]:
        end = date.today() - timedelta(days=1)
        start = end - timedelta(days=days - 1)
        return start, end

    def days_since_origin(self) -> int:
        origin = date(2015, 1, 1)
        yesterday = date.today() - timedelta(days=1)
        delta = yesterday - origin
        return max(1, delta.days)

    def _query(self, params: dict[str, str | int]) -> dict[str, Any]:
        request = Request(
            f"https://youtubeanalytics.googleapis.com/v2/reports?{urlencode(params)}",
            headers={"Authorization": f"Bearer {self._access_token()}"},
        )
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def report_by_day(self, days: int = 28) -> dict[str, Any]:
        start, end = self._period(days)
        base_params = {
            "ids": "channel==MINE",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": "day",
            "sort": "day",
        }
        metrics_with_engaged = "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        metrics_without_engaged = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        try:
            report = self._query({**base_params, "metrics": metrics_with_engaged})
            report["_has_engaged"] = True
        except HTTPError:
            report = self._query({**base_params, "metrics": metrics_without_engaged})
            report["_has_engaged"] = False
        return report

    def report_by_video(self, days: int = 28, max_results: int = 50) -> dict[str, dict[str, float | str]]:
        start, end = self._period(days)
        base_params: dict[str, str | int] = {
            "ids": "channel==MINE",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": "video",
            "sort": "-views",
            "maxResults": max_results,
        }
        metrics_with_engaged = "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        metrics_without_engaged = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        try:
            report = self._query({**base_params, "metrics": metrics_with_engaged})
            has_engaged = True
        except HTTPError:
            report = self._query({**base_params, "metrics": metrics_without_engaged})
            has_engaged = False

        result: dict[str, dict[str, float | str]] = {}
        for row in report.get("rows", []):
            video_id = str(row[0])
            offset = 1
            views = float(row[offset] or 0)
            offset += 1
            engaged_views = float(row[offset] or 0) if has_engaged else None
            if has_engaged:
                offset += 1
            estimated_minutes = float(row[offset] or 0)
            average_duration = float(row[offset + 1] or 0)
            average_percentage = float(row[offset + 2] or 0)
            likes = float(row[offset + 3] or 0)
            comments = float(row[offset + 4] or 0)
            shares = float(row[offset + 5] or 0)
            subscribers_gained = float(row[offset + 6] or 0)
            subscribers_lost = float(row[offset + 7] or 0)
            values: dict[str, float | str] = {
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "period_days": float(days),
                "analytics_views": views,
                "estimated_minutes_watched": estimated_minutes,
                "watch_time_hours": round(estimated_minutes / 60, 2),
                "average_view_duration_sec": round(average_duration, 1),
                "average_view_percentage": round(average_percentage, 2),
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "subscribers_gained": subscribers_gained,
                "subscribers_lost": subscribers_lost,
                "net_subscribers": subscribers_gained - subscribers_lost,
            }
            if engaged_views is not None:
                values["engaged_views"] = engaged_views
            result[video_id] = values
        return result

    def report_for_single_video(self, video_id: str, days: int = 28) -> dict[str, float | str] | None:
        start, end = self._period(days)
        base_params: dict[str, str | int] = {
            "ids": "channel==MINE",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": "video",
            "filters": f"video=={video_id}",
        }
        metrics_with_engaged = "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        metrics_without_engaged = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
        try:
            report = self._query({**base_params, "metrics": metrics_with_engaged})
            has_engaged = True
        except HTTPError:
            try:
                report = self._query({**base_params, "metrics": metrics_without_engaged})
                has_engaged = False
            except HTTPError:
                return None

        rows = report.get("rows", [])
        if not rows:
            return None

        row = rows[0]
        offset = 1
        views = float(row[offset] or 0)
        offset += 1
        engaged_views = float(row[offset] or 0) if has_engaged else None
        if has_engaged:
            offset += 1
        estimated_minutes = float(row[offset] or 0)
        average_duration = float(row[offset + 1] or 0)
        average_percentage = float(row[offset + 2] or 0)
        likes = float(row[offset + 3] or 0)
        comments = float(row[offset + 4] or 0)
        shares = float(row[offset + 5] or 0)
        subscribers_gained = float(row[offset + 6] or 0)
        subscribers_lost = float(row[offset + 7] or 0)
        values: dict[str, float | str] = {
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "period_days": float(days),
            "analytics_views": views,
            "estimated_minutes_watched": estimated_minutes,
            "watch_time_hours": round(estimated_minutes / 60, 2),
            "average_view_duration_sec": round(average_duration, 1),
            "average_view_percentage": round(average_percentage, 2),
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "subscribers_gained": subscribers_gained,
            "subscribers_lost": subscribers_lost,
            "net_subscribers": subscribers_gained - subscribers_lost,
        }
        if engaged_views is not None:
            values["engaged_views"] = engaged_views
        return values

    def summarize(self, days: int = 28) -> dict[str, float]:
        start, end = self._period(days)
        report = self.report_by_day(days=days)
        rows = report.get("rows", [])
        totals = {
            "analytics_views": 0.0,
            "estimated_minutes_watched": 0.0,
            "average_view_duration": 0.0,
            "average_view_percentage": 0.0,
            "analytics_likes": 0.0,
            "analytics_comments": 0.0,
            "shares": 0.0,
            "subscribers_gained": 0.0,
            "subscribers_lost": 0.0,
        }
        weighted_duration = 0.0
        weighted_percentage = 0.0
        total_views = 0.0
        has_engaged = bool(report.get("_has_engaged"))
        if has_engaged:
            totals["engaged_views"] = 0.0
        for row in rows:
            offset = 1
            views = float(row[offset] or 0)
            offset += 1
            if has_engaged:
                totals["engaged_views"] += float(row[offset] or 0)
                offset += 1
            totals["analytics_views"] += views
            totals["estimated_minutes_watched"] += float(row[offset] or 0)
            weighted_duration += views * float(row[offset + 1] or 0)
            weighted_percentage += views * float(row[offset + 2] or 0)
            totals["analytics_likes"] += float(row[offset + 3] or 0)
            totals["analytics_comments"] += float(row[offset + 4] or 0)
            totals["shares"] += float(row[offset + 5] or 0)
            totals["subscribers_gained"] += float(row[offset + 6] or 0)
            totals["subscribers_lost"] += float(row[offset + 7] or 0)
            total_views += views
        if total_views:
            totals["average_view_duration"] = round(weighted_duration / total_views, 1)
            totals["average_view_percentage"] = round(weighted_percentage / total_views, 2)
        totals["watch_time_hours"] = round(totals["estimated_minutes_watched"] / 60, 1)
        totals["net_subscribers"] = totals["subscribers_gained"] - totals["subscribers_lost"]
        active = [row[0] for row in rows if float(row[1] or 0) > 0]
        totals["period_start"] = active[0] if active else start.isoformat()
        totals["period_end"] = active[-1] if active else end.isoformat()
        totals["period_days"] = float(days)
        return totals
