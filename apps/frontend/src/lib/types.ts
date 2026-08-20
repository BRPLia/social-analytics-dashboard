export type PlatformId = "youtube" | "facebook" | "instagram" | "tiktok" | "linkedin";
export type HealthState = "ok" | "degraded" | "pending";
export type ExtraValue = number | string | Record<string, number | string>;

export interface Channel {
  id: string;
  name: string;
  color: string;
  platforms: PlatformId[];
}

export interface SocialAccount {
  id: number;
  channel_id: string;
  platform: PlatformId;
  external_id: string;
  name: string;
  handle: string;
  url: string;
  enabled: boolean;
  status: HealthState;
  last_sync_at: string | null;
}

export interface KpiSummary {
  exposure: number;
  exposure_delta: number;
  views: number;
  views_delta: number;
  watch_time_hours: number;
  watch_time_delta: number;
  retention_rate: number;
  retention_delta: number;
  engagement_quality: number;
  engagement_delta: number;
  audience_growth: number;
  audience_growth_delta: number;
  interactions: number;
  interactions_delta: number;
  followers_count: number;
  followers_delta: number;
  post_count: number;
  post_count_delta: number;
}

export interface PlatformSnapshot {
  channel_id: string;
  platform: PlatformId;
  exposure: number | null;
  views: number;
  views_delta: number;
  watch_time_hours: number | null;
  retention_rate: number | null;
  retention_delta: number;
  engagement_quality: number;
  audience_growth: number | null;
  audience_growth_delta: number;
  interactions: number;
  interactions_delta: number;
  followers_count: number | null;
  followers_delta: number;
  post_count: number;
  post_count_delta: number;
  extra: Record<string, ExtraValue>;
  status: HealthState;
  last_sync: string;
  period_start: string | null;
  period_end: string | null;
}

export interface TimePoint {
  date: string;
  exposure: number;
  views: number;
  retention_rate: number;
}

export interface TopContent {
  id: string;
  channel_id: string;
  platform: PlatformId;
  title: string;
  published_at: string;
  url: string;
  content_type: string;
  exposure: number | null;
  views: number;
  average_view_duration_sec: number | null;
  retention_rate: number | null;
  engagement_quality: number;
  audience_growth: number | null;
  score: number;
  extra: Record<string, ExtraValue>;
  diagnosis?: string;
}

export interface MetricFocus {
  id: string;
  label: string;
  category: string;
  priority: number;
  why: string;
  platforms: PlatformId[];
  api_status: string;
}

export interface PlatformMetricDefinition {
  label: string;
  source_field: string;
  format: "compact" | "compact_signed" | "percent" | "seconds";
  why: string;
  availability: "public" | "private" | "mock";
}

export interface PlatformMetricProfile {
  label: string;
  priority: string[];
  metrics: Record<string, PlatformMetricDefinition>;
}

export interface ConnectorStatus {
  platform: PlatformId;
  state: HealthState;
  mode: string;
  message: string;
}

export interface DashboardPayload {
  generated_at: string;
  source: string;
  channels: Channel[];
  accounts: SocialAccount[];
  summary: KpiSummary;
  platforms: PlatformSnapshot[];
  series: Record<string, TimePoint[]>;
  top_content: TopContent[];
  connector_status: ConnectorStatus[];
  metric_focus: MetricFocus[];
  platform_profiles: Record<PlatformId, PlatformMetricProfile>;
  period_start: string | null;
  period_end: string | null;
}

export interface SyncRunRecord {
  id: number;
  account_id: number | null;
  platform: string;
  channel_id: string;
  status: string;
  message: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface SyncSummary {
  status: string;
  runs: SyncRunRecord[];
}

export interface ResetDataSummary {
  status: string;
  content_metric_snapshots: number;
  account_metric_snapshots: number;
  content_items: number;
  sync_runs: number;
  accounts_reset: number;
}
