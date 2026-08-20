export interface SettingsAccount {
  id: number;
  platform: string;
  external_id: string;
  name: string;
  handle: string;
  url: string;
  enabled: boolean;
  status: string;
  last_sync_at: string | null;
  metadata: Record<string, any>;
}

export interface SettingsChannel {
  id: string;
  name: string;
  color: string;
  status: string;
  accounts: SettingsAccount[];
}

export interface CredentialResponse {
  id: number;
  credential_key: string;
  credential_value: string;
  platform: string;
  label: string;
  status: string;
  last_validated_at: string | null;
  created_at: string;
}

export interface IntegrationCredentialResponse {
  id: number | null;
  channel_id: string;
  platform: string;
  credential_key: string;
  credential_value: string;
  label: string;
  status: string;
  last_validated_at: string | null;
  created_at: string | null;
}

export interface ValidationResponse {
  status: string;
  credential_key: string;
  error: string | null;
  last_validated_at: string | null;
}

export interface MetaDiscoveredAccount {
  id: string;
  name: string;
  platform: "facebook" | "instagram";
  linked_page_id: string;
  linked_page_name: string;
  username?: string;
  category?: string;
  token_available: boolean;
}

export interface MetaDiscoveryResponse {
  status: string;
  pages: MetaDiscoveredAccount[];
  instagram_accounts: MetaDiscoveredAccount[];
}

export async function fetchIntegrationCredentials(): Promise<IntegrationCredentialResponse[]> {
  const response = await fetch("/api/settings/integration-credentials");
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<IntegrationCredentialResponse[]>;
}

export async function setIntegrationCredential(
  channelId: string,
  platform: string,
  key: string,
  value: string,
  label: string = ""
): Promise<any> {
  const response = await fetch(`/api/settings/integration-credentials/${channelId}/${platform}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential_value: value,
      label,
    }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function validateIntegrationCredential(
  channelId: string,
  platform: string,
  key: string
): Promise<ValidationResponse> {
  const response = await fetch(`/api/settings/integration-credentials/${channelId}/${platform}/${key}/validate`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<ValidationResponse>;
}

export async function discoverMetaAccounts(token: string): Promise<MetaDiscoveryResponse> {
  const response = await fetch("/api/settings/meta/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error(err.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<MetaDiscoveryResponse>;
}

export async function fetchSettingsChannels(): Promise<SettingsChannel[]> {
  const response = await fetch("/api/settings/channels");
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<SettingsChannel[]>;
}

export async function createSettingsChannel(id: string, name: string, color: string): Promise<any> {
  const response = await fetch("/api/settings/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, color }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error(err.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export async function updateSettingsChannel(id: string, name?: string, color?: string): Promise<any> {
  const response = await fetch(`/api/settings/channels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function deleteSettingsChannel(id: string): Promise<any> {
  const response = await fetch(`/api/settings/channels/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function createSettingsAccount(
  channelId: string,
  platform: string,
  externalId: string,
  name: string,
  handle: string = "",
  url: string = ""
): Promise<any> {
  const response = await fetch("/api/settings/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel_id: channelId,
      platform,
      external_id: externalId,
      name,
      handle,
      url,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error(err.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export async function updateSettingsAccount(accountId: number, payload: {
  enabled?: boolean;
  external_id?: string;
  name?: string;
  handle?: string;
  url?: string;
}): Promise<any> {
  const response = await fetch(`/api/settings/accounts/${accountId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function deleteSettingsAccount(accountId: number): Promise<any> {
  const response = await fetch(`/api/settings/accounts/${accountId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function fetchSettingsCredentials(): Promise<CredentialResponse[]> {
  const response = await fetch("/api/settings/credentials");
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<CredentialResponse[]>;
}

export async function setSettingsCredential(
  key: string,
  value: string,
  platform: string,
  label: string = ""
): Promise<any> {
  const response = await fetch(`/api/settings/credentials/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential_value: value,
      platform,
      label,
    }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function deleteSettingsCredential(key: string): Promise<any> {
  const response = await fetch(`/api/settings/credentials/${key}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function validateSettingsCredential(key: string): Promise<ValidationResponse> {
  const response = await fetch(`/api/settings/credentials/${key}/validate`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<ValidationResponse>;
}
