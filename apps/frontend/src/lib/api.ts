import type { DashboardPayload, PlatformId, ResetDataSummary, SyncRunRecord, SyncSummary } from "./types";

export async function fetchDashboard(): Promise<DashboardPayload> {
  const response = await fetch(`/api/dashboard`);
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<DashboardPayload>;
}

export async function syncAll(): Promise<SyncSummary> {
  return postSync("/api/sync");
}

export async function syncPlatform(platform: PlatformId): Promise<SyncSummary> {
  return postSync(`/api/sync/${platform}`);
}

export async function syncAccount(platform: PlatformId, accountId: number): Promise<SyncSummary> {
  return postSync(`/api/sync/${platform}/${accountId}`);
}

export async function fetchSyncRuns(): Promise<SyncRunRecord[]> {
  const response = await fetch("/api/sync-runs");
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<SyncRunRecord[]>;
}

export async function resetDashboardData(): Promise<ResetDataSummary> {
  const response = await fetch("/api/admin/reset-data", { method: "POST" });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<ResetDataSummary>;
}

export async function loadDemoData(): Promise<{ status: string }> {
  const response = await fetch("/api/admin/demo-data", { method: "POST" });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<{ status: string }>;
}

export async function unloadDemoData(): Promise<{ status: string }> {
  const response = await fetch("/api/admin/demo-data", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<{ status: string }>;
}

async function postSync(path: string): Promise<SyncSummary> {
  const response = await fetch(path, { method: "POST" });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<SyncSummary>;
}
