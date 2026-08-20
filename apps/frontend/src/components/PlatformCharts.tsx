/**
 * REGLA ARQUITECTÓNICA — AISLAMIENTO POR PLATAFORMA
 *
 * Cada red social DEBE tener sus gráficos y métricas aislados.
 * Un cambio en Instagram NO DEBE afectar YouTube ni Facebook ni viceversa.
 *
 * Estructura:
 *   - YoutubeCharts   → Gráficos exclusivos de YouTube (retención, likes/comments/shares desglosados)
 *   - FacebookCharts  → Gráficos de Facebook (vistas y engagement agregado)
 *   - InstagramCharts → Gráficos de Instagram (alcance y métrica especial "Interacción Profunda")
 *   - TiktokCharts    → Gráficos de TikTok (base aislada para futuros cambios)
 *   - LinkedinCharts  → Gráficos de LinkedIn (base aislada para futuros cambios)
 *   - DefaultCharts   → Fallback genérico importado de ./fallback/ para plataformas no registradas
 */
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
import { useState } from "react";
import { Info } from "lucide-react";
import { compactNumber } from "../lib/format";
import { DefaultCharts } from "./fallback/DefaultCharts";

const interactionColors = {
  likes: "#ff5b77",
  comentarios: "#3b82f6",
  compartidos: "#ffcb57",
  guardados: "#2dd4bf",
};

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

// --- Tooltip de gráficos personalizado y modular ---
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
  const guardados = row.guardados !== undefined ? Number(row.guardados) : null;
  const score = row.score !== undefined ? Number(row.score) : null;
  const señal = row.señal !== undefined ? Number(row.señal) : null;

  const likesLabel = String(row.likesLabel ?? "Likes");
  const strongSignal = (comentarios ?? 0) + (compartidos ?? 0) + (guardados ?? 0);
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
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{likesLabel}</span>
              <strong style={{ color: interactionColors.likes, fontSize: "13px", fontWeight: 700 }}>{compactNumber(likes)}</strong>
            </div>
          )}
          {comentarios !== null && comentarios > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Comments</span>
              <strong style={{ color: interactionColors.comentarios, fontSize: "13px", fontWeight: 700 }}>{compactNumber(comentarios)}</strong>
            </div>
          )}
          {compartidos !== null && compartidos > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Shares</span>
              <strong style={{ color: interactionColors.compartidos, fontSize: "13px", fontWeight: 700 }}>{compactNumber(compartidos)}</strong>
            </div>
          )}
          {guardados !== null && guardados > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "6px" }}>
              <span style={{ color: "var(--dim)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Guardados</span>
              <strong style={{ color: interactionColors.guardados, fontSize: "13px", fontWeight: 700 }}>{compactNumber(guardados)}</strong>
            </div>
          )}
          {strongSignal > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "rgba(45, 212, 191, 0.06)", padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(45, 212, 191, 0.14)" }}>
              <span style={{ color: interactionColors.guardados, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Señal fuerte</span>
              <strong style={{ color: interactionColors.guardados, fontSize: "13px", fontWeight: 700 }}>{compactNumber(strongSignal)}</strong>
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

// --- Props de PlatformCharts ---
export interface PublicationGraphData {
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

export interface PlatformChartsProps {
  platform: string;
  recentPublicationData: PublicationGraphData[];
  topChart: PublicationGraphData[];
}

// --- Componente YouTube específico ---
function YoutubeCharts({ recentPublicationData, topChart }: { recentPublicationData: PublicationGraphData[]; topChart: PublicationGraphData[] }) {
  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Vistas por publicación reciente<InfoTip text="Muestra las vistas de las 10 publicaciones más recientes en orden cronológico. Permite identificar tendencias de alcance y detectar picos o caídas." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={recentPublicationData}>
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
              <p className="eyebrow">Interacciones</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Interacciones por publicación<InfoTip text="Desglosa likes, comentarios y compartidos por cada publicación reciente. Las tres líneas permiten comparar qué tipo de interacción domina y cuál contenido genera más conversación." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={recentPublicationData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey="likes" name="Likes" stroke={interactionColors.likes} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="comentarios" name="Comentarios" stroke={interactionColors.comentarios} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="compartidos" name="Compartidos" stroke={interactionColors.compartidos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Top 10</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Contenido con más vistas<InfoTip text="Ranking de las 10 publicaciones con más vistas del periodo. Identifica qué formatos y temas generan mayor consumo en tu audiencia." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topChart}>
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

// --- Componente Facebook específico ---
function FacebookCharts({ recentPublicationData, topChart }: { recentPublicationData: PublicationGraphData[]; topChart: PublicationGraphData[] }) {
  const formattedData = recentPublicationData.map(item => ({ ...item, likesLabel: "Reacciones" }));

  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia (FACEBOOK)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Vistas o alcance reciente<InfoTip text="Muestra las vistas de las 10 publicaciones más recientes en Facebook. En videos usa reproducciones estimadas; en imágenes/texto usa el alcance como proxy." /></h3>
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
              <p className="eyebrow">Interacciones (FACEBOOK)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Reacciones, comentarios y compartidos<InfoTip text="Desglosa las señales de Facebook para distinguir aprecio inmediato, conversación y difusión real." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey="likes" name="Reacciones" stroke={interactionColors.likes} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="comentarios" name="Comentarios" stroke={interactionColors.comentarios} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="compartidos" name="Compartidos" stroke={interactionColors.compartidos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Top 10 (FACEBOOK)</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Publicaciones con más alcance<InfoTip text="Ranking de las 10 publicaciones de Facebook con mayor volumen de vistas o alcance en el periodo seleccionado." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topChart}>
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

// --- Componente Instagram específico ---
function InstagramCharts({ recentPublicationData, topChart }: { recentPublicationData: PublicationGraphData[]; topChart: PublicationGraphData[] }) {
  // Para Instagram, calculamos la métrica "Interacción Profunda" (comentarios + compartidos + guardados)
  // Nota: en graphProcessor.instagram, "compartidos" ya incluye shares + saves.
  const formattedData = recentPublicationData;
  const hasGuardados = formattedData.some((item) => item.guardados > 0);

  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia (INSTAGRAM)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Alcance reciente<InfoTip text="Muestra el alcance (Reach) único de las 10 publicaciones más recientes en Instagram. Refleja cuántas cuentas únicas vieron el contenido." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="vistas" name="Alcance" stroke="#84cc16" fill="rgba(132,204,22,0.18)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Interacciones (INSTAGRAM)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Señales profundas por publicación<InfoTip text="Separa likes, comentarios, compartidos y guardados para identificar qué pieza genera interés real y no solo aprecio rápido." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey="likes" name="Likes" stroke={interactionColors.likes} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="comentarios" name="Comentarios" stroke={interactionColors.comentarios} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="compartidos" name="Compartidos" stroke={interactionColors.compartidos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              {hasGuardados && <Line type="monotone" dataKey="guardados" name="Guardados" stroke={interactionColors.guardados} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Top 10 (INSTAGRAM)</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Publicaciones con más alcance<InfoTip text="Ranking de los contenidos de Instagram con mayor alcance único del periodo analizado." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topChart}>
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

// --- Componente TikTok específico ---
function TiktokCharts({ recentPublicationData, topChart }: { recentPublicationData: PublicationGraphData[]; topChart: PublicationGraphData[] }) {
  const formattedData = recentPublicationData;
  const hasGuardados = formattedData.some((item) => item.guardados > 0);

  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia (TIKTOK)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Vistas recientes<InfoTip text="Muestra las vistas de video totales de las 10 publicaciones más recientes en TikTok. Identifica el alcance orgánico de tu contenido vertical." /></h3>
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
              <p className="eyebrow">Interacciones (TIKTOK)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Señales por video<InfoTip text="Desglosa likes, comentarios, compartidos y guardados para ver si el video solo obtuvo alcance o también generó señales de replicabilidad." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey="likes" name="Likes" stroke={interactionColors.likes} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="comentarios" name="Comentarios" stroke={interactionColors.comentarios} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="compartidos" name="Compartidos" stroke={interactionColors.compartidos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              {hasGuardados && <Line type="monotone" dataKey="guardados" name="Guardados" stroke={interactionColors.guardados} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Top 10 (TIKTOK)</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Videos con más alcance<InfoTip text="Ranking de tus 10 videos de TikTok más populares en vistas dentro del periodo seleccionado." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topChart}>
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

// --- Componente LinkedIn específico ---
function LinkedinCharts({ recentPublicationData, topChart }: { recentPublicationData: PublicationGraphData[]; topChart: PublicationGraphData[] }) {
  const formattedData = recentPublicationData.map(item => ({
    ...item,
    interacciones_totales: item.likes + item.comentarios + item.compartidos
  }));

  return (
    <>
      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tendencia (LINKEDIN)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Impresiones por publicación<InfoTip text="Visualiza las impresiones o vistas estimadas de las publicaciones más recientes de LinkedIn. Mide tu alcance en la red profesional." /></h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={formattedData}>
              <CartesianGrid stroke="rgba(238,241,245,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#9ea3ad", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
              <YAxis tick={{ fill: "#9ea3ad", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="vistas" name="Impresiones" stroke="#84cc16" fill="rgba(132,204,22,0.18)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Engagement (LINKEDIN)</p>
              <h3 style={{ display: "flex", alignItems: "center" }}>Reacciones y Comentarios totales<InfoTip text="Mide el compromiso profesional total sumando interacciones en tus publicaciones de LinkedIn." /></h3>
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
            <p className="eyebrow">Top 10 (LINKEDIN)</p>
            <h3 style={{ display: "flex", alignItems: "center" }}>Publicaciones más destacadas<InfoTip text="Ranking de las 10 publicaciones de LinkedIn con mayor cantidad de impresiones o visualizaciones." /></h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topChart}>
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

// --- Leyenda de colores explicativa ---
function MetricColorsLegend({ platform }: { platform: string }) {
  const isYoutube = platform === "youtube";
  const isInstagram = platform === "instagram";
  const isFacebook = platform === "facebook";
  const isTiktok = platform === "tiktok";
  const hasDetailedSignals = isYoutube || isInstagram || isFacebook || isTiktok;
  const primaryLabel = isInstagram ? "Alcance" : "Vistas / Impresiones";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      padding: "10px 16px",
      background: "rgba(255, 255, 255, 0.02)",
      borderRadius: "8px",
      border: "1px solid rgba(238, 241, 245, 0.06)",
      fontSize: "11px",
      color: "var(--dim)",
      backdropFilter: "blur(8px)",
      margin: "0 0 10px 0",
      flexWrap: "wrap"
    }}>
      <span style={{ fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Guia de Colores en Graficos:
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#84cc16", display: "inline-block", boxShadow: "0 0 8px rgba(132, 204, 22, 0.4)" }} />
        <span>Verde: <strong>{primaryLabel}</strong></span>
      </span>
      {hasDetailedSignals ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: interactionColors.likes, display: "inline-block", boxShadow: "0 0 8px rgba(255, 91, 119, 0.4)" }} />
            <span>Rosa: <strong>{isFacebook ? "Reacciones" : "Likes"}</strong></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: interactionColors.comentarios, display: "inline-block", boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)" }} />
            <span>Azul: <strong>Comentarios</strong></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: interactionColors.compartidos, display: "inline-block", boxShadow: "0 0 8px rgba(255, 203, 87, 0.4)" }} />
            <span>Amarillo: <strong>Compartidos</strong></span>
          </span>
          {(isInstagram || isTiktok) && (
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: interactionColors.guardados, display: "inline-block", boxShadow: "0 0 8px rgba(45, 212, 191, 0.4)" }} />
              <span>Menta: <strong>Guardados</strong></span>
            </span>
          )}
        </>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: interactionColors.likes, display: "inline-block", boxShadow: "0 0 8px rgba(255, 91, 119, 0.4)" }} />
          <span>Rosa: <strong>Interacciones</strong></span>
        </span>
      )}
    </div>
  );
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      padding: "10px 16px",
      background: "rgba(255, 255, 255, 0.02)",
      borderRadius: "8px",
      border: "1px solid rgba(238, 241, 245, 0.06)",
      fontSize: "11px",
      color: "var(--dim)",
      backdropFilter: "blur(8px)",
      margin: "0 0 10px 0",
      flexWrap: "wrap"
    }}>
      <span style={{ fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        🎨 Guía de Colores en Gráficos:
      </span>
      {isInstagram ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#84cc16", display: "inline-block", boxShadow: "0 0 8px rgba(132, 204, 22, 0.4)" }} />
            <span>Verde: <strong>Alcance</strong> (Exposición real única)</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff5b77", display: "inline-block", boxShadow: "0 0 8px rgba(255, 91, 119, 0.4)" }} />
            <span>Rosa: <strong>Interacción Profunda</strong> (Comentarios + Compartidos + Guardados)</span>
          </span>
        </>
      ) : (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#84cc16", display: "inline-block", boxShadow: "0 0 8px rgba(132, 204, 22, 0.4)" }} />
            <span>Verde: <strong>Vistas / Impresiones</strong> (Consumo del contenido)</span>
          </span>
          {isYoutube ? (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff5b77", display: "inline-block", boxShadow: "0 0 8px rgba(255, 91, 119, 0.4)" }} />
                <span>Rosa: <strong>Likes</strong> (Aprecio inmediato)</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", display: "inline-block", boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)" }} />
                <span>Azul: <strong>Comentarios</strong> (Conversación)</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffcb57", display: "inline-block", boxShadow: "0 0 8px rgba(255, 203, 87, 0.4)" }} />
                <span>Amarillo: <strong>Compartidos</strong> (Difusión y viralidad)</span>
              </span>
            </>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff5b77", display: "inline-block", boxShadow: "0 0 8px rgba(255, 91, 119, 0.4)" }} />
              <span>Rosa: <strong>Interacciones</strong> (Engagement total acumulado)</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

// --- Componente Principal Ruteador de Gráficos ---
export function PlatformCharts({ platform, recentPublicationData, topChart }: PlatformChartsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      <MetricColorsLegend platform={platform} />
      {platform === "youtube" ? (
        <YoutubeCharts recentPublicationData={recentPublicationData} topChart={topChart} />
      ) : platform === "facebook" ? (
        <FacebookCharts recentPublicationData={recentPublicationData} topChart={topChart} />
      ) : platform === "instagram" ? (
        <InstagramCharts recentPublicationData={recentPublicationData} topChart={topChart} />
      ) : platform === "tiktok" ? (
        <TiktokCharts recentPublicationData={recentPublicationData} topChart={topChart} />
      ) : platform === "linkedin" ? (
        <LinkedinCharts recentPublicationData={recentPublicationData} topChart={topChart} />
      ) : (
        <DefaultCharts recentPublicationData={recentPublicationData} topChart={topChart} platform={platform} />
      )}
    </div>
  );
}
