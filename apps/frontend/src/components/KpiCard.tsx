import type { ReactNode } from "react";

interface KpiCardProps {
  label: ReactNode;
  value: string;
  delta?: string;
  icon: ReactNode;
  tone?: "normal" | "pending";
}

export function KpiCard({ label, value, delta, icon, tone = "normal" }: KpiCardProps) {
  return (
    <article className={`kpi-card ${tone === "pending" ? "pending-data" : ""}`}>
      <div className="kpi-icon">{icon}</div>
      <div>
        <p className="eyebrow">{label}</p>
        <strong>{value}</strong>
        {delta ? <span>{delta}</span> : null}
      </div>
    </article>
  );
}
