from typing import Literal

from pydantic import BaseModel, Field


PlatformId = Literal["youtube", "facebook", "instagram", "tiktok", "linkedin"]
HealthState = Literal["ok", "degraded", "pending"]
ExtraValue = float | str | dict[str, float | str]


class Channel(BaseModel):
    id: str
    name: str
    color: str
    platforms: list[PlatformId]


class SocialAccount(BaseModel):
    id: int
    channel_id: str
    platform: PlatformId
    external_id: str
    name: str
    handle: str = ""
    url: str = ""
    enabled: bool
    status: HealthState
    last_sync_at: str | None = None


class KpiSummary(BaseModel):
    exposure: int = 0
    exposure_delta: int = 0
    views: int = 0
    views_delta: int = 0
    watch_time_hours: float = 0.0
    watch_time_delta: float = 0.0
    retention_rate: float = 0.0
    retention_delta: float = 0.0
    engagement_quality: float = 0.0
    engagement_delta: float = 0.0
    audience_growth: int = 0
    audience_growth_delta: int = 0
    interactions: int = 0
    interactions_delta: int = 0
    followers_count: int = 0
    followers_delta: int = 0
    post_count: int = 0
    post_count_delta: int = 0


class PlatformSnapshot(BaseModel):
    channel_id: str
    platform: PlatformId
    exposure: int | None = None
    views: int = 0
    views_delta: int = 0
    watch_time_hours: float | None = None
    retention_rate: float | None = None
    retention_delta: float = 0.0
    engagement_quality: float = 0.0
    audience_growth: int | None = None
    audience_growth_delta: int = 0
    interactions: int = 0
    interactions_delta: int = 0
    followers_count: int | None = None
    followers_delta: int = 0
    post_count: int = 0
    post_count_delta: int = 0
    extra: dict[str, ExtraValue] = Field(default_factory=dict)
    status: HealthState
    last_sync: str
    period_start: str | None = None
    period_end: str | None = None


class TimePoint(BaseModel):
    date: str
    exposure: int
    views: int
    retention_rate: float


class TopContent(BaseModel):
    id: str
    channel_id: str
    platform: PlatformId
    title: str
    published_at: str
    url: str = ""
    content_type: str = "unknown"
    exposure: int | None = None
    views: int
    average_view_duration_sec: float | None = None
    retention_rate: float | None = None
    engagement_quality: float
    audience_growth: int | None = None
    score: float = 0
    extra: dict[str, ExtraValue] = Field(default_factory=dict)
    diagnosis: str | None = None


class MetricFocus(BaseModel):
    id: str
    label: str
    category: str
    priority: int
    why: str
    platforms: list[PlatformId]
    api_status: str


class PlatformMetricDefinition(BaseModel):
    label: str
    source_field: str
    format: str
    why: str
    availability: str = "mock"


class PlatformMetricProfile(BaseModel):
    label: str
    priority: list[str]
    metrics: dict[str, PlatformMetricDefinition]


class ConnectorStatus(BaseModel):
    platform: PlatformId
    state: HealthState
    mode: str
    message: str


class SyncRunRecord(BaseModel):
    id: int
    account_id: int | None = None
    platform: str
    channel_id: str
    status: str
    message: str
    started_at: str
    finished_at: str | None = None
    duration_ms: int | None = None


class SyncSummary(BaseModel):
    status: str
    runs: list[SyncRunRecord]


class ResetDataSummary(BaseModel):
    status: str
    content_metric_snapshots: int = 0
    account_metric_snapshots: int = 0
    content_items: int = 0
    sync_runs: int = 0
    accounts_reset: int = 0


class DashboardPayload(BaseModel):
    generated_at: str
    source: str
    channels: list[Channel]
    accounts: list[SocialAccount]
    summary: KpiSummary
    platforms: list[PlatformSnapshot]
    series: dict[str, list[TimePoint]]
    top_content: list[TopContent]
    connector_status: list[ConnectorStatus]
    metric_focus: list[MetricFocus]
    platform_profiles: dict[PlatformId, PlatformMetricProfile]
    period_start: str | None = None
    period_end: str | None = None


# Modelos Pydantic para el panel de configuración (Onboarding)
class ChannelCreate(BaseModel):
    id: str
    name: str
    color: str = "#84CC16"


class ChannelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class AccountCreate(BaseModel):
    channel_id: str
    platform: str
    external_id: str
    name: str
    handle: str = ""
    url: str = ""


class AccountUpdate(BaseModel):
    enabled: bool | None = None
    external_id: str | None = None
    name: str | None = None
    handle: str | None = None
    url: str | None = None


class CredentialSet(BaseModel):
    credential_value: str
    platform: str
    label: str = ""


class CredentialResponse(BaseModel):
    id: int
    credential_key: str
    credential_value: str
    platform: str
    label: str
    status: str
    last_validated_at: str | None = None
    created_at: str


class IntegrationCredentialSet(BaseModel):
    credential_value: str
    label: str = ""


class IntegrationCredentialResponse(BaseModel):
    id: int | None = None
    channel_id: str
    platform: str
    credential_key: str
    credential_value: str
    label: str
    status: str
    last_validated_at: str | None = None
    created_at: str | None = None


class ValidationResponse(BaseModel):
    status: str
    credential_key: str
    error: str | None = None
    last_validated_at: str | None = None
