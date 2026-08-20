import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Facebook,
  Globe2,
  Instagram,
  Plus,
  ShieldCheck,
  Trash2,
  Youtube,
  Eye,
  EyeOff,
  UploadCloud,
  Lock,
  Unlock,
  Search,
  Key,
  BookOpen,
} from "lucide-react";
import {
  fetchSettingsChannels,
  createSettingsChannel,
  updateSettingsChannel,
  deleteSettingsChannel,
  createSettingsAccount,
  updateSettingsAccount,
  deleteSettingsAccount,
  fetchIntegrationCredentials,
  setIntegrationCredential,
  validateIntegrationCredential,
  fetchSettingsCredentials,
  setSettingsCredential,
  validateSettingsCredential,
  discoverMetaAccounts,
  SettingsAccount,
  SettingsChannel,
  IntegrationCredentialResponse,
  CredentialResponse,
  MetaDiscoveredAccount,
} from "../lib/settingsApi";

interface SettingsPanelProps {
  onClose: () => void;
  onRefreshDashboard: () => void;
}

type CredentialView = {
  key: string;
  channelId: string;
  platform: string;
  label: string;
  role: string;
  description: string;
  credential?: IntegrationCredentialResponse;
};

const credentialCatalog: Record<string, Omit<CredentialView, "credential" | "channelId">[]> = {
  youtube: [
    {
      key: "GOOGLE_CLIENT_ID",
      platform: "youtube",
      label: "Google OAuth Client ID",
      role: "OAuth Application",
      description: "ID de cliente obtenido desde tu consola de desarrollador de Google Cloud.",
    },
    {
      key: "GOOGLE_CLIENT_SECRET",
      platform: "youtube",
      label: "Google OAuth Client Secret",
      role: "OAuth Application",
      description: "Clave secreta obtenida desde tu consola de desarrollador de Google Cloud.",
    },
    {
      key: "YOUTUBE_REFRESH_TOKEN",
      platform: "youtube",
      label: "YouTube Analytics Refresh Token",
      role: "Analytics Privado (Gmail)",
      description: "Token maestro de larga duracion obtenido al iniciar sesion con Google.",
    },
  ],
  facebook: [
    {
      key: "META_USER_ACCESS_TOKEN",
      platform: "facebook",
      label: "Meta Graph User Token",
      role: "Facebook Pages",
      description: "Token de acceso obtenido en Facebook Developers para leer alcances y posts.",
    },
  ],
  instagram: [
    {
      key: "META_USER_ACCESS_TOKEN",
      platform: "instagram",
      label: "Meta Graph User Token",
      role: "Instagram Business",
      description: "Token de acceso obtenido en Facebook Developers para leer insights y reels.",
    },
  ],
};

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
  };
  return labels[platform] ?? platform;
}


function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === "youtube") return <Youtube size={size} />;
  if (platform === "facebook") return <Facebook size={size} />;
  if (platform === "instagram") return <Instagram size={size} />;
  return <Globe2 size={size} />;
}

function credentialStatusLabel(status?: string, hasValue = true) {
  if (!hasValue) return "No configurada";
  if (status === "valid") return "Valida";
  if (status === "expired") return "Invalida";
  return "Pendiente";
}

function normalizeTikTokProfile(input: string) {
  const value = input.trim();
  if (!value) return "";
  if (value.includes("tiktok.com")) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      const handle = url.pathname.split("/").find((part) => part.startsWith("@"));
      return (handle || "").replace(/^@/, "");
    } catch {
      return value.replace(/^@/, "");
    }
  }
  return value.replace(/^@/, "");
}

function tikTokUrl(profile: string) {
  return profile ? `https://www.tiktok.com/@${profile}` : "";
}

export function SettingsPanel({ onClose, onRefreshDashboard }: SettingsPanelProps) {
  const [channels, setChannels] = useState<SettingsChannel[]>([]);
  const [credentials, setCredentials] = useState<IntegrationCredentialResponse[]>([]);
  const [globalCredentials, setGlobalCredentials] = useState<CredentialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for new Brand form
  const [showNewBrandModal, setShowNewBrandModal] = useState(false);
  const [newBrandId, setNewBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("#84CC16");

  // States for new Account form
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [newAccPlatform, setNewAccPlatform] = useState("youtube");
  const [newAccExternalId, setNewAccExternalId] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [newAccHandle, setNewAccHandle] = useState("");
  const [newAccUrl, setNewAccUrl] = useState("");
  const [metaToken, setMetaToken] = useState("");
  const [metaDiscovering, setMetaDiscovering] = useState(false);
  const [metaDiscoverError, setMetaDiscoverError] = useState<string | null>(null);
  const [metaDiscovered, setMetaDiscovered] = useState<{
    pages: MetaDiscoveredAccount[];
    instagram_accounts: MetaDiscoveredAccount[];
  }>({ pages: [], instagram_accounts: [] });
  const [selectedMetaAccount, setSelectedMetaAccount] = useState<MetaDiscoveredAccount | null>(null);

  // States for editing credential
  const [editingCredKey, setEditingCredKey] = useState<string | null>(null);
  const [editingCredValue, setEditingCredValue] = useState("");
  const [validatingKeys, setValidatingKeys] = useState<Record<string, boolean>>({});

  // Visual locks & secret toggles
  const [showSecretKeys, setShowSecretKeys] = useState<Record<string, boolean>>({});
  const [unlockedKeys, setUnlockedKeys] = useState<Record<string, boolean>>({});

  // Channel resolution in Modal
  const [resolvingHandle, setResolvingHandle] = useState(false);
  const [resolvedChannel, setResolvedChannel] = useState<{
    channel_id: string;
    title: string;
    handle: string;
    thumbnail_url: string;
    subscriber_count: number;
    video_count: number;
  } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // OAuth starting state per brand
  const [oauthStartingBrands, setOauthStartingBrands] = useState<Record<string, boolean>>({});

  const credentialsByScope = useMemo(() => {
    return new Map(
      credentials.map((credential) => [
        credentialScopeKey(credential.channel_id, credential.platform, credential.credential_key),
        credential,
      ])
    );
  }, [credentials]);

  const allAccounts = useMemo(() => channels.flatMap((channel) => channel.accounts), [channels]);

  const realAccounts = useMemo(() => {
    return allAccounts.filter((account) => !account.metadata?.placeholder);
  }, [allAccounts]);

  function credentialScopeKey(channelId: string, platform: string, key: string) {
    return `${channelId.toUpperCase()}::${platform.toLowerCase()}::${key.toUpperCase()}`;
  }

  function credentialViewsForAccount(channelId: string, account: SettingsAccount): CredentialView[] {
    const views: CredentialView[] = [];
    credentialCatalog[account.platform]?.forEach((item) => {
      views.push({
        ...item,
        channelId,
        platform: account.platform,
        credential: credentialsByScope.get(credentialScopeKey(channelId, account.platform, item.key)),
      });
    });
    return views;
  }

  function credentialFor(channelId: string, platform: string, key: string) {
    return credentialsByScope.get(credentialScopeKey(channelId, platform, key));
  }

  function setupStatusForBrand(channel: SettingsChannel) {
    const accounts = channel.accounts.filter((account) => !account.metadata?.placeholder);
    const required = accounts.flatMap((account) => credentialViewsForAccount(channel.id, account));
    const valid = required.filter((item) => item.credential?.status === "valid").length;
    return {
      accounts,
      required,
      valid,
      total: required.length,
      ready: required.length > 0 && valid === required.length,
    };
  }

  useEffect(() => {
    loadSettingsData();
  }, []);

  async function loadSettingsData() {
    setLoading(true);
    setError(null);
    try {
      const [chData, credData, globalData] = await Promise.all([
        fetchSettingsChannels(),
        fetchIntegrationCredentials(),
        fetchSettingsCredentials(),
      ]);
      setChannels(chData);
      setCredentials(credData);
      setGlobalCredentials(globalData);
    } catch (err: any) {
      setError(err.message || "Error al cargar la configuracion.");
    } finally {
      setLoading(false);
    }
  }

  // --- Brand Actions ---
  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrandId.trim() || !newBrandName.trim()) return;
    try {
      await createSettingsChannel(newBrandId.trim().toUpperCase(), newBrandName.trim(), newBrandColor);
      setShowNewBrandModal(false);
      setNewBrandId("");
      setNewBrandName("");
      loadSettingsData();
      onRefreshDashboard();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  async function handleDeleteBrand(id: string) {
    if (!confirm(`Seguro que deseas eliminar la marca ${id}? Se borraran permanentemente todos sus canales, contenidos y reportes historicos de la base de datos.`)) return;
    try {
      await deleteSettingsChannel(id);
      loadSettingsData();
      onRefreshDashboard();
    } catch (err: any) {
      alert(`Error al eliminar marca: ${err.message}`);
    }
  }

  // --- Account Actions ---
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChannelId) return;
    const isMeta = newAccPlatform === "facebook" || newAccPlatform === "instagram";
    const isTikTok = newAccPlatform === "tiktok";
    const tikTokProfile = isTikTok ? normalizeTikTokProfile(newAccExternalId) : "";
    const externalId = isMeta ? selectedMetaAccount?.id : isTikTok ? tikTokProfile : resolvedChannel?.channel_id || newAccExternalId.trim();
    const accountName = isMeta ? selectedMetaAccount?.name || "" : isTikTok ? newAccName.trim() || `@${tikTokProfile}` : newAccName.trim();
    const accountHandle = isMeta && selectedMetaAccount?.username ? `@${selectedMetaAccount.username}` : isTikTok ? `@${tikTokProfile}` : newAccHandle.trim();
    const accountUrl = isMeta
      ? newAccPlatform === "facebook"
        ? `https://www.facebook.com/${externalId}`
        : selectedMetaAccount?.username
          ? `https://www.instagram.com/${selectedMetaAccount.username}`
          : ""
      : isTikTok
        ? newAccUrl.trim() || tikTokUrl(tikTokProfile)
        : newAccUrl.trim() || (newAccPlatform === "youtube" && externalId ? `https://www.youtube.com/channel/${externalId}` : "");
    if (!externalId || !accountName) return;
    try {
      await createSettingsAccount(
        selectedChannelId,
        newAccPlatform,
        externalId,
        accountName,
        accountHandle,
        accountUrl
      );
      if (isMeta && metaToken.trim()) {
        await setIntegrationCredential(
          selectedChannelId,
          newAccPlatform,
          "META_USER_ACCESS_TOKEN",
          metaToken.trim(),
          newAccPlatform === "facebook" ? "Meta Graph Token Facebook" : "Meta Graph Token Instagram"
        );
      }
      setShowNewAccountModal(false);
      setNewAccExternalId("");
      setNewAccName("");
      setNewAccHandle("");
      setNewAccUrl("");
      setMetaToken("");
      setMetaDiscovered({ pages: [], instagram_accounts: [] });
      setSelectedMetaAccount(null);
      setMetaDiscoverError(null);
      setResolvedChannel(null);
      setResolveError(null);
      loadSettingsData();
      onRefreshDashboard();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  async function handleToggleAccount(accountId: number, currentEnabled: boolean) {
    try {
      await updateSettingsAccount(accountId, { enabled: !currentEnabled });
      loadSettingsData();
      onRefreshDashboard();
    } catch (err: any) {
      alert(`Error al cambiar estado de la cuenta: ${err.message}`);
    }
  }

  async function handleDeleteAccount(accountId: number) {
    if (!confirm("Seguro que deseas eliminar esta red social? Esto borrara permanentemente todos sus contenidos e historicos de metricas.")) return;
    try {
      await deleteSettingsAccount(accountId);
      loadSettingsData();
      onRefreshDashboard();
    } catch (err: any) {
      alert(`Error al eliminar cuenta: ${err.message}`);
    }
  }

  async function handleDiscoverMetaAccounts() {
    if (!metaToken.trim()) return;
    setMetaDiscovering(true);
    setMetaDiscoverError(null);
    setSelectedMetaAccount(null);
    try {
      const data = await discoverMetaAccounts(metaToken.trim());
      setMetaDiscovered({
        pages: data.pages || [],
        instagram_accounts: data.instagram_accounts || [],
      });
    } catch (err: any) {
      setMetaDiscoverError(err.message || "No se pudieron leer tus cuentas de Meta.");
    } finally {
      setMetaDiscovering(false);
    }
  }

  // --- Global Credential Actions ---
  async function handleSaveGlobalCredential(key: string, value: string, platform: string, label: string) {
    try {
      await setSettingsCredential(key, value, platform, label);
      setEditingCredKey(null);
      setEditingCredValue("");
      loadSettingsData();
    } catch (err: any) {
      alert(`Error al guardar credencial global: ${err.message}`);
    }
  }

  async function handleValidateGlobalCredential(key: string) {
    const validationKey = `GLOBAL::${key}`;
    setValidatingKeys((prev) => ({ ...prev, [validationKey]: true }));
    try {
      const res = await validateSettingsCredential(key);
      if (res.status === "valid") {
        alert("Validacion exitosa.");
      } else {
        alert(`Error: ${res.error || "Clave de API invalida."}`);
      }
      loadSettingsData();
    } catch (err: any) {
      alert(`Error al validar: ${err.message}`);
    } finally {
      setValidatingKeys((prev) => ({ ...prev, [validationKey]: false }));
    }
  }

  // --- OAuth Actions ---
  async function handleStartGoogleOAuth(channelId: string) {
    setOauthStartingBrands((prev) => ({ ...prev, [channelId]: true }));
    try {
      const response = await fetch("/api/settings/youtube/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Error al iniciar flujo OAuth.");
      }
      const data = await response.json();
      if (data.auth_url) {
        const oauthWindow = window.open(data.auth_url, "_blank");
        const checkWindow = setInterval(() => {
          if (!oauthWindow || oauthWindow.closed) {
            clearInterval(checkWindow);
            loadSettingsData();
          }
        }, 1500);
      }
    } catch (err: any) {
      alert(`Error al iniciar vinculacion con Google: ${err.message}`);
    } finally {
      setOauthStartingBrands((prev) => ({ ...prev, [channelId]: false }));
    }
  }

  // --- YouTube Resolver Actions ---
  async function handleResolveYouTubeChannel() {
    if (!newAccExternalId.trim()) return;
    setResolvingHandle(true);
    setResolveError(null);
    setResolvedChannel(null);
    try {
      const response = await fetch("/api/settings/youtube/resolve-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_str: newAccExternalId.trim() }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "No se pudo encontrar el canal.");
      }
      const data = await response.json();
      setResolvedChannel(data);
      setNewAccName(data.title);
      setNewAccHandle(data.handle);
      setNewAccUrl(`https://www.youtube.com/channel/${data.channel_id}`);
    } catch (err: any) {
      setResolveError(err.message || "Error al buscar el canal.");
    } finally {
      setResolvingHandle(false);
    }
  }

  // --- Google Client JSON OAuth file parser ---
  async function handleJsonUpload(e: React.ChangeEvent<HTMLInputElement>, channelId: string) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async (event) => {
      try {
        const content = JSON.parse(event.target?.result as string);
        const data = content.installed || content.web;
        if (!data || !data.client_id || !data.client_secret) {
          throw new Error("El JSON no tiene una estructura OAuth de Google valida.");
        }
        
        await setIntegrationCredential(channelId, "youtube", "GOOGLE_CLIENT_ID", data.client_id, "Google OAuth Client ID");
        await setIntegrationCredential(channelId, "youtube", "GOOGLE_CLIENT_SECRET", data.client_secret, "Google OAuth Client Secret");
        
        alert("Credenciales del archivo JSON importadas y guardadas correctamente.");
        loadSettingsData();
      } catch (err: any) {
        alert(`Error al leer archivo JSON: ${err.message}`);
      }
    };
    fileReader.readAsText(file);
  }

  // --- Credential Actions ---
  async function handleSaveCredential(channelId: string, platform: string, key: string, label: string) {
    if (!editingCredValue.trim()) return;
    try {
      await setIntegrationCredential(channelId, platform, key, editingCredValue.trim(), label);
      setEditingCredKey(null);
      setEditingCredValue("");
      loadSettingsData();
    } catch (err: any) {
      alert(`Error al guardar credencial: ${err.message}`);
    }
  }

  async function handleValidateCredential(channelId: string, platform: string, key: string) {
    const validationKey = credentialScopeKey(channelId, platform, key);
    setValidatingKeys((prev) => ({ ...prev, [validationKey]: true }));
    try {
      const res = await validateIntegrationCredential(channelId, platform, key);
      if (res.status === "valid") {
        alert("Validacion exitosa. La credencial esta conectada correctamente.");
      } else {
        alert(`Error de validacion: ${res.error || "Token expirado o invalido."}`);
      }
      loadSettingsData();
    } catch (err: any) {
      alert(`Error al validar: ${err.message}`);
    } finally {
      setValidatingKeys((prev) => ({ ...prev, [validationKey]: false }));
    }
  }

  function renderAccountCredentialPanel(channelId: string, account: SettingsAccount) {
    if (account.platform === "tiktok") {
      const apifyToken = globalCredentials.find((credential) => credential.credential_key === "APIFY_API_TOKEN");
      const isReady = apifyToken?.status === "valid";
      return (
        <div className="settings-muted-note">
          TikTok usa la credencial global <strong>APIFY_API_TOKEN</strong>. Estado:{" "}
          <span className={`credential-badge ${isReady ? "valid" : "expired"}`} style={{ display: "inline-flex", marginLeft: "4px" }}>
            {isReady ? "Valida" : "No configurada"}
          </span>
        </div>
      );
    }
    const views = credentialViewsForAccount(channelId, account);
    if (views.length === 0) {
      return <p className="settings-muted-note">Esta red no necesita credenciales configurables por ahora.</p>;
    }

    return (
      <div className="network-credential-group embedded">
        <div className="network-credential-head" style={{ marginBottom: "6px" }}>
          <span className="platform-icon-pill">
            <PlatformIcon platform={account.platform} size={14} />
          </span>
          <div>
            <strong>{platformLabel(account.platform)}</strong>
            <small>{account.name}</small>
          </div>
        </div>

        {account.platform === "youtube" && (
          <details className="mini-guide">
            <summary className="mini-guide-summary">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><BookOpen size={12} /> Guia rapida de Google Cloud</span>
              <span>v</span>
            </summary>
            <div className="mini-guide-content">
              <ol>
                <li>Crea un proyecto en <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>.</li>
                <li>Habilita <strong>YouTube Data API v3</strong> y <strong>YouTube Analytics API</strong>.</li>
                <li>Configura OAuth Consent Screen como <strong>External / Testing</strong> y agrega tu Gmail en <strong>Test users</strong>.</li>
                <li>Crea un <strong>OAuth Client ID</strong> de tipo aplicacion web.</li>
                <li>Agrega esta URI de redireccionamiento:
                  <code style={{ display: "block", background: "rgba(0,0,0,0.3)", padding: "4px", margin: "4px 0", borderRadius: "4px" }}>http://localhost:9512/api/settings/youtube/oauth/callback</code>
                </li>
                <li>Descarga el JSON y cargalo en la tarjeta OAuth del canal.</li>
              </ol>
            </div>
          </details>
        )}

        {account.platform === "facebook" && (
          <details className="mini-guide">
            <summary className="mini-guide-summary">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><BookOpen size={12} /> Guia rapida de Meta Pages</span>
              <span>v</span>
            </summary>
            <div className="mini-guide-content">
              <ol>
                <li>Entra al <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer</a>.</li>
                <li>Agrega permisos clave: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_read_user_content</code>, <code>read_insights</code>.</li>
                <li>Genera tu token y extiendelo en el <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer">Access Token Debugger</a>.</li>
              </ol>
            </div>
          </details>
        )}

        {account.platform === "instagram" && (
          <details className="mini-guide">
            <summary className="mini-guide-summary">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><BookOpen size={12} /> Guia rapida de Instagram Insights</span>
              <span>v</span>
            </summary>
            <div className="mini-guide-content">
              <ol>
                <li>Usa el <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer</a>.</li>
                <li>Selecciona <code>instagram_basic</code>, <code>instagram_manage_insights</code>, <code>pages_show_list</code> y <code>read_insights</code>.</li>
                <li>Puede ser el mismo token que Facebook, pero se guarda separado para sincronizar cada red con su propia configuracion.</li>
              </ol>
            </div>
          </details>
        )}

        {account.platform === "youtube" ? (
          renderYouTubeOAuthCard(channelId)
        ) : (
          <div className="brand-credential-stack" style={{ marginTop: "10px" }}>
            {views.map((view) => renderCredentialCard(view, true))}
          </div>
        )}
      </div>
    );
  }

  function renderAccountSummary(channelId: string, account: SettingsAccount) {
    const credentialViews = credentialViewsForAccount(channelId, account);
    const credentialSummary =
      account.platform === "tiktok"
        ? "Apify global"
        : `${credentialViews.filter((view) => view.credential?.status === "valid").length}/${credentialViews.length} listas`;
    return (
      <div key={account.id} className={`brand-account-item account-summary-card ${account.enabled ? "enabled" : "paused"}`}>
        <div className="account-summary-main">
          <div className="account-info-compact">
            <span className="platform-icon-pill">
              <PlatformIcon platform={account.platform} size={14} />
            </span>
            <div>
              <strong style={{ fontSize: "13px" }}>{account.name}</strong>
              <div className="account-subline">
                {platformLabel(account.platform)}
                {account.handle ? ` · ${account.handle}` : ""}
                {account.last_sync_at ? ` · sync ${new Date(account.last_sync_at).toLocaleDateString()}` : " · sin sync"}
              </div>
              <code className="account-id-chip">{account.external_id}</code>
            </div>
          </div>
          <div className="account-actions">
            <span className={`brand-readiness ${account.status === "ok" ? "ready" : "pending"}`}>
              {account.status}
            </span>
            <button
              onClick={() => handleToggleAccount(account.id, account.enabled)}
              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "auto" }}
            >
              {account.enabled ? "Pausar" : "Activar"}
            </button>
            <button
              className="danger-action"
              onClick={() => handleDeleteAccount(account.id)}
              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "auto", opacity: 0.82 }}
            >
              <Trash2 size={11} /> Quitar
            </button>
          </div>
        </div>
        <details className="account-credentials-details">
          <summary>
            <span>Credenciales y guia</span>
            <small>{credentialSummary}</small>
          </summary>
          {renderAccountCredentialPanel(channelId, account)}
        </details>
      </div>
    );
  }

  function renderYouTubeOAuthCard(channelId: string) {
    const clientId = credentialFor(channelId, "youtube", "GOOGLE_CLIENT_ID");
    const clientSecret = credentialFor(channelId, "youtube", "GOOGLE_CLIENT_SECRET");
    const refreshToken = credentialFor(channelId, "youtube", "YOUTUBE_REFRESH_TOKEN");
    const hasProject = Boolean(clientId && clientSecret);
    const hasGmail = Boolean(refreshToken);
    const clientIdView: CredentialView = {
      key: "GOOGLE_CLIENT_ID",
      channelId,
      platform: "youtube",
      label: "Client ID de Google",
      role: "Proyecto OAuth",
      description: "Se guarda junto al Client Secret para conectar YouTube Analytics.",
      credential: clientId,
    };
    const clientSecretView: CredentialView = {
      key: "GOOGLE_CLIENT_SECRET",
      channelId,
      platform: "youtube",
      label: "Client Secret de Google",
      role: "Proyecto OAuth",
      description: "Se usa solo para generar y renovar el acceso privado de Analytics.",
      credential: clientSecret,
    };

    return (
      <div className="oauth-card">
        <div className="credential-meta">
          <div className="credential-title-group">
            <span className="platform-icon-pill">
              <Youtube size={15} />
            </span>
            <div>
              <strong>Google OAuth del canal</strong>
              <span>YouTube Analytics privado</span>
            </div>
          </div>
          <span className={`credential-badge ${hasGmail ? "valid" : hasProject ? "pending" : "expired"}`}>
            {hasGmail ? <CheckCircle2 size={12} /> : hasProject ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
            {hasGmail ? "Gmail conectado" : hasProject ? "Proyecto listo" : "Falta JSON"}
          </span>
        </div>

        <label className="oauth-upload">
          <UploadCloud size={18} />
          <span>Importar client_secret.json</span>
          <small>Extrae Client ID y Client Secret automaticamente.</small>
          <input type="file" accept=".json" onChange={(e) => handleJsonUpload(e, channelId)} />
        </label>

        <div className="oauth-status-grid">
          <div className={hasProject ? "oauth-status ready" : "oauth-status missing"}>
            <strong>Proyecto OAuth</strong>
            <span>{hasProject ? "Client ID y Secret guardados" : "Carga el JSON o edita manualmente"}</span>
          </div>
          <div className={hasGmail ? "oauth-status ready" : "oauth-status missing"}>
            <strong>Gmail del canal</strong>
            <span>{hasGmail ? "Refresh token guardado" : "Pendiente de vinculacion"}</span>
          </div>
        </div>

        <div className="oauth-actions">
          <button
            type="button"
            className="primary-action"
            disabled={oauthStartingBrands[channelId] || !hasProject}
            onClick={() => handleStartGoogleOAuth(channelId)}
          >
            <Youtube size={16} /> {oauthStartingBrands[channelId] ? "Abriendo Google..." : hasGmail ? "Reconectar Gmail" : "Conectar Gmail"}
          </button>
          {!hasProject && <small>Primero importa el JSON de Google Cloud o completa las credenciales avanzadas.</small>}
        </div>

        <details className="advanced-credentials">
          <summary>Editar credenciales avanzadas</summary>
          <div className="brand-credential-stack">
            {renderCredentialCard(clientIdView, true)}
            {renderCredentialCard(clientSecretView, true)}
          </div>
        </details>
      </div>
    );
  }

  function renderCredentialCard(view: CredentialView, compact = false) {
    const cred = view.credential;
    const key = cred?.credential_key ?? view.key;
    const channelId = cred?.channel_id ?? view.channelId;
    const platform = cred?.platform && cred.platform !== "meta" ? cred.platform : view.platform;
    const hasValue = Boolean(cred?.credential_value);
    
    // RED / GREEN Logic
    const status = (hasValue && cred?.status === "valid") ? "valid" : "expired";
    
    const scopedKey = credentialScopeKey(channelId, platform, key);
    const isValidating = validatingKeys[scopedKey] || false;
    
    const isEditing = editingCredKey === scopedKey;
    const isUnlocked = unlockedKeys[scopedKey] || !cred;
    const showSecret = showSecretKeys[scopedKey] || false;

    return (
      <div key={scopedKey} className={`credential-card ${compact ? "credential-card-compact" : "settings-card"}`}>
        <div className="credential-meta">
          <div className="credential-title-group">
            <span className="platform-icon-pill">
              <PlatformIcon platform={platform} size={15} />
            </span>
            <div>
              <strong>{view.label}</strong>
              <span>{view.role} - {platformLabel(platform)}</span>
            </div>
          </div>
          <span className={`credential-badge ${status}`}>
            {status === "valid" && <CheckCircle2 size={12} />}
            {status === "expired" && <AlertTriangle size={12} />}
            {credentialStatusLabel(status, hasValue)}
          </span>
        </div>

        <p className="credential-description">{view.description}</p>

        {isEditing || isUnlocked ? (
          <div className="credential-input-group">
            <div style={{ display: "flex", gap: "8px", width: "100%", position: "relative" }}>
              <input
                type={showSecret ? "text" : "password"}
                placeholder={`Pega tu ${view.label} aquí...`}
                value={isEditing ? editingCredValue : ""}
                onChange={(e) => setEditingCredValue(e.target.value)}
                style={{ paddingRight: "40px", flexGrow: 1 }}
              />
              <button
                type="button"
                className="icon-action"
                onClick={() => setShowSecretKeys(prev => ({ ...prev, [scopedKey]: !showSecret }))}
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="primary-action"
                onClick={() => handleSaveCredential(channelId, platform, key, view.label)}
              >
                Guardar
              </button>
              {cred && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCredKey(null);
                    setEditingCredValue("");
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="credential-value-display">
            <div className="credential-value-row">
              <span className="masked-value">••••••••••••••••</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="icon-action"
                  onClick={() => {
                    setEditingCredKey(scopedKey);
                    setEditingCredValue(cred?.credential_value || "");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Lock size={12} /> Editar
                </button>
                <button
                  type="button"
                  className="primary-action"
                  disabled={isValidating}
                  onClick={() => handleValidateCredential(channelId, platform, key)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <ShieldCheck size={12} /> {isValidating ? "Validando..." : "Validar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderGlobalCredentialCard(key: string, label: string, description: string, platform = "youtube") {
    const cred = globalCredentials.find((c) => c.credential_key === key);
    const hasValue = Boolean(cred?.credential_value);
    
    // RED / GREEN Logic
    const status = (hasValue && cred?.status === "valid") ? "valid" : "expired";
    
    const scopedKey = `GLOBAL::${key}`;
    const isValidating = validatingKeys[scopedKey] || false;

    const isEditing = editingCredKey === scopedKey;
    const isUnlocked = !hasValue || isEditing;
    const showSecret = showSecretKeys[scopedKey] || false;

    return (
      <div key={scopedKey} className="credential-card settings-card">
        <div className="credential-meta">
          <div className="credential-title-group">
            <span className="platform-icon-pill">
              <Key size={15} />
            </span>
            <div>
              <strong>{label}</strong>
              <span>Credencial Global</span>
            </div>
          </div>
          <span className={`credential-badge ${status}`}>
            {status === "valid" && <CheckCircle2 size={12} />}
            {status === "expired" && <AlertTriangle size={12} />}
            {credentialStatusLabel(status, hasValue)}
          </span>
        </div>

        <p className="credential-description">{description}</p>

        {isUnlocked ? (
          <div className="credential-input-group">
            <div style={{ display: "flex", gap: "8px", width: "100%", position: "relative" }}>
              <input
                type={showSecret ? "text" : "password"}
                placeholder={`Pega tu ${label} aquí...`}
                value={isEditing ? editingCredValue : ""}
                onChange={(e) => setEditingCredValue(e.target.value)}
                style={{ paddingRight: "40px", flexGrow: 1 }}
              />
              <button
                type="button"
                className="icon-action"
                onClick={() => setShowSecretKeys(prev => ({ ...prev, [scopedKey]: !showSecret }))}
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="primary-action"
                onClick={() => handleSaveGlobalCredential(key, editingCredValue, platform, label)}
              >
                Guardar
              </button>
              {hasValue && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCredKey(null);
                    setEditingCredValue("");
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="credential-value-display">
            <div className="credential-value-row">
              <span className="masked-value">••••••••••••••••</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="icon-action"
                  onClick={() => {
                    setEditingCredKey(scopedKey);
                    setEditingCredValue(cred?.credential_value || "");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Lock size={12} /> Editar
                </button>
                <button
                  type="button"
                  className="primary-action"
                  disabled={isValidating}
                  onClick={() => handleValidateGlobalCredential(key)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <ShieldCheck size={12} /> {isValidating ? "Validando..." : "Validar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="settings-panel-overlay">
      <div className="settings-header">
        <div className="settings-title">
          <h2>Configuracion y onboarding</h2>
          <p>Administra marcas, redes y credenciales desde un flujo ordenado por marca.</p>
        </div>
        <button className="primary-action secondary-style" onClick={onClose}>
          Volver al Panel Principal
        </button>
      </div>

      <div className="settings-overview">
        <div className="settings-overview-card">
          <span>Marcas</span>
          <strong>{channels.length}</strong>
        </div>
        <div className="settings-overview-card">
          <span>Redes reales conectadas</span>
          <strong>{realAccounts.length}</strong>
        </div>
        <div className="settings-overview-card">
          <span>Credenciales validas</span>
          <strong>{credentials.filter((credential) => credential.status === "valid").length}/{credentials.length}</strong>
        </div>
        <div className="settings-overview-card">
          <span>Flujo recomendado</span>
          <strong>Marca {"->"} Red {"->"} API</strong>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--muted)" }}>
          <div className="spin" style={{ display: "inline-block", fontSize: "24px", marginBottom: "12px" }}><Database size={24} /></div>
          <p>Cargando configuracion del sistema...</p>
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(255, 91, 119, 0.1)", border: "1px solid var(--degraded)", borderRadius: "8px", padding: "16px", color: "#ffadb9" }}>
          <strong>Error de configuracion:</strong> {error}
          <button style={{ marginLeft: "12px", padding: "4px 8px", fontSize: "12px" }} onClick={loadSettingsData}>Reintentar</button>
        </div>
      )}

      {!loading && !error && (
            <div style={{ display: "grid", gap: "20px" }}>
              
              <details className="settings-card global-settings-card">
                <summary className="global-settings-summary">
                  <span><Globe2 size={18} /> Credenciales globales</span>
                  <small>Claves compartidas por todas las marcas</small>
                </summary>
                <p style={{ color: "var(--muted)", fontSize: "13px", margin: "12px 0 14px" }}>
                  Estas claves sirven para conectores publicos compartidos. Las credenciales privadas de Analytics se configuran dentro de cada marca cuando aplica.
                </p>
                {renderGlobalCredentialCard("YOUTUBE_API_KEY", "YouTube Data API v3", "Clave de API de Google Cloud para buscar canales e informacion publica de videos.")}
                {renderGlobalCredentialCard("APIFY_API_TOKEN", "Apify API Token", "Token global para consultar perfiles publicos de TikTok mediante Clockworks TikTok Profile Scraper.", "tiktok")}
              </details>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
                <h3 style={{ margin: 0 }}>Mis Marcas Conectadas</h3>
                <button
                  className="primary-action"
                  onClick={() => setShowNewBrandModal(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span style={{ fontSize: "16px" }}>+</span> Agregar Nueva Marca
                </button>
              </div>

              {channels.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", border: "1px dashed var(--line)", borderRadius: "12px", background: "rgba(255,255,255,0.01)" }}>
                  <p style={{ color: "var(--muted)" }}>No hay marcas creadas aun. Crea tu primera marca para empezar.</p>
                </div>
              ) : (
                <div className="brands-settings-grid">
                  {channels.map((ch) => {
                    const brandSetup = setupStatusForBrand(ch);
                    return (
                    <div key={ch.id} className="settings-card brand-settings-card" style={{ borderLeftColor: ch.color }}>
                      <div className="brand-settings-header">
                        <div className="brand-settings-title">
                          <div className="brand-color-badge" style={{ backgroundColor: ch.color }} />
                          <span>{ch.name}</span>
                          <small style={{ color: "var(--dim)", fontSize: "11px", fontWeight: "normal" }}>({ch.id})</small>
                        </div>
                        <button
                          className="danger-action"
                          onClick={() => handleDeleteBrand(ch.id)}
                          style={{ padding: "4px 8px", fontSize: "11px", minHeight: "auto" }}
                        >
                          Eliminar Marca
                        </button>
                      </div>

                      <div className="brand-accounts-list">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--dim)" }}>1. Redes conectadas</span>
                          <button
                            className="primary-action"
                            style={{ padding: "2px 6px", fontSize: "11px", minHeight: "auto", border: "none" }}
                            onClick={() => {
                              setSelectedChannelId(ch.id);
                              setResolvedChannel(null);
                              setResolveError(null);
                              setMetaToken("");
                              setMetaDiscovered({ pages: [], instagram_accounts: [] });
                              setMetaDiscoverError(null);
                              setSelectedMetaAccount(null);
                              setShowNewAccountModal(true);
                            }}
                          >
                            <Plus size={12} /> Conectar
                          </button>
                        </div>

                        {brandSetup.accounts.length === 0 ? (
                          <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--dim)", fontStyle: "italic", textAlign: "center" }}>
                            Ninguna red real conectada a esta marca.
                          </p>
                        ) : (
                          brandSetup.accounts.map((acc) => renderAccountSummary(ch.id, acc))
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
      )}

      {/* MODAL: NUEVA MARCA */}
      {showNewBrandModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="settings-card" style={{ width: "100%", maxWidth: "420px" }}>
            <h3 style={{ margin: "0 0 16px" }}>Agregar Nueva Marca</h3>
            <form onSubmit={handleCreateBrand}>
              <div className="settings-form-row">
                <label>ID Corto de la Marca (Ej: MIMARCA)</label>
                <input
                  type="text"
                  placeholder="Ej: MIMARCA"
                  maxLength={10}
                  required
                  value={newBrandId}
                  onChange={(e) => setNewBrandId(e.target.value.toUpperCase())}
                />
              </div>
              <div className="settings-form-row">
                <label>Nombre de la Marca</label>
                <input
                  type="text"
                  placeholder="Ej: Mi Marca"
                  required
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                />
              </div>
              <div className="settings-form-row">
                <label>Color Tematico (CSS/Hex)</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input
                    type="color"
                    style={{ width: "42px", height: "42px", padding: 0, border: "none", cursor: "pointer", background: "transparent" }}
                    value={newBrandColor}
                    onChange={(e) => setNewBrandColor(e.target.value)}
                  />
                  <input
                    type="text"
                    style={{ flexGrow: 1 }}
                    value={newBrandColor}
                    onChange={(e) => setNewBrandColor(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>
                <button type="button" onClick={() => setShowNewBrandModal(false)}>Cancelar</button>
                <button type="submit" className="primary-action">Crear Marca</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA RED SOCIAL CON RESOLUTOR AUTOMATICO */}
      {showNewAccountModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="settings-card" style={{ width: "100%", maxWidth: "460px" }}>
            <h3 style={{ margin: "0 0 16px" }}>Conectar Red Social a {selectedChannelId}</h3>
            <form onSubmit={handleCreateAccount}>
              <div className="settings-form-row">
                <label>Plataforma</label>
                <select value={newAccPlatform} onChange={(e) => {
                  setNewAccPlatform(e.target.value);
                  setResolvedChannel(null);
                  setResolveError(null);
                  setNewAccExternalId("");
                  setNewAccName("");
                  setNewAccHandle("");
                  setNewAccUrl("");
                  setMetaDiscovered({ pages: [], instagram_accounts: [] });
                  setMetaDiscoverError(null);
                  setSelectedMetaAccount(null);
                }}>
                  <option value="youtube">YouTube (Canal)</option>
                  <option value="facebook">Facebook (Pagina)</option>
                  <option value="instagram">Instagram (Cuenta Business)</option>
                  <option value="tiktok">TikTok (Perfil publico)</option>
                </select>
              </div>
              
              {newAccPlatform === "youtube" && (
                <div className="settings-form-row">
                  <label>Enlace del Canal o @Handle</label>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      placeholder="Ej: @micanal o URL del canal..."
                      required
                      value={newAccExternalId}
                      onChange={(e) => setNewAccExternalId(e.target.value)}
                      style={{ flexGrow: 1 }}
                    />
                    <button
                      type="button"
                      className="primary-action"
                      disabled={resolvingHandle || !newAccExternalId.trim()}
                      onClick={handleResolveYouTubeChannel}
                      style={{ padding: "0 12px", minHeight: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Search size={14} /> {resolvingHandle ? "Buscando..." : "Buscar"}
                    </button>
                  </div>

                  <span style={{ fontSize: "11px", color: "var(--dim)" }}>
                    Ingresa el enlace del canal (ej: youtube.com/@micanal) o el handle directo (@micanal) y presiona Buscar.
                  </span>
                </div>
              )}

              {newAccPlatform === "tiktok" && (
                <>
                  <div className="settings-form-row">
                    <label>Perfil publico de TikTok</label>
                    <input
                      type="text"
                      placeholder="Ej: @mimarca o https://www.tiktok.com/@mimarca"
                      required
                      value={newAccExternalId}
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        const profile = normalizeTikTokProfile(rawValue);
                        setNewAccExternalId(rawValue);
                        setNewAccHandle(profile ? `@${profile}` : "");
                        setNewAccUrl(profile ? tikTokUrl(profile) : "");
                        if (!newAccName.trim()) {
                          setNewAccName(profile ? `@${profile}` : "");
                        }
                      }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--dim)" }}>
                      Usamos Apify para leer solo datos publicos del perfil. No descarga videos ni requiere login de TikTok.
                    </span>
                  </div>

                  <div style={{ border: "1px solid rgba(132, 204, 22, 0.22)", borderRadius: "10px", padding: "10px", margin: "12px 0", background: "rgba(132, 204, 22, 0.04)", color: "var(--muted)", fontSize: "12px" }}>
                    Requisito: configura y valida <strong>APIFY_API_TOKEN</strong> en Credenciales globales antes de sincronizar.
                  </div>

                  <div className="settings-form-row">
                    <label>Nombre de la Cuenta / Visual</label>
                    <input
                      type="text"
                      placeholder="Ej: Mi Marca TikTok"
                      required
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                    />
                  </div>
                </>
              )}

              {(newAccPlatform === "facebook" || newAccPlatform === "instagram") && (
                <div className="meta-discovery-panel">
                  <div className="settings-form-row">
                    <label>Token de Meta para detectar cuentas</label>
                    <div className="meta-token-row">
                      <input
                        type="password"
                        placeholder="Pega tu Meta User Access Token"
                        required
                        value={metaToken}
                        onChange={(e) => {
                          setMetaToken(e.target.value);
                          setMetaDiscoverError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="primary-action"
                        disabled={metaDiscovering || !metaToken.trim()}
                        onClick={handleDiscoverMetaAccounts}
                      >
                        <Search size={14} /> {metaDiscovering ? "Buscando..." : "Buscar cuentas"}
                      </button>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--dim)" }}>
                      Buscamos tus paginas con Graph API y guardamos el ID oficial. El nombre solo se usa como referencia visual.
                    </span>
                  </div>

                  {metaDiscoverError && (
                    <div style={{ border: "1px solid rgba(255, 91, 119, 0.28)", borderRadius: "10px", padding: "10px", fontSize: "12px", color: "#ffadb9", background: "rgba(255, 91, 119, 0.04)" }}>
                      {metaDiscoverError}
                    </div>
                  )}

                  {(metaDiscovered.pages.length > 0 || metaDiscovered.instagram_accounts.length > 0) && (
                    <div>
                      <div className="meta-section-title">
                        Selecciona la cuenta {newAccPlatform === "facebook" ? "de Facebook" : "de Instagram"} para esta marca
                      </div>
                      <div className="meta-account-grid">
                        {(newAccPlatform === "facebook" ? metaDiscovered.pages : metaDiscovered.instagram_accounts).map((account) => (
                          <button
                            type="button"
                            key={`${account.platform}-${account.id}`}
                            className={`meta-account-card ${selectedMetaAccount?.id === account.id ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedMetaAccount(account);
                              setNewAccExternalId(account.id);
                              setNewAccName(account.name);
                              setNewAccHandle(account.username ? `@${account.username}` : "");
                              setNewAccUrl(
                                account.platform === "facebook"
                                  ? `https://www.facebook.com/${account.id}`
                                  : account.username
                                    ? `https://www.instagram.com/${account.username}`
                                    : ""
                              );
                            }}
                          >
                            <span className="platform-icon-pill">
                              <PlatformIcon platform={account.platform} size={14} />
                            </span>
                            <span>
                              <strong>{account.name}</strong>
                              <small>
                                {account.platform === "instagram" ? `Vinculada a ${account.linked_page_name}` : account.category || "Pagina de Facebook"}
                              </small>
                              <code>{account.id}</code>
                            </span>
                          </button>
                        ))}
                      </div>
                      {(newAccPlatform === "instagram" ? metaDiscovered.instagram_accounts : metaDiscovered.pages).length === 0 && (
                        <p className="settings-muted-note">
                          El token no devolvio cuentas de {platformLabel(newAccPlatform)}. Revisa permisos y que la pagina tenga la cuenta vinculada.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Vista previa premium del canal resuelto */}
              {resolvedChannel && newAccPlatform === "youtube" && (
                <div style={{ border: "1px solid rgba(132, 204, 22, 0.28)", borderRadius: "10px", padding: "12px", margin: "14px 0", display: "flex", alignItems: "center", gap: "12px", background: "rgba(132, 204, 22, 0.04)" }}>
                  <img
                    src={resolvedChannel.thumbnail_url}
                    alt={resolvedChannel.title}
                    style={{ width: "42px", height: "42px", borderRadius: "50%", border: "1px solid var(--line)" }}
                  />
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text)" }}>{resolvedChannel.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--dim)" }}>{resolvedChannel.handle} - {resolvedChannel.subscriber_count.toLocaleString()} suscriptores</div>
                  </div>
                  <span className="brand-readiness ready" style={{ padding: "2px 8px", fontSize: "10px" }}>Encontrado</span>
                </div>
              )}

              {resolveError && newAccPlatform === "youtube" && (
                <div style={{ border: "1px solid rgba(255, 91, 119, 0.28)", borderRadius: "10px", padding: "10px", margin: "14px 0", fontSize: "12px", color: "#ffadb9", background: "rgba(255, 91, 119, 0.04)" }}>
                  Aviso: <strong>Error al resolver canal:</strong> {resolveError}
                </div>
              )}

              {newAccPlatform === "youtube" && (
                <>
                  <div className="settings-form-row">
                    <label>Nombre de la Cuenta / Visual</label>
                    <input
                      type="text"
                      placeholder="Ej: Mi Marca YouTube"
                      required
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                    />
                  </div>

                  <div className="settings-form-row">
                    <label>@Handle (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej: @mimarca"
                      value={newAccHandle}
                      onChange={(e) => setNewAccHandle(e.target.value)}
                    />
                  </div>

                  <div className="settings-form-row">
                    <label>URL del Perfil (Opcional)</label>
                    <input
                      type="url"
                      placeholder="Ej: https://..."
                      value={newAccUrl}
                      onChange={(e) => setNewAccUrl(e.target.value)}
                    />
                  </div>
                </>
              )}
              
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>
                <button type="button" onClick={() => {
                  setShowNewAccountModal(false);
                  setResolvedChannel(null);
                  setResolveError(null);
                  setMetaDiscovered({ pages: [], instagram_accounts: [] });
                  setMetaDiscoverError(null);
                  setSelectedMetaAccount(null);
                }}>Cancelar</button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={
                    (newAccPlatform === "youtube" && !resolvedChannel) ||
                    ((newAccPlatform === "facebook" || newAccPlatform === "instagram") && !selectedMetaAccount) ||
                    (newAccPlatform === "tiktok" && !normalizeTikTokProfile(newAccExternalId))
                  }
                >
                  Conectar Red
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


