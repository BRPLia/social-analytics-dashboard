import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Database,
  Eye,
  Gauge,
  Info,
  MessageSquare,
  RefreshCw,
  Share2,
  Timer,
  TrendingUp,
  Youtube,
  Facebook,
  Instagram,
  Linkedin,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { KpiCard } from "./components/KpiCard";
import { PlatformCharts } from "./components/PlatformCharts";
import { SettingsPanel } from "./components/SettingsPanel";
import { fetchDashboard, loadDemoData, resetDashboardData, syncAccount, syncAll, syncPlatform, unloadDemoData } from "./lib/api";
import { compactNumber, metricValue, platformLabel } from "./lib/format";
import type { DashboardPayload, PlatformId, PlatformSnapshot, TopContent } from "./lib/types";

const columnHelper = createColumnHelper<TopContent>();

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.5 5.5v10.2a3.4 3.4 0 1 1-3.4-3.4" fill="none" stroke="#25f4ee" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.8 4.2c.6 3.2 2.4 5.1 5.2 5.6v3.1c-2.1-.1-3.8-.8-5.2-2v4.8a5.7 5.7 0 1 1-5.7-5.7" fill="none" stroke="#fe2c55" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.7 4.2v11.4a4.6 4.6 0 1 1-4.6-4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
    </svg>
  );
}

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  switch (platform) {
    case "youtube":
      return <Youtube size={size} style={{ color: "#ef4444" }} />;
    case "facebook":
      return <Facebook size={size} style={{ color: "#2563eb" }} />;
    case "instagram":
      return <Instagram size={size} style={{ color: "#db2777" }} />;
    case "linkedin":
      return <Linkedin size={size} style={{ color: "#1d4ed8" }} />;
    case "tiktok":
      return <TikTokIcon size={size} />;
    default:
      return <Database size={size} />;
  }
}

function SubKpiCard({ label, value, delta, isPercent = false }: { label: string; value: number | null; delta: number | string; isPercent?: boolean }) {
  const formattedValue = value === null ? "-" : (isPercent ? `${value.toFixed(1)}%` : compactNumber(value));
  if (typeof delta === "string") {
    return (
      <div className="sub-kpi-card">
        <p className="eyebrow">{label}</p>
        <strong>{formattedValue}</strong>
        <span className="zero">{delta}</span>
      </div>
    );
  }
  return (
    <div className="sub-kpi-card">
      <p className="eyebrow">{label}</p>
      <strong>{formattedValue}</strong>
      {delta > 0 ? (
        <span className="pos">+{isPercent ? `${delta.toFixed(1)}%` : compactNumber(delta)}</span>
      ) : delta < 0 ? (
        <span className="neg">{isPercent ? `${delta.toFixed(1)}%` : compactNumber(delta)}</span>
      ) : (
        <span className="zero">0</span>
      )}
    </div>
  );
}

function readMetric(row: PlatformSnapshot, sourceField: string): number | null {
  const coerce = (value: number | string | Record<string, number | string> | null | undefined) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  if (sourceField.startsWith("extra.")) {
    return coerce(row.extra[sourceField.replace("extra.", "")]);
  }
  return (row as unknown as Record<string, number | null | undefined>)[sourceField] ?? null;
}

function extraNumber(extra: Record<string, number | string | Record<string, number | string>>, key: string): number {
  const value = extra[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type ScoreDetails = Record<string, number | string>;

function scoreDetails(row: TopContent): ScoreDetails {
  const value = row.extra?.score_details;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ScoreDetails;
  }
  return {};
}

function detailNumber(details: ScoreDetails, key: string): number {
  const value = details[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function detailString(details: ScoreDetails, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function shortTitle(title: string, max = 26): string {
  return title.length > max ? `${title.slice(0, max - 1)}...` : title;
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "-";
}

/** Icono ⓘ clickeable que abre/cierra un popover con descripción de la métrica. */
function InfoTip({ text, content }: { text?: string; content?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "4px" }}>
      <Info
        size={13}
        style={{ cursor: "pointer", opacity: open ? 1 : 0.4, color: open ? "var(--accent)" : "var(--dim)", transition: "opacity 0.2s" }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      />
      {open && (
        <span
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid rgba(238,241,245,0.15)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "11px",
            color: "var(--muted)",
            lineHeight: "1.45",
            whiteSpace: "normal",
            width: "220px",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {content || text}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{
              display: "block",
              marginTop: "6px",
              background: "none",
              border: "none",
              color: "var(--accent)",
              fontSize: "10px",
              cursor: "pointer",
              padding: 0,
              fontWeight: 600,
            }}
          >
            Cerrar
          </button>
        </span>
      )}
    </span>
  );
}



function averageMetric(rows: PlatformSnapshot[], sourceField: string): number | null {
  const values = rows
    .map((row) => readMetric(row, sourceField))
    .filter((value): value is number => value !== null && value !== undefined);
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  if (sourceField.includes("rate") || sourceField.startsWith("extra.avg_")) {
    return sum / values.length;
  }
  return sum;
}

function platformSignalMetric(platformId: PlatformId, snapshot?: PlatformSnapshot | null): { label: string; value: number | null; why: string } | null {
  if (!snapshot) return null;
  const denominator = platformId === "instagram" ? (snapshot.exposure ?? snapshot.views) : snapshot.views;
  const comments = extraNumber(snapshot.extra, "comments") + extraNumber(snapshot.extra, "comments_count") + extraNumber(snapshot.extra, "comment_count");
  const shares = extraNumber(snapshot.extra, "shares") + extraNumber(snapshot.extra, "share_count");
  const saves = extraNumber(snapshot.extra, "saves") + extraNumber(snapshot.extra, "collect_count");
  const rate = denominator > 0 ? ((comments + shares + saves) / denominator) * 100 : null;

  if (platformId === "instagram") {
    return {
      label: "Señal profunda",
      value: rate,
      why: "Comentarios, compartidos y guardados divididos por alcance/vistas. Mide interés real sin depender solo de likes.",
    };
  }
  if (platformId === "tiktok") {
    return {
      label: "Señal viral",
      value: rate,
      why: "Comentarios, compartidos y guardados divididos por vistas. Sustituye retención porque el scraper público no entrega analytics privadas.",
    };
  }
  if (platformId === "facebook" && snapshot.retention_rate === null) {
    const fallbackRate = denominator > 0 ? (snapshot.interactions / denominator) * 100 : null;
    return {
      label: "Señal de interacción",
      value: fallbackRate,
      why: "Interacciones totales sobre vistas o alcance cuando Facebook no entrega vistas completas para calcular retención.",
    };
  }
  return null;
}

interface PublicationGraphData {
  date: string;
  name: string;
  fullTitle: string;
  vistas: number;
  likes: number;
  likesLabel?: string;
  comentarios: number;
  compartidos: number;
  guardados: number;
  score: number;
  señal: number;
}

const platformGraphProcessors: Record<string, (item: any) => PublicationGraphData> = {
  youtube: (item) => {
    const pfx = "hist_";
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: item.views,
      likes: extraNumber(item.extra, `${pfx}likes`) || 0,
      comentarios: extraNumber(item.extra, `${pfx}comments`) || 0,
      compartidos: extraNumber(item.extra, `${pfx}shares`) || 0,
      guardados: extraNumber(item.extra, `${pfx}saves`) || 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  },
  facebook: (item) => {
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: item.views,
      likesLabel: "Reacciones",
      likes: extraNumber(item.extra, "reactions") || extraNumber(item.extra, "likes") || 0,
      comentarios: extraNumber(item.extra, "comments") || extraNumber(item.extra, "comments_count") || 0,
      compartidos: extraNumber(item.extra, "shares") || 0,
      guardados: 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  },
  instagram: (item) => {
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: extraNumber(item.extra, "reach") || item.views || 0,
      likes: extraNumber(item.extra, "likes") || 0,
      comentarios: extraNumber(item.extra, "comments") || 0,
      compartidos: extraNumber(item.extra, "shares") || 0,
      guardados: extraNumber(item.extra, "saves") || 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  },
  tiktok: (item) => {
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: item.views,
      likes: extraNumber(item.extra, "digg_count") || extraNumber(item.extra, "likes") || 0,
      comentarios: extraNumber(item.extra, "comment_count") || extraNumber(item.extra, "comments") || 0,
      compartidos: extraNumber(item.extra, "share_count") || extraNumber(item.extra, "shares") || 0,
      guardados: extraNumber(item.extra, "collect_count") || extraNumber(item.extra, "saves") || 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  },
  linkedin: (item) => {
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: item.views,
      likes: extraNumber(item.extra, "like_count") || extraNumber(item.extra, "likes") || 0,
      comentarios: extraNumber(item.extra, "comment_count") || extraNumber(item.extra, "comments") || 0,
      compartidos: extraNumber(item.extra, "share_count") || extraNumber(item.extra, "shares") || 0,
      guardados: extraNumber(item.extra, "saves") || 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  },
  default: (item) => {
    return {
      date: formatDate(item.published_at),
      name: shortTitle(item.title, 22),
      fullTitle: item.title,
      vistas: item.views,
      likes: extraNumber(item.extra, "likes") || extraNumber(item.extra, "reactions") || 0,
      comentarios: extraNumber(item.extra, "comments") || extraNumber(item.extra, "comments_count") || 0,
      compartidos: extraNumber(item.extra, "shares") || 0,
      guardados: extraNumber(item.extra, "saves") || 0,
      score: item.score,
      señal: item.engagement_quality,
    };
  }
};

interface SyncTask {
  accountId: number;
  platform: PlatformId;
  channelId: string;
}

interface SyncLogItem {
  channelId: string;
  platform: PlatformId;
  status: "success" | "failed" | "skipped";
  message: string;
}

export function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "published_at", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const params = new URLSearchParams(window.location.search);
  const initialChannel = params.get("channel");
  const initialPlatform = params.get("platform") as PlatformId | "all" | null;
  const [channel, setChannel] = useState<string>(initialChannel ?? "all");
  const [platform, setPlatform] = useState<PlatformId | "all">(initialPlatform ?? "all");
  const [contentType, setContentType] = useState("all");

  // Estados para sincronización secuencial jerárquica
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>([]);
  const [syncCurrentIndex, setSyncCurrentIndex] = useState<number>(-1);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[] | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState<string>("");
  const [isResetting, setIsResetting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadDashboard = async () => {
    setError(null);
    const payload = await fetchDashboard();
    setData(payload);
  };

  useEffect(() => {
    loadDashboard().catch((err: unknown) => setError(String(err)));
  }, []);

  const filteredPlatforms = useMemo(() => {
    if (!data) return [];
    return data.platforms.filter((row) => {
      const channelOk = channel === "all" || row.channel_id === channel;
      const platformOk = platform === "all" || row.platform === platform;
      return channelOk && platformOk;
    });
  }, [channel, data, platform]);

  const filteredTop = useMemo(() => {
    if (!data) return [];
    return data.top_content.filter((item) => {
      const channelOk = channel === "all" || item.channel_id === channel;
      const platformOk = platform === "all" || item.platform === platform;
      const typeOk = contentType === "all" || item.content_type === contentType;
      return channelOk && platformOk && typeOk;
    });
  }, [channel, contentType, data, platform]);

  const contentTypeOptions = useMemo(() => {
    if (!data) return [];
    const scoped = data.top_content.filter((item) => {
      const channelOk = channel === "all" || item.channel_id === channel;
      const platformOk = platform === "all" || item.platform === platform;
      return channelOk && platformOk;
    });
    return Array.from(new Set(scoped.map((item) => item.content_type).filter(Boolean))).sort();
  }, [channel, data, platform]);

  const brandCardsData = useMemo(() => {
    if (!data) return [];
    return data.channels.filter((brand) => brand.platforms.length > 0).map((brand) => {
      const brandPlatforms = data.platforms.filter((p) => p.channel_id === brand.id);
      const views = brandPlatforms.reduce((sum, p) => sum + p.views, 0);
      const viewsDelta = brandPlatforms.reduce((sum, p) => sum + p.views_delta, 0);
      
      const retVals = brandPlatforms.map((p) => p.retention_rate).filter((v): v is number => v !== null);
      const retentionRate = retVals.length > 0 ? retVals.reduce((sum, v) => sum + v, 0) / retVals.length : 0;
      const retDeltas = brandPlatforms.map((p) => p.retention_delta).filter((v): v is number => v !== null);
      const retentionDelta = retDeltas.length > 0 ? retDeltas.reduce((sum, v) => sum + v, 0) / retDeltas.length : 0;

      const interactions = brandPlatforms.reduce((sum, p) => sum + p.interactions, 0);
      const interactionsDelta = brandPlatforms.reduce((sum, p) => sum + p.interactions_delta, 0);

      const followers = brandPlatforms.reduce((sum, p) => sum + (p.followers_count ?? 0), 0);
      const followersDelta = brandPlatforms.reduce((sum, p) => sum + p.followers_delta, 0);

      return {
        brand,
        views,
        viewsDelta,
        retentionRate,
        retentionDelta,
        interactions,
        interactionsDelta,
        followers,
        followersDelta,
      };
    });
  }, [data]);

  const socialCardsData = useMemo(() => {
    if (!data || channel === "all") return [];
    const selectedChannel = data.channels.find((c) => c.id === channel);
    if (!selectedChannel) return [];
    return selectedChannel.platforms.map((platId) => {
      const snapshot = data.platforms.find((p) => p.channel_id === channel && p.platform === platId);
      
      const views = snapshot ? snapshot.views : 0;
      const viewsDelta = snapshot ? snapshot.views_delta : 0;
      
      const retentionRate = snapshot && snapshot.retention_rate !== null ? snapshot.retention_rate : 0;
      const retentionDelta = snapshot ? snapshot.retention_delta : 0;
      const signalMetric = snapshot ? platformSignalMetric(platId, snapshot) : null;

      const interactions = snapshot ? snapshot.interactions : 0;
      const interactionsDelta = snapshot ? snapshot.interactions_delta : 0;

      const followers = snapshot && snapshot.followers_count !== null ? snapshot.followers_count : 0;
      const followersDelta = snapshot ? snapshot.followers_delta : 0;

      return {
        platform: platId,
        views,
        viewsDelta,
        retentionRate,
        retentionDelta,
        signalLabel: signalMetric?.label ?? "Retención",
        signalRate: signalMetric?.value ?? retentionRate,
        interactions,
        interactionsDelta,
        followers,
        followersDelta,
      };
    });
  }, [data, channel]);

  const recentPublicationData = useMemo(
    () => {
      return [...filteredTop]
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .slice(0, 10)
        .reverse()
        .map((item) => {
          const processor = platformGraphProcessors[item.platform] || platformGraphProcessors.default;
          return processor(item);
        });
    },
    [filteredTop],
  );

  const selectedProfile = platform !== "all" && data ? data.platform_profiles[platform] : null;
  const platformCards = selectedProfile
    ? selectedProfile.priority.map((metricId) => {
      const definition = selectedProfile.metrics[metricId];
      const rawValue = averageMetric(filteredPlatforms, definition.source_field);
      const signalMetric = metricId === "retention_rate" ? platformSignalMetric(platform as PlatformId, filteredPlatforms[0]) : null;
      const displayValue = signalMetric ? signalMetric.value : rawValue;
      return {
        id: metricId,
        label: signalMetric?.label ?? definition.label,
        rawValue: displayValue,
        value: metricValue(displayValue, definition.format, platform),
        why: signalMetric?.why ?? definition.why,
        availability: definition.availability,
      };
      })
    : [];

  const platformOptions =
    data && channel === "all"
      ? Array.from(new Set(data.channels.flatMap((item) => item.platforms)))
      : data?.channels.find((item) => item.id === channel)?.platforms ?? [];
  const accountOptions =
    data?.accounts.filter((account) => {
      const channelOk = channel === "all" || account.channel_id === channel;
      const platformOk = platform === "all" || account.platform === platform;
      return channelOk && platformOk && account.enabled;
    }) ?? [];
  const topChart = [...filteredTop]
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((item) => {
      const processor = platformGraphProcessors[item.platform] || platformGraphProcessors.default;
      const data = processor(item);
      data.name = shortTitle(item.title, 24);
      return data;
    });
  const selectedSnapshot = filteredPlatforms[0];
  const periodLabel = useMemo(() => {
    const range = (start: string, end: string) =>
      `[HISTÓRICO]: ${start.slice(0, 10)} a ${end.slice(0, 10)}`;

    // Con una red seleccionada se muestra SU periodo, no el global.
    if (platform !== "all") {
      const starts = filteredPlatforms.map((p) => p.period_start).filter(Boolean) as string[];
      const ends = filteredPlatforms.map((p) => p.period_end).filter(Boolean) as string[];
      if (starts.length > 0 && ends.length > 0) {
        return range(starts.sort()[0], ends.sort()[ends.length - 1]);
      }
      const dates = filteredTop.map((item) => item.published_at).filter(Boolean).sort();
      if (dates.length > 0) {
        return range(dates[0], dates[dates.length - 1]);
      }
    }

    if (data && data.period_start && data.period_end) {
      return range(data.period_start, data.period_end);
    }
    if (typeof selectedSnapshot?.extra.period_start === "string" && typeof selectedSnapshot?.extra.period_end === "string") {
      return range(selectedSnapshot.extra.period_start, selectedSnapshot.extra.period_end);
    }
    return `[HISTÓRICO]: último sync`;
  }, [channel, platform, filteredTop, data, filteredPlatforms, selectedSnapshot]);
  const funnelData = [
    { etapa: "Entra", valor: filteredPlatforms.reduce((total, row) => total + row.views, 0) },
    {
      etapa: "Retiene",
      valor: Math.round(
        filteredPlatforms.reduce((total, row) => total + row.views * ((row.retention_rate ?? 0) / 100), 0),
      ),
    },
    {
      etapa: "Señal",
      valor: Math.round(
        filteredPlatforms.reduce((total, row) => {
          const pfx = "hist_";
          const sharesKey = row.platform === "youtube" ? `${pfx}shares` : "shares";
          const savesKey = row.platform === "youtube" ? `${pfx}saves` : "saves";
          const commentsKey = row.platform === "youtube" ? `${pfx}comments` : "comments";
          return total + extraNumber(row.extra, sharesKey) + extraNumber(row.extra, savesKey) + extraNumber(row.extra, commentsKey);
        }, 0),
      ),
    },
    { etapa: "Convierte", valor: filteredPlatforms.reduce((total, row) => total + (row.audience_growth ?? 0), 0) },
  ];

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "row_number",
        header: "#",
        cell: (info) => info.row.index + 1 + pagination.pageIndex * pagination.pageSize,
        size: 40,
      }),
      columnHelper.accessor("published_at", {
        header: "Fecha",
        cell: (info) => String(info.getValue()).slice(0, 10),
      }),
      columnHelper.accessor("title", {
        header: "Contenido",
        cell: (info) => {
          const url = info.row.original.url;
          return url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="content-link">
              {info.getValue()}
            </a>
          ) : (
            <strong>{info.getValue()}</strong>
          );
        },
      }),
      columnHelper.accessor("platform", {
        header: "Red",
        cell: (info) => platformLabel(info.getValue()),
      }),
      columnHelper.accessor("content_type", {
        header: "Tipo",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("views", {
        header: () => <span style={{ display: "inline-flex", alignItems: "center" }}>Vistas<InfoTip text="Reproducciones o alcance acumulado del contenido. En videos usa vistas reales; en imágenes/texto usa el alcance único como proxy." /></span>,
        cell: (info) => {
          const val = info.getValue();
          const extra = info.row.original.extra || {};
          const secondaryViews = extra.secondary_views;
          const secondaryLabel = extra.secondary_label;

          return (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px", 
              padding: "4px 0",
              minWidth: "125px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ 
                   fontSize: "14px", 
                   fontWeight: 700, 
                   color: "var(--text)",
                   letterSpacing: "-0.01em"
                }}>
                  {compactNumber(val)}
                </span>
                
                <span style={{ 
                  fontSize: "9px", 
                  background: "rgba(132, 204, 22, 0.12)", 
                  color: "var(--accent)", 
                  border: "1px solid rgba(132, 204, 22, 0.2)",
                  padding: "2px 6px",
                  borderRadius: "6px", 
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  HISTÓRICO
                </span>
              </div>
              {secondaryLabel !== undefined && secondaryLabel !== null && secondaryViews !== undefined && secondaryViews !== null && (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px", 
                  fontSize: "11px", 
                  color: "var(--dim)",
                  fontWeight: 400
                }}>
                  <span style={{ opacity: 0.8 }}>{String(secondaryLabel)}:</span>
                  <span style={{ fontWeight: 600, color: "var(--muted)" }}>
                    {compactNumber(Number(secondaryViews))}
                  </span>
                </div>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => {
        if (row.platform === "instagram") {
          return Number(row.extra?.comments || 0) + Number(row.extra?.shares || 0) + Number(row.extra?.saves || 0);
        }
        // YouTube y Facebook: retención (video completion rate)
        return row.retention_rate ?? 0;
      }, {
        id: "quality_metric",
        header: () => {
          if (platform === "instagram") {
            return (
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                Interacción Profunda
                <InfoTip text="Suma de comentarios, compartidos y guardados. Excluye likes para medir señales de alto valor que el algoritmo de Instagram prioriza." />
              </span>
            );
          }
          return (
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              Retención
              <InfoTip text="Porcentaje de vistas completas sobre vistas totales de video. Mide el enganche interno del contenido audiovisual." />
            </span>
          );
        },
        cell: (info) => {
          const row = info.row.original;
          if (row.platform === "instagram") {
            const val = Number(row.extra?.comments || 0) + Number(row.extra?.shares || 0) + Number(row.extra?.saves || 0);
            return compactNumber(val);
          }
          // YouTube y Facebook: retención como porcentaje
          return row.retention_rate !== null && row.retention_rate !== undefined
            ? `${row.retention_rate.toFixed(1)}%`
            : "n/a";
        }
      }),
      columnHelper.accessor("engagement_quality", {
        header: () => <span style={{ display: "inline-flex", alignItems: "center" }}>Compromiso<InfoTip text="Tasa de interacciones (likes + comentarios + compartidos) dividida por las vistas o alcance. Mide qué tan activa es la audiencia con el contenido." /></span>,
        cell: (info) => {
          const row = info.row.original;
          const details = scoreDetails(row);
          const interactions = detailNumber(details, "interactions");
          const strongSignals = detailNumber(details, "strong_signals");
          const engagementRate = detailNumber(details, "engagement_rate");
          const subsPer1k = detailNumber(details, "subs_per_1k");

          if (row.platform === "instagram") {
            return (
              <div className="metric-cell">
                <strong>Señal fuerte: {compactNumber(strongSignals)}</strong>
                <small>ER real {engagementRate.toFixed(2)}% · likes {compactNumber(detailNumber(details, "likes"))}</small>
              </div>
            );
          }
          if (row.platform === "facebook") {
            return (
              <div className="metric-cell">
                <strong>{compactNumber(interactions)} interacciones</strong>
                <small>{row.retention_rate !== null && row.retention_rate !== undefined ? `Retención ${row.retention_rate.toFixed(1)}%` : `ER real ${engagementRate.toFixed(2)}%`}</small>
              </div>
            );
          }
          if (row.platform === "youtube") {
            return (
              <div className="metric-cell">
                <strong>{engagementRate.toFixed(2)}%</strong>
                <small>Subs netos {compactNumber(row.audience_growth ?? 0)} · {subsPer1k.toFixed(2)} / 1k vistas</small>
              </div>
            );
          }
          return `${info.getValue().toFixed(2)}%`;
        },
      }),
      columnHelper.accessor("score", {
        header: () => <span style={{ display: "inline-flex", alignItems: "center" }}>Score<InfoTip text="Puntaje ponderado (0-100) que combina retención, compromiso, conversión y vistas. Compara cada publicación contra el histórico de su grupo." /></span>,
        cell: (info) => {
          const details = scoreDetails(info.row.original);
          const confidence = detailString(details, "score_confidence") || "media";
          const relative = detailNumber(details, "relative_score");
          return (
            <div className="score-cell">
              <strong>{info.getValue().toFixed(1)}</strong>
              <span className={`confidence-pill ${confidence}`}>{confidence === "baja" ? "baja confianza" : "real"}</span>
              <small>rel. {relative.toFixed(1)}</small>
            </div>
          );
        },
      }),
      columnHelper.accessor("diagnosis", {
        header: () => {
          const legend = (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "180px", textAlign: "left" }}>
              <strong style={{ display: "block", marginBottom: "4px", color: "var(--text)" }}>Diagnóstico histórico:</strong>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#a855f7", display: "inline-block" }} />
                <span>Élite (Score ≥ 85)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#84cc16", display: "inline-block" }} />
                <span>Alto (Score 65-84)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
                <span>Promedio (Score 40-64)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                <span>Bajo (Score &lt; 40)</span>
              </div>
            </div>
          );
          return (
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              Diagnóstico
              <InfoTip content={legend} />
            </span>
          );
        },
        cell: (info) => {
          const val = info.getValue();
          if (!val) {
            return <span style={{ opacity: 0.65 }}>Estable</span>;
          }
          let color = "#9ea3ad";
          let bg = "rgba(158, 163, 173, 0.1)";
          
          if (val.includes("[ÉLITE]")) {
            color = "#a855f7"; // Violeta élite
            bg = "rgba(168, 85, 247, 0.12)";
          } else if (val.includes("[ALTO RELATIVO]")) {
            color = "#3b82f6";
            bg = "rgba(59, 130, 246, 0.12)";
          } else if (val.includes("[ALTO]")) {
            color = "#84cc16"; // Verde
            bg = "rgba(132, 204, 22, 0.12)";
          } else if (val.includes("[PROMEDIO]")) {
            color = "#eab308"; // Amarillo
            bg = "rgba(234, 179, 8, 0.12)";
          } else if (val.includes("[BAJO]") || val.includes("[DESCARTE]")) {
            color = "#ef4444"; // Rojo
            bg = "rgba(239, 68, 68, 0.12)";
          } else {
            // Fallbacks antiguos
            if (val.includes("Funciona: replicar")) {
              color = "#84cc16";
              bg = "rgba(132, 204, 22, 0.12)";
            } else if (val.includes("Funciona parcialmente")) {
              color = "#a3e635";
              bg = "rgba(163, 230, 53, 0.12)";
            } else if (val.includes("Regular:")) {
              color = "#eab308";
              bg = "rgba(234, 179, 8, 0.12)";
            } else if (val.includes("No funciona:")) {
              color = "#ef4444";
              bg = "rgba(239, 68, 68, 0.12)";
            } else if (val.includes("Buena señal")) {
              color = "#3b82f6";
              bg = "rgba(59, 130, 246, 0.12)";
            } else if (val.includes("Entra, pero")) {
              color = "#f97316";
              bg = "rgba(249, 115, 22, 0.12)";
            } else if (val.includes("Pendiente")) {
              color = "#9ea3ad";
              bg = "rgba(158, 163, 173, 0.1)";
            }
          }
          
          return (
            <span
              style={{
                color,
                background: bg,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                display: "inline-block",
                whiteSpace: "normal",
                wordBreak: "break-word",
                maxWidth: "200px", // Un poco más ancho para albergar los textos detallados compuestos
                lineHeight: "1.3"
              }}
            >
              {val}
            </span>
          );
        },
      }),
    ],
    [platform],
  );

  const table = useReactTable({
    data: filteredTop,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  const startSequencedSync = async (tasks: SyncTask[], label: string) => {
    if (isSyncing || tasks.length === 0 || !data) return;
    setIsSyncing(true);
    setSyncQueue(tasks);
    setSyncCurrentIndex(0);
    setSyncLabel(label);
    setSyncLogs([]);
    setSyncMessage(null);

    for (let i = 0; i < tasks.length; i++) {
      setSyncCurrentIndex(i);
      const task = tasks[i];
      try {
        const result = await syncAccount(task.platform, task.accountId);
        const success = result.status === "success" || result.runs.every((r) => r.status === "success" || r.status === "skipped");
        const skipped = result.runs.every((r) => r.status === "skipped");
        
        setSyncLogs((prev) => [
          ...(prev || []),
          {
            channelId: task.channelId,
            platform: task.platform,
            status: skipped ? "skipped" : (success ? "success" : "failed"),
            message: result.runs[0]?.message || "Sincronizado con éxito."
          }
        ]);
      } catch (err) {
        setSyncLogs((prev) => [
          ...(prev || []),
          {
            channelId: task.channelId,
            platform: task.platform,
            status: "failed",
            message: String(err)
          }
        ]);
      }
    }

    setIsSyncing(false);
    setSyncCurrentIndex(-1);
    await loadDashboard();
  };

  const handleSyncAll = () => {
    if (!data) return;
    const tasks: SyncTask[] = data.accounts
      .filter((acc) => acc.enabled)
      .map((acc) => ({
        accountId: acc.id,
        platform: acc.platform,
        channelId: acc.channel_id,
      }));
    startSequencedSync(tasks, "todo");
  };

  const handleSyncChannel = () => {
    if (!data || channel === "all") return;
    const tasks: SyncTask[] = data.accounts
      .filter((acc) => acc.enabled && acc.channel_id === channel)
      .map((acc) => ({
        accountId: acc.id,
        platform: acc.platform,
        channelId: acc.channel_id,
      }));
    startSequencedSync(tasks, "channel");
  };

  const handleSyncPlatform = () => {
    if (!data || channel === "all" || platform === "all") return;
    const tasks: SyncTask[] = data.accounts
      .filter((acc) => acc.enabled && acc.channel_id === channel && acc.platform === platform)
      .map((acc) => ({
        accountId: acc.id,
        platform: acc.platform,
        channelId: acc.channel_id,
      }));
    startSequencedSync(tasks, "platform");
  };

  const handleLoadDemo = async () => {
    setIsDemoLoading(true);
    setSyncMessage(null);
    try {
      await loadDemoData();
      await loadDashboard();
      setSyncMessage("Datos de ejemplo cargados. Puedes borrarlos desde Configuración.");
    } catch (err) {
      setSyncMessage(`No se pudieron cargar los datos de ejemplo: ${String(err)}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleUnloadDemo = async () => {
    setIsDemoLoading(true);
    try {
      await unloadDemoData();
      await loadDashboard();
      setSyncMessage("Datos de ejemplo eliminados.");
    } catch (err) {
      setSyncMessage(`No se pudieron eliminar los datos de ejemplo: ${String(err)}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleResetData = async () => {
    const confirmed = window.confirm(
      "Esto borrará snapshots, contenidos ingeridos e historial local de sincronización. Se conservan marcas, cuentas, IDs externos y configuración. ¿Continuar?",
    );
    if (!confirmed) return;

    setIsResetting(true);
    setSyncMessage(null);
    setSyncLogs(null);
    try {
      const result = await resetDashboardData();
      await loadDashboard();
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
      setSyncMessage(
        `Base limpia: ${result.content_items} contenidos, ${
          result.account_metric_snapshots + result.content_metric_snapshots
        } snapshots y ${result.sync_runs} registros de sync eliminados.`,
      );
    } catch (err) {
      setSyncMessage(`No se pudo limpiar la base local: ${String(err)}`);
    } finally {
      setIsResetting(false);
    }
  };

  if (error) {
    return (
      <main className="state-page">
        <AlertCircle />
        <p>No pude cargar el backend: {error}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="state-page">Cargando dashboard...</main>;
  }

  const hasSnapshots = data.source !== "sqlite_empty";

  const getButtonText = (type: "todo" | "channel" | "platform") => {
    if (isSyncing && syncLabel === type && syncCurrentIndex >= 0 && syncCurrentIndex < syncQueue.length) {
      const current = syncQueue[syncCurrentIndex];
      return `ACTUALIZANDO DATA [${syncCurrentIndex + 1}/${syncQueue.length}] ${current.channelId.toUpperCase()}: ${current.platform.toUpperCase()}`;
    }
    if (type === "todo") return "Actualizar todo";
    if (type === "channel") return `Actualizar Marca ${channel.toUpperCase()}`;
    return `Actualizar ${platform.toUpperCase()}`;
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Analitica local</p>
          <h1>Dashboard Redes</h1>
        </div>
        <nav className="channel-nav" aria-label="Canales">
          <button className={channel === "all" && !showSettings ? "active" : ""} onClick={() => { setChannel("all"); setPlatform("all"); setShowSettings(false); }}>Todos</button>
          {data.channels.map((item) => (
            <button key={item.id} className={channel === item.id && !showSettings ? "active" : ""} onClick={() => { setChannel(item.id); setPlatform("all"); setShowSettings(false); }} style={{ "--accent": item.color } as React.CSSProperties}>
              {item.name}
            </button>
          ))}
          <button
            className={showSettings ? "active" : ""}
            onClick={() => setShowSettings(true)}
            style={{ marginTop: "12px", borderStyle: "dashed", borderColor: "var(--line)" }}
          >
            ⚙️ Configuración
          </button>
        </nav>
        <section className="connector-panel">
          <p className="eyebrow">Conectores</p>
          {data.connector_status.map((item) => (
            <div key={item.platform} className="connector-row">
              <span className={`status-dot ${item.state}`} />
              <div>
                <strong>{platformLabel(item.platform)}</strong>
                <small>{item.message}</small>
              </div>
            </div>
          ))}
        </section>
      </aside>

      <section className="content">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} onRefreshDashboard={loadDashboard} />
        ) : data.channels.length === 0 ? (
          <div className="empty-state-banner">
            <div className="empty-state-icon">⚙️</div>
            <h3>¡Bienvenido a tu Dashboard de Redes!</h3>
            <p>Aún no tienes marcas configuradas en tu sistema local. Comienza agregando tu primera marca y conectando tus redes sociales.</p>
            <button className="primary-action" onClick={() => setShowSettings(true)} style={{ padding: "12px 24px", fontSize: "15px" }}>
              Configurar mi Primera Marca
            </button>
            <button onClick={handleLoadDemo} disabled={isDemoLoading}>
              {isDemoLoading ? "Cargando…" : "Explorar con datos de ejemplo"}
            </button>
            <small style={{ opacity: 0.7 }}>
              Genera dos marcas ficticias para recorrer la herramienta. Se borran cuando quieras.
            </small>
          </div>
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Fuente {data.source} · {new Date(data.generated_at).toLocaleString("es-BO")}</p>
                <h2>{channel === "all" ? "Vista general" : `Canal ${channel}`}</h2>
              </div>
          <div className="actions">
            {/* Padre: Siempre visible */}
            <button 
              className="primary-action" 
              onClick={handleSyncAll} 
              disabled={isSyncing || isResetting}
            >
              <RefreshCw size={16} className={isSyncing && syncLabel === "todo" ? "spin" : ""} />
              {getButtonText("todo")}
            </button>

            {/* Hijo: Visible si hay un canal seleccionado */}
            {channel !== "all" && (
              <button 
                onClick={handleSyncChannel} 
                disabled={isSyncing || isResetting}
              >
                <BarChart3 size={16} className={isSyncing && syncLabel === "channel" ? "spin" : ""} />
                {getButtonText("channel")}
              </button>
            )}

            {/* Nieto: Visible si hay un canal y plataforma seleccionados */}
            {channel !== "all" && platform !== "all" && (
              <button 
                onClick={handleSyncPlatform} 
                disabled={isSyncing || isResetting}
              >
                <Database size={16} className={isSyncing && syncLabel === "platform" ? "spin" : ""} />
                {getButtonText("platform")}
              </button>
            )}
            {data.channels.some((item) => item.id.startsWith("DEMO-")) && (
              <button
                onClick={handleUnloadDemo}
                disabled={isDemoLoading}
                title="Elimina las marcas ficticias sin tocar tus datos reales"
              >
                <Trash2 size={16} className={isDemoLoading ? "spin" : ""} />
                Quitar datos de ejemplo
              </button>
            )}
            <button
              className="danger-action"
              onClick={handleResetData}
              disabled={isSyncing || isResetting}
              title="Limpia snapshots, contenidos e historial local sin borrar cuentas"
            >
              <Trash2 size={16} className={isResetting ? "spin" : ""} />
              {isResetting ? "Limpiando data" : "Limpiar data local"}
            </button>
          </div>
        </header>

        <section className="filters">
          {channel !== "all" && (
            <div className="platform-filter" aria-label="Filtro de plataforma">
              <button className={platform === "all" ? "active" : ""} onClick={() => { setPlatform("all"); }}>Todas</button>
              {platformOptions.map((item) => (
                <button key={item} className={platform === item ? "active" : ""} onClick={() => { setPlatform(item); }}>
                  {platformLabel(item)}
                </button>
              ))}
            </div>
          )}
          <span className="period-pill">Periodo medido {periodLabel}</span>
          <select value={contentType} onChange={(event) => setContentType(event.target.value)} aria-label="Tipo de contenido">
            <option value="all">Todo contenido</option>
            {contentTypeOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </section>

        {syncMessage ? <p className="sync-message">{syncMessage}</p> : null}
        {!hasSnapshots ? (
          <section className="empty-dashboard">
            <CheckCircle2 />
            <div>
              <h3>Base lista, sin snapshots todavía</h3>
              <p>Usa Actualizar todo o una cuenta específica para crear la primera captura local.</p>
            </div>
          </section>
        ) : null}

        {/* Caso 1: Rejilla de marcas con subtarjetas de deltas */}
        {channel === "all" && (
          <section className="brand-grid">
            {brandCardsData.map(({ brand, views, viewsDelta, retentionRate, retentionDelta, interactions, interactionsDelta, followers, followersDelta }) => (
              <article key={brand.id} className="brand-card">
                <div className="brand-card-header">
                  <span className="brand-card-title">{brand.name}</span>
                  <div className="brand-card-platforms">
                    {brand.platforms.map((p) => (
                      <span key={p} className="platform-mini-badge" title={platformLabel(p)}>
                        <PlatformIcon platform={p} size={12} />
                        {platformLabel(p)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="brand-subgrid">
                  <SubKpiCard label="Vistas" value={views} delta={viewsDelta} />
                  <SubKpiCard label="Retención" value={retentionRate} delta={retentionDelta} isPercent={true} />
                  <SubKpiCard label="Interacciones" value={interactions} delta={interactionsDelta} />
                  <SubKpiCard label="Seguidores" value={followers} delta={followersDelta} />
                </div>
              </article>
            ))}
          </section>
        )}

        {/* Caso 2: Rejilla de redes con subtarjetas de deltas */}
        {channel !== "all" && platform === "all" && (
          <section className="social-grid">
            {socialCardsData.map(({ platform: platId, views, viewsDelta, signalLabel, signalRate, retentionDelta, interactions, interactionsDelta, followers, followersDelta }) => (
              <article key={platId} className="social-card">
                <div className="social-card-header">
                  <span className="social-card-title">
                    <PlatformIcon platform={platId} size={20} />
                    {platformLabel(platId)}
                  </span>
                </div>
                <div className="brand-subgrid">
                  <SubKpiCard label="Vistas" value={views} delta={viewsDelta} />
                  <SubKpiCard label={signalLabel} value={signalRate} delta={signalLabel === "Retención" ? retentionDelta : (platId === "instagram" ? "por alcance" : "por vistas")} isPercent={true} />
                  <SubKpiCard label="Interacciones" value={interactions} delta={interactionsDelta} />
                  <SubKpiCard label="Seguidores" value={followers} delta={followersDelta} />
                </div>
              </article>
            ))}
          </section>
        )}

        {/* Caso 3: KPI detallados de plataforma */}
        {channel !== "all" && platform !== "all" && (
          selectedProfile ? (
            <section className="platform-metric-panel">
              <div className="platform-metric-head">
                <div>
                  <p className="eyebrow">Panel específico</p>
                  <h3>{selectedProfile.label}</h3>
                </div>
                <span>{platformCards.length} KPIs esenciales</span>
              </div>
              <div className="kpi-grid">
                {platformCards.map((item) => {
                  let deltaText = "";
                  const snapshot = filteredPlatforms[0];
                  if (snapshot) {
                    if (item.id === "views") {
                      deltaText = snapshot.views_delta >= 0 ? `+${compactNumber(snapshot.views_delta)}` : `${compactNumber(snapshot.views_delta)}`;
                    } else if (item.id === "retention_rate") {
                      const signalMetric = platformSignalMetric(platform as PlatformId, snapshot);
                      if (signalMetric) {
                        deltaText = platform === "instagram" ? "por alcance" : "por vistas";
                      } else {
                        deltaText = snapshot.retention_delta >= 0 ? `+${snapshot.retention_delta.toFixed(1)}%` : `${snapshot.retention_delta.toFixed(1)}%`;
                      }
                    } else if (item.id === "interactions") {
                      deltaText = snapshot.interactions_delta >= 0 ? `+${compactNumber(snapshot.interactions_delta)}` : `${compactNumber(snapshot.interactions_delta)}`;
                    } else if (item.id === "followers_count") {
                      deltaText = snapshot.followers_delta >= 0 ? `+${compactNumber(snapshot.followers_delta)}` : `${compactNumber(snapshot.followers_delta)}`;
                    } else if (item.id === "post_count") {
                      deltaText = snapshot.post_count_delta >= 0 ? `+${compactNumber(snapshot.post_count_delta)}` : `${compactNumber(snapshot.post_count_delta)}`;
                    } else if (item.id === "engagement_quality") {
                      const engDelta = snapshot.extra ? Number(snapshot.extra.engagement_delta || 0) : 0;
                      deltaText = engDelta >= 0 ? `+${engDelta.toFixed(2)}%` : `${engDelta.toFixed(2)}%`;
                    }
                  }
                  
                  // Mapeo semántico de iconos para evitar depender de índices fijos
                  const metricIcons: Record<string, React.ReactNode> = {
                    views: <Eye size={20} />,
                    retention_rate: <Timer size={20} />,
                    interactions: <Share2 size={20} />,
                    followers_count: <TrendingUp size={20} />,
                    post_count: <Database size={20} />,
                    engagement_quality: <Gauge size={20} />,
                  };

                  return (
                    <KpiCard
                      key={item.id}
                      label={
                        <span style={{ display: "inline-flex", alignItems: "center" }}>
                          {item.label}
                          {item.why && <InfoTip text={item.why} />}
                        </span>
                      }
                      value={item.value}
                      delta={deltaText || (item.rawValue === null ? "pendiente" : "estable")}
                      tone={item.rawValue === null ? "pending" : "normal"}
                      icon={metricIcons[item.id] ?? <Gauge size={20} />}
                    />
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="kpi-grid">
              <KpiCard label="Vistas (Views)" value={compactNumber(data.summary.views)} delta="base del análisis" icon={<Eye size={20} />} />
              <KpiCard label="Exposición (Exposure)" value={compactNumber(data.summary.exposure)} delta="entra" icon={<BarChart3 size={20} />} />
              <KpiCard label="Horas vistas (Watch time)" value={compactNumber(data.summary.watch_time_hours)} delta="retiene" icon={<Timer size={20} />} />
              <KpiCard label="Retención (Retention)" value={`${data.summary.retention_rate.toFixed(1)}%`} delta="calidad interna" icon={<Gauge size={20} />} />
              <KpiCard label="Compromiso (Engagement)" value={`${data.summary.engagement_quality.toFixed(1)}%`} delta="likes, comentarios, compartidos" icon={<Share2 size={20} />} />
              <KpiCard label="Crecimiento (Growth)" value={compactNumber(data.summary.audience_growth)} delta="convierte" icon={<TrendingUp size={20} />} />
            </section>
          )
        )}

        {/* Caso 3: Gráficos (Tendencia, Engagement Trend, y Top 10) */}
        {channel !== "all" && platform !== "all" && (
          <PlatformCharts
            platform={platform}
            recentPublicationData={recentPublicationData}
            topChart={topChart}
          />
        )}

        <section className="panel">
          <div className="panel-head" style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <p className="eyebrow">Contenido</p>
                <h3>Últimos contenidos y métricas esenciales</h3>
              </div>
              <select value={pagination.pageSize} onChange={(event) => setPagination({ pageIndex: 0, pageSize: Number(event.target.value) })}>
                <option value={10}>10 filas</option>
                <option value={15}>15 filas</option>
                <option value={30}>30 filas</option>
                <option value={50}>50 filas</option>
              </select>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length}>No hay contenido para este filtro.</td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</button>
            <span>
              Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
            </span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</button>
          </div>
        </section>

        <footer style={{ 
          textAlign: "center", 
          padding: "20px 0 10px", 
          color: "var(--dim)", 
          fontSize: "12px",
          borderTop: "1px solid var(--line)",
          marginTop: "20px"
        }}>
          ℹ️ Se muestran los últimos {filteredTop.length} contenidos sincronizados del canal.
        </footer>
          </>
        )}
      </section>

      {syncLogs && (
        <div className="sync-notification-toast">
          <div className="sync-toast-header">
            <h4>Registro de Sincronización</h4>
            <button className="close-btn" onClick={() => setSyncLogs(null)}>×</button>
          </div>
          <div className="sync-toast-body">
            {syncLogs.length === 0 ? (
              <p className="empty-toast">Iniciando actualización secuencial...</p>
            ) : (
              <ul>
                {syncLogs.map((log, idx) => (
                  <li key={idx} className={`sync-log-item ${log.status}`}>
                    <span className="status-indicator">
                      {log.status === "success" && "✔️"}
                      {log.status === "failed" && "❌"}
                      {log.status === "skipped" && "⚠️"}
                    </span>
                    <span className="log-text">
                      <strong>{log.channelId.toUpperCase()}</strong> · {platformLabel(log.platform)}
                    </span>
                    <span className="log-msg" title={log.message}>{log.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {isSyncing && (
              <div className="sync-progress-bar-container">
                <div 
                  className="sync-progress-bar" 
                  style={{ width: `${((syncCurrentIndex + 1) / syncQueue.length) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

