import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { Info } from "lucide-react";
import { compactNumber } from "../../lib/format";

// --- Helpers locales ---
function shortTitle(title: string, max = 26): string {
  return title.length > max ? `${title.slice(0, max - 1)}...` : title;
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "-";
}

/** Icono ⓘ clickeable que abre/cierra un popover con descripción de la métrica. */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
      <Info
        size={14}
        style={{ cursor: "pointer", opacity: open ? 1 : 0.4, color: open ? "var(--accent)" : "var(--dim)", transition: "opacity 0.2s" }}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <span
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "0",
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
          }}
        >
          {text}
          <button
            onClick={() => setOpen(false)}
            style={{ display: "block", marginTop: "6px", background: "none", border: "none", color: "var(--accent)", fontSize: "10px", cursor: "pointer", padding: 0, fontWeight: 600 }}
          >
            Cerrar
          </button>
        </span>
      )}
    </span>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: Record<string, any>;
  }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload ?? {};
  const title = String(row.fullTitle ?? label ?? "");
  const date = String(row.date ?? "");

  const vistas = row.vistas !== undefined ? Number(row.vistas) : null;
  const likes = row.likes !== undefined ? Number(row.likes) : null;
  const comentarios = row.comentarios !== undefined ? Number(row.comentarios) : null;
  const compartidos = row.compartidos !== undefined ? Number(row.compartidos) : null;
  const score = row.score !== undefined ? Number(row.score) : null;
  const señal = row.señal !== undefined ? Number(row.señal) : null;

  const hasDetails = vistas !== null || likes !== null || comentarios !== null;

  return (
    <div className="chart-tooltip" style={{ 
      minWidth: "240px", 
      maxWidth: "300px",
      padding: "14px", 
      borderRadius: "10px",
      background: "var(--surface)", 
      border: "1px solid rgba(238,241,245,0.12)",
      boxShadow: "0 12px 30px rgba(0, 0, 0, 0.5)",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }}>
      <strong style={{ 
        display: "block", 
        color: "var(--text)", 
        fontSize: "13px", 
        fontWeight: 600, 
        lineHeight: "1.4",
        whiteSpace: "normal",
        wordBreak: "break-word"
      }}>
        {title}
      </strong>
      {date ? (
        <small style={{ display: "block", color: "var(--dim)", fontSize: "11px" }}>
          📅 Publicado: {date}
        </small>
      ) : null}

      {hasDetails ? (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          gap: "8px", 
          borderTop: "1px solid var(--line)", 
          paddingTop: "10px",
          marginTop: "4px"
        }}>
          {vistas !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Vistas</span>
              <strong style={{ color: "#84cc16", fontSize: "13px", fontWeight: 700 }}>{compactNumber(vistas)}</strong>
            </div>
          )}
          {likes !== null && likes > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Likes</span>
              <strong style={{ color: "#ff5b77", fontSize: "13px", fontWeight: 700 }}>{compactNumber(likes)}</strong>
            </div>
          )}
          {comentarios !== null && comentarios > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Comments</span>
              <strong style={{ color: "#3b82f6", fontSize: "13px", fontWeight: 700 }}>{compactNumber(comentarios)}</strong>
            </div>
          )}
          {compartidos !== null && compartidos > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Shares</span>
              <strong style={{ color: "#ffcb57", fontSize: "13px", fontWeight: 700 }}>{compactNumber(compartidos)}</strong>
            </div>
          )}
          {score !== null && score > 0 && (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "2px", 
              background: "rgba(132, 204, 22, 0.06)", 
              padding: "6px 8px", 
              borderRadius: "6px", 
              border: "1px solid rgba(132, 204, 22, 0.15)" 
            }}>
              <span style={{ color: "var(--accent)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Score</span>
              <strong style={{ color: "#84cc16", fontSize: "13px", fontWeight: 700 }}>{score.toFixed(1)}</strong>
            </div>
          )}
          {señal !== null && (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "2px", 
              background: "rgba(163, 230, 53, 0.06)", 
              padding: "6px 8px", 
              borderRadius: "6px", 
              border: "1px solid rgba(163, 230, 53, 0.15)" 
            }}>
              <span style={{ color: "#a3e635", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Compromiso</span>
              <strong style={{ color: "#a3e635", fontSize: "13px", fontWeight: 700 }}>{señal.toFixed(2)}%</strong>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {payload.map((item) => (
            <span key={item.name} style={{ color: item.color, fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
              <span>{item.name}:</span>
              <strong>{compactNumber(Number(item.value ?? 0))}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface PublicationGraphData {
  date: string;
  name: string;
  fullTitle: string;
  vistas: number;
  likes: number;
  comentarios: number;
  compartidos: number;
  score: number;
  señal: number;
}

export interface DefaultChartsProps {
  recentPublicationData: PublicationGraphData[];
  topChart: PublicationGraphData[];
  platform: string;
}

export function DefaultCharts({ recentPublicationData, topChart, platform }: DefaultChartsProps) {
  const formattedData = recentPublicationData.map(item => ({
    ...item,
    interacciones_totales: item.likes + item.comentarios + item.compartidos
  }));

  const formattedTop = topChart.map(item => ({
    ...item,
    interacciones_totales: item.likes + item.comentarios + item.compartidos
  }));

  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia ({platform.toUpperCase()})</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Vistas por publicación<InfoTip text="Muestra las vistas de las 10 publicaciones más recientes. En videos usa reproducciones reales; en imágenes/texto usa el alcance único como proxy." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="vistas" name="Vistas" stroke="#84cc16" fill="rgba(132,204,22,0.18)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Engagement ({platform.toUpperCase()})</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Interacciones (Likes + Comentarios + Compartidos)<InfoTip text="Total de interacciones agregadas por publicación reciente. Mide el volumen de engagement acumulado para detectar qué contenido genera más actividad." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="interacciones_totales" name="Interacciones" stroke="#ff5b77" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Top ({platform.toUpperCase()})</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Publicaciones más vistas<InfoTip text="Ranking de las 10 publicaciones con más vistas del periodo. Permite identificar qué formatos y temas tienen mayor alcance en esta red." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={formattedTop}>
            <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={65} />
            <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="vistas" fill="#84cc16" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}
