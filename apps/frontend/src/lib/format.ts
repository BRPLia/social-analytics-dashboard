export function compactNumber(value: number): string {
  return new Intl.NumberFormat("es-BO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function percent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function metricValue(value: number | null | undefined, format: string, platform?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    if (platform === "instagram" && (format === "percent" || format === "seconds")) {
      return "n/a";
    }
    if (platform === "facebook" && (format === "percent" || format === "seconds")) {
      return "n/a";
    }
    return "-";
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "seconds") return `${value.toFixed(1)}s`;
  if (format === "compact_signed") return `${value >= 0 ? "+" : ""}${compactNumber(value)}`;
  return compactNumber(value);
}

export function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
  };
  return labels[platform] ?? platform;
}
