import json
import logging
import re
import urllib.parse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.db import IntegrationCredentialOrm, SocialChannelOrm, SocialAccountOrm, ApiCredentialOrm
from app.services.maintenance import MaintenanceService

logger = logging.getLogger(__name__)


def extract_youtube_handle_or_id(input_str: str) -> tuple[str | None, str | None]:
    input_str = input_str.strip()
    
    # 1. Direct 24-char UC ID
    if len(input_str) == 24 and input_str.startswith("UC"):
        return None, input_str
        
    # 2. Full URL
    if "youtube.com" in input_str or "youtu.be" in input_str:
        handle_match = re.search(r"/(@[\w\.\-]+)", input_str)
        if handle_match:
            return handle_match.group(1), None
            
        id_match = re.search(r"/channel/(UC[\w\-]{22})", input_str)
        if id_match:
            return None, id_match.group(1)
            
    # 3. Direct handle
    if input_str.startswith("@"):
        return input_str, None
    elif not "/" in input_str and len(input_str) > 0:
        if input_str.startswith("UC") and len(input_str) == 24:
            return None, input_str
        else:
            return f"@{input_str}", None
            
    return None, None


YOUTUBE_CREDENTIALS = {
    "GOOGLE_CLIENT_ID": "Google OAuth Client ID",
    "GOOGLE_CLIENT_SECRET": "Google OAuth Client Secret",
    "YOUTUBE_REFRESH_TOKEN": "YouTube Analytics Refresh Token",
}

META_CREDENTIAL = "META_USER_ACCESS_TOKEN"


def _mask_secret(value: str) -> str:
    masked = "********"
    if len(value) > 4:
        masked = f"********{value[-4:]}"
import json
import logging
import re
import urllib.parse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.db import IntegrationCredentialOrm, SocialChannelOrm, SocialAccountOrm, ApiCredentialOrm
from app.services.maintenance import MaintenanceService

logger = logging.getLogger(__name__)


def extract_youtube_handle_or_id(input_str: str) -> tuple[str | None, str | None]:
    input_str = input_str.strip()
    
    # 1. Direct 24-char UC ID
    if len(input_str) == 24 and input_str.startswith("UC"):
        return None, input_str
        
    # 2. Full URL
    if "youtube.com" in input_str or "youtu.be" in input_str:
        handle_match = re.search(r"/(@[\w\.\-]+)", input_str)
        if handle_match:
            return handle_match.group(1), None
            
        id_match = re.search(r"/channel/(UC[\w\-]{22})", input_str)
        if id_match:
            return None, id_match.group(1)
            
    # 3. Direct handle
    if input_str.startswith("@"):
        return input_str, None
    elif not "/" in input_str and len(input_str) > 0:
        if input_str.startswith("UC") and len(input_str) == 24:
            return None, input_str
        else:
            return f"@{input_str}", None
            
    return None, None


def normalize_tiktok_profile(input_str: str) -> str:
    input_str = input_str.strip()
    if "tiktok.com" in input_str:
        parsed = urllib.parse.urlparse(input_str if "://" in input_str else f"https://{input_str}")
        parts = [part for part in parsed.path.split("/") if part]
        handle = next((part for part in parts if part.startswith("@")), parts[0] if parts else "")
        return handle.lstrip("@")
    return input_str.lstrip("@")


YOUTUBE_CREDENTIALS = {
    "GOOGLE_CLIENT_ID": "Google OAuth Client ID",
    "GOOGLE_CLIENT_SECRET": "Google OAuth Client Secret",
    "YOUTUBE_REFRESH_TOKEN": "YouTube Analytics Refresh Token",
}

META_CREDENTIAL = "META_USER_ACCESS_TOKEN"


def _mask_secret(value: str) -> str:
    masked = "********"
    if len(value) > 4:
        masked = f"********{value[-4:]}"
    return masked


def _is_real_account(account: SocialAccountOrm) -> bool:
    metadata = json.loads(account.metadata_json or "{}")
    return bool(account.enabled) and not metadata.get("placeholder") and bool(account.external_id)


class SettingsService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ==========================================
    # 1. GESTION DE MARCAS (CHANNELS)
    # ==========================================

    def list_channels(self) -> list[dict]:
        channels = self.session.query(SocialChannelOrm).all()
        result = []
        for ch in channels:
            accounts = []
            for acc in ch.accounts:
                accounts.append({
                    "id": acc.id,
                    "platform": acc.platform,
                    "external_id": acc.external_id,
                    "name": acc.name,
                    "handle": acc.handle,
                    "url": acc.url,
                    "enabled": acc.enabled,
                    "status": acc.status,
                    "last_sync_at": acc.last_sync_at.isoformat() if acc.last_sync_at else None,
                    "metadata": json.loads(acc.metadata_json) if acc.metadata_json else {}
                })
            result.append({
                "id": ch.id,
                "name": ch.name,
                "color": ch.color,
                "status": ch.status,
                "accounts": accounts
            })
        return result

    def create_channel(self, channel_id: str, name: str, color: str = "#84CC16") -> dict:
        channel_id = channel_id.strip().upper()
        if not channel_id:
            raise ValueError("El ID de la marca no puede estar vacio.")
        
        exists = self.session.get(SocialChannelOrm, channel_id)
        if exists:
            raise ValueError(f"La marca con ID '{channel_id}' ya existe.")
            
        channel = SocialChannelOrm(id=channel_id, name=name, color=color)
        self.session.add(channel)
        self.session.flush()
        return {
            "status": "success",
            "channel": {"id": channel.id, "name": channel.name, "color": channel.color}
        }

    def update_channel(self, channel_id: str, name: str | None = None, color: str | None = None) -> dict:
        channel = self.session.get(SocialChannelOrm, channel_id)
        if not channel:
            raise ValueError(f"No se encontro la marca con ID '{channel_id}'.")
            
        if name is not None:
            channel.name = name
        if color is not None:
            channel.color = color
            
        self.session.flush()
        return {
            "status": "success",
            "channel": {"id": channel.id, "name": channel.name, "color": channel.color}
        }

    def delete_channel(self, channel_id: str) -> dict:
        maint = MaintenanceService(self.session)
        return maint.delete_channel_cascade(channel_id)

    # ==========================================
    # 2. GESTION DE CUENTAS (ACCOUNTS)
    # ==========================================

    def create_account(self, channel_id: str, platform: str, external_id: str, name: str, handle: str = "", url: str = "") -> dict:
        channel = self.session.get(SocialChannelOrm, channel_id)
        if not channel:
            raise ValueError(f"La marca con ID '{channel_id}' no existe.")
            
        platform = platform.lower().strip()
        if platform not in {"youtube", "facebook", "instagram", "tiktok", "linkedin"}:
            raise ValueError(f"Plataforma '{platform}' no soportada.")
            
        external_id = external_id.strip()
        if not external_id:
            raise ValueError("El ID externo de la cuenta de red social no puede estar vacio.")
        if platform == "tiktok":
            external_id = normalize_tiktok_profile(external_id)
            if not handle:
                handle = f"@{external_id}"

        # Evitar duplicados por plataforma + external_id
        exists = self.session.query(SocialAccountOrm).filter_by(platform=platform, external_id=external_id).first()
        if exists:
            raise ValueError(f"Ya existe una cuenta conectada en la plataforma '{platform}' con el ID '{external_id}'.")

        # Intentar pre-completar URL de youtube/facebook si viene vacia
        if not url:
            if platform == "youtube":
                url = f"https://www.youtube.com/channel/{external_id}"
            elif platform == "facebook":
                url = f"https://www.facebook.com/{external_id}"
            elif platform == "instagram":
                url = f"https://www.instagram.com/{handle.replace('@', '')}" if handle else f"https://www.instagram.com/{external_id}"
            elif platform == "tiktok":
                url = f"https://www.tiktok.com/@{external_id}"

        metadata = {
            "source": "onboarding",
            "placeholder": False
        }

        account = SocialAccountOrm(
            channel_id=channel_id,
            platform=platform,
            external_id=external_id,
            name=name,
            handle=handle,
            url=url,
            enabled=True,
            status="pending",
            metadata_json=json.dumps(metadata)
        )
        self.session.add(account)
        self.session.flush()
        return {
            "status": "success",
            "account": {
                "id": account.id,
                "channel_id": account.channel_id,
                "platform": account.platform,
                "external_id": account.external_id,
                "name": account.name
            }
        }

    def update_account(self, account_id: int, enabled: bool | None = None, external_id: str | None = None, name: str | None = None, handle: str | None = None, url: str | None = None) -> dict:
        account = self.session.get(SocialAccountOrm, account_id)
        if not account:
            raise ValueError(f"No se encontro la cuenta con ID {account_id}.")
            
        if enabled is not None:
            account.enabled = enabled
        if external_id is not None:
            account.external_id = external_id.strip()
        if name is not None:
            account.name = name.strip()
        if handle is not None:
            account.handle = handle.strip()
        if url is not None:
            account.url = url.strip()
            
        self.session.flush()
        return {
            "status": "success",
            "account": {
                "id": account.id,
                "enabled": account.enabled,
                "external_id": account.external_id,
                "name": account.name
            }
        }

    def delete_account(self, account_id: int) -> dict:
        maint = MaintenanceService(self.session)
        return maint.delete_account_cascade(account_id)

    # ==========================================
    # 3. GESTION DE CREDENCIALES (API CREDENTIALS)
    # ==========================================

    def list_credentials(self) -> list[dict]:
        credentials = self.session.query(ApiCredentialOrm).all()
        result = []
        for cr in credentials:
            result.append({
                "id": cr.id,
                "credential_key": cr.credential_key,
                "credential_value": _mask_secret(cr.credential_value),
                "platform": cr.platform,
                "label": cr.label,
                "status": cr.status,
                "last_validated_at": cr.last_validated_at.isoformat() if cr.last_validated_at else None,
                "created_at": cr.created_at.isoformat()
            })
        return result

    def list_integration_credentials(self) -> list[dict]:
        rows = (
            self.session.query(IntegrationCredentialOrm)
            .filter(IntegrationCredentialOrm.credential_key != "YOUTUBE_API_KEY")
            .order_by(
                IntegrationCredentialOrm.channel_id,
                IntegrationCredentialOrm.platform,
                IntegrationCredentialOrm.credential_key,
            )
            .all()
        )
        return [self._integration_response(row) for row in rows]

    def set_integration_credential(
        self,
        channel_id: str,
        platform: str,
        key: str,
        value: str,
        label: str = "",
    ) -> dict:
        channel_id = channel_id.strip().upper()
        platform = platform.strip().lower()
        key = key.strip().upper()
        value = value.strip()
        if not channel_id or not platform or not key or not value:
            raise ValueError("Marca, plataforma, clave y valor son obligatorios.")
        if key == "YOUTUBE_API_KEY":
            raise ValueError("YOUTUBE_API_KEY es una credencial global del sistema. Configurala en Credenciales globales.")
        if not self.session.get(SocialChannelOrm, channel_id):
            raise ValueError(f"No existe la marca '{channel_id}'.")
        credential = (
            self.session.query(IntegrationCredentialOrm)
            .filter_by(channel_id=channel_id, platform=platform, credential_key=key)
            .first()
        )
        if credential:
            credential.credential_value = value
            if label:
                credential.label = label
            credential.status = "pending"
        else:
            credential = IntegrationCredentialOrm(
                channel_id=channel_id,
                platform=platform,
                credential_key=key,
                credential_value=value,
                label=label or key.replace("_", " ").title(),
                status="pending",
            )
            self.session.add(credential)
        self.session.flush()
        try:
            self.validate_integration_credential(channel_id, platform, key)
        except Exception:
            pass
        return {"status": "success", "credential": self._integration_response(credential)}

    def validate_integration_credential(self, channel_id: str, platform: str, key: str) -> dict:
        channel_id = channel_id.strip().upper()
        platform = platform.strip().lower()
        key = key.strip().upper()
        credential = (
            self.session.query(IntegrationCredentialOrm)
            .filter_by(channel_id=channel_id, platform=platform, credential_key=key)
            .first()
        )
        if not credential:
            raise ValueError(f"No se encontro la credencial {channel_id}/{platform}/{key}.")
        companion = {
            row.credential_key: row.credential_value
            for row in self.session.query(IntegrationCredentialOrm)
            .filter_by(channel_id=channel_id, platform=platform)
            .all()
        }
        return self._validate_credential_value(
            key=key,
            value=credential.credential_value,
            update_target=credential,
            companion_values=companion,
        )

    def _integration_response(self, credential: IntegrationCredentialOrm) -> dict:
        return {
            "id": credential.id,
            "channel_id": credential.channel_id,
            "platform": credential.platform,
            "credential_key": credential.credential_key,
            "credential_value": _mask_secret(credential.credential_value),
            "label": credential.label,
            "status": credential.status,
            "last_validated_at": credential.last_validated_at.isoformat() if credential.last_validated_at else None,
            "created_at": credential.created_at.isoformat() if credential.created_at else None,
        }

    def set_credential(self, key: str, value: str, platform: str, label: str = "") -> dict:
        key = key.strip().upper()
        value = value.strip()
        platform = platform.lower().strip()
        
        if not key or not value:
            raise ValueError("La clave y el valor de la credencial no pueden estar vacios.")
            
        cred = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).first()
        if cred:
            cred.credential_value = value
            cred.platform = platform
            if label:
                cred.label = label
            cred.status = "pending"  # Forzar revalidacion
        else:
            cred = ApiCredentialOrm(
                credential_key=key,
                credential_value=value,
                platform=platform,
                label=label or key.replace("_", " ").title(),
                status="pending"
            )
            self.session.add(cred)
            
        self.session.flush()
        
        # Opcional: auto-validar inmediatamente al guardar
        try:
            self.validate_credential(key)
        except Exception:
            pass  # Validar no debe bloquear el guardado si falla la red
            
        return {
            "status": "success",
            "credential": {
                "credential_key": cred.credential_key,
                "platform": cred.platform,
                "status": cred.status
            }
        }

    def delete_credential(self, key: str) -> dict:
        key = key.strip().upper()
        cred = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).first()
        if not cred:
            raise ValueError(f"No se encontro la credencial con clave '{key}'.")
            
        self.session.delete(cred)
        self.session.flush()
        return {"status": "success", "credential_key": key}

    def validate_credential(self, key: str) -> dict:
        key = key.strip().upper()
        cred = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).first()
        if not cred:
            raise ValueError(f"No se encontro la credencial con clave '{key}'.")
        companion = {
            row.credential_key: row.credential_value
            for row in self.session.query(ApiCredentialOrm).all()
        }
        return self._validate_credential_value(
            key=key,
            value=cred.credential_value,
            update_target=cred,
            companion_values=companion,
        )

    def _validate_credential_value(
        self,
        key: str,
        value: str,
        update_target: ApiCredentialOrm | IntegrationCredentialOrm,
        companion_values: dict[str, str],
    ) -> dict:
        status = "expired"
        err_msg = ""

        if key == "YOUTUBE_API_KEY":
            try:
                url = f"https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=Google&key={value}"
                req = Request(url, headers={"User-Agent": "Dashboard-Redes"})
                with urlopen(req, timeout=10) as response:
                    if response.status == 200:
                        status = "valid"
            except HTTPError as exc:
                err_msg = f"HTTP {exc.code}: {exc.reason}"
            except Exception as exc:
                err_msg = str(exc)

        elif key == "YOUTUBE_REFRESH_TOKEN":
            client_id = companion_values.get("GOOGLE_CLIENT_ID", "")
            client_secret = companion_values.get("GOOGLE_CLIENT_SECRET", "")
            if not client_id or not client_secret:
                err_msg = "Se requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET para validar el Refresh Token."
            else:
                try:
                    token_url = "https://oauth2.googleapis.com/token"
                    data = urllib.parse.urlencode({
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": value,
                        "grant_type": "refresh_token",
                    }).encode("utf-8")
                    req = Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
                    with urlopen(req, timeout=10) as response:
                        if response.status == 200:
                            status = "valid"
                except HTTPError as exc:
                    err_msg = f"OAuth HTTP {exc.code}: {exc.reason}"
                except Exception as exc:
                    err_msg = str(exc)

        elif key == "META_USER_ACCESS_TOKEN":
            try:
                url = f"https://graph.facebook.com/v25.0/me?fields=id,name&access_token={value}"
                req = Request(url, headers={"User-Agent": "Dashboard-Redes"})
                with urlopen(req, timeout=10) as response:
                    if response.status == 200:
                        status = "valid"
            except HTTPError as exc:
                err_msg = f"Meta HTTP {exc.code}: {exc.reason}"
            except Exception as exc:
                err_msg = str(exc)

        elif key == "APIFY_API_TOKEN":
            try:
                query = urllib.parse.urlencode({"token": value})
                url = f"https://api.apify.com/v2/users/me?{query}"
                req = Request(url, headers={"User-Agent": "Dashboard-Redes"})
                with urlopen(req, timeout=10) as response:
                    if response.status == 200:
                        status = "valid"
            except HTTPError as exc:
                err_msg = f"Apify HTTP {exc.code}: {exc.reason}"
            except Exception as exc:
                err_msg = str(exc)

        elif key in {"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}:
            if len(value) > 10:
                status = "valid"
            else:
                err_msg = "Credencial demasiado corta."

        else:
            if len(value) > 5:
                status = "valid"
            else:
                err_msg = "Formato de credencial invalido."

        update_target.status = status
        update_target.last_validated_at = datetime.now(timezone.utc)
        self.session.flush()
        return {
            "status": status,
            "credential_key": key,
            "error": err_msg,
            "last_validated_at": update_target.last_validated_at.isoformat(),
        }

    def _resolve_credential_value(self, channel_id: str, platform: str, key: str) -> str | None:
        if key in {"YOUTUBE_API_KEY", "APIFY_API_TOKEN"}:
            legacy = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).first()
            if legacy and legacy.credential_value:
                return legacy.credential_value
            return None

        scoped = (
            self.session.query(IntegrationCredentialOrm)
            .filter_by(channel_id=channel_id, platform=platform, credential_key=key)
            .first()
        )
        if scoped and scoped.credential_value:
            return scoped.credential_value
        legacy = self.session.query(ApiCredentialOrm).filter_by(credential_key=key).first()
        if legacy and legacy.credential_value:
            return legacy.credential_value
        return None

    def resolve_youtube_channel(self, input_str: str) -> dict:
        api_key = self._resolve_credential_value("", "", "YOUTUBE_API_KEY")
        if not api_key:
            raise ValueError("No se ha configurado la clave YOUTUBE_API_KEY global en el sistema.")
            
        handle, channel_id = extract_youtube_handle_or_id(input_str)
        if not handle and not channel_id:
            raise ValueError("Formato de canal no reconocido. Pega el enlace de YouTube o ingresa tu @handle.")
            
        params = {"part": "snippet,statistics"}
        if handle:
            params["forHandle"] = handle
        else:
            params["id"] = channel_id
            
        query = urllib.parse.urlencode({**params, "key": api_key})
        url = f"https://www.googleapis.com/youtube/v3/channels?{query}"
        
        try:
            req = Request(url, headers={"User-Agent": "Dashboard-Redes"})
            with urlopen(req, timeout=15) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                items = res_data.get("items", [])
                if not items:
                    raise ValueError(f"No se encontro ningun canal en YouTube con el parametro '{input_str}'.")
                
                channel_data = items[0]
                snippet = channel_data.get("snippet", {})
                stats = channel_data.get("statistics", {})
                
                return {
                    "status": "success",
                    "channel_id": channel_data["id"],
                    "title": snippet.get("title", ""),
                    "handle": snippet.get("customUrl", handle or ""),
                    "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                    "subscriber_count": int(stats.get("subscriberCount", 0)),
                    "video_count": int(stats.get("videoCount", 0)),
                }
        except HTTPError as exc:
            err_body = exc.read().decode("utf-8")
            logger.error(f"[Resolve Channel Error] HTTP {exc.code}: {err_body}")
            raise ValueError(f"Error del API de YouTube: HTTP {exc.code} {exc.reason}")
        except Exception as exc:
            logger.error(f"[Resolve Channel Error] {str(exc)}")
            raise ValueError(f"Error al conectar con YouTube: {str(exc)}")

    def discover_meta_accounts(self, token: str) -> dict:
        token = token.strip()
        if not token:
            raise ValueError("Pega un Meta User Access Token para buscar tus paginas.")

        data = self._meta_get(
            "me/accounts",
            token,
            {"fields": "id,name,access_token,category,instagram_business_account"},
        )
        pages: list[dict] = []
        instagram_accounts: list[dict] = []
        for page in data.get("data", []):
            page_id = str(page.get("id") or "")
            page_name = str(page.get("name") or "Pagina sin nombre")
            page_token = str(page.get("access_token") or "")
            if not page_id:
                continue

            pages.append(
                {
                    "id": page_id,
                    "name": page_name,
                    "platform": "facebook",
                    "linked_page_id": page_id,
                    "linked_page_name": page_name,
                    "category": page.get("category") or "",
                    "token_available": bool(page_token),
                }
            )

            ig = page.get("instagram_business_account") or {}
            ig_id = str(ig.get("id") or "")
            if not ig_id:
                continue

            ig_name = f"Instagram de {page_name}"
            ig_username = ""
            if page_token:
                try:
                    ig_info = self._meta_get(ig_id, page_token, {"fields": "id,username,name"})
                    ig_username = str(ig_info.get("username") or "")
                    ig_name = str(ig_info.get("name") or ig_username or ig_name)
                except Exception:
                    pass

            instagram_accounts.append(
                {
                    "id": ig_id,
                    "name": ig_name,
                    "platform": "instagram",
                    "linked_page_id": page_id,
                    "linked_page_name": page_name,
                    "username": ig_username,
                    "token_available": bool(page_token),
                }
            )

        return {"status": "success", "pages": pages, "instagram_accounts": instagram_accounts}

    def _meta_get(self, path: str, token: str, params: dict[str, str] | None = None) -> dict[str, object]:
        query = {"access_token": token}
        if params:
            query.update(params)
        url = f"https://graph.facebook.com/v25.0/{path}?{urllib.parse.urlencode(query)}"
        try:
            req = Request(url, headers={"User-Agent": "Dashboard-Redes"})
            with urlopen(req, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(body).get("error", {}).get("message", exc.reason)
            except json.JSONDecodeError:
                detail = exc.reason
            raise ValueError(f"Meta Graph API HTTP {exc.code}: {detail}") from exc
        except Exception as exc:
            raise ValueError(f"Error al conectar con Meta: {str(exc)}") from exc

    def start_youtube_oauth(self, channel_id: str, request_host: str) -> str:
        channel_id = channel_id.strip().upper()
        account = (
            self.session.query(SocialAccountOrm)
            .filter_by(channel_id=channel_id, platform="youtube")
            .first()
        )
        if not account or not _is_real_account(account):
            raise ValueError("Esta marca no tiene un canal de YouTube real conectado.")
        client_id = self._resolve_credential_value(channel_id, "youtube", "GOOGLE_CLIENT_ID")
        client_secret = self._resolve_credential_value(channel_id, "youtube", "GOOGLE_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise ValueError("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET para esta marca. Carga el JSON de Google Cloud primero.")
            
        redirect_uri = f"http://{request_host}/api/settings/youtube/oauth/callback"
        
        scopes = [
            "https://www.googleapis.com/auth/yt-analytics.readonly",
            "https://www.googleapis.com/auth/youtube.readonly",
        ]
        
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": " ".join(scopes),
                "access_type": "offline",
                "prompt": "consent",
                "state": channel_id,
            }
        )
        return auth_url

    def complete_youtube_oauth(self, code: str, state: str, request_host: str) -> dict:
        channel_id = state.strip().upper()
        account = (
            self.session.query(SocialAccountOrm)
            .filter_by(channel_id=channel_id, platform="youtube")
            .first()
        )
        if not account or not _is_real_account(account):
            raise ValueError("Esta marca no tiene un canal de YouTube real conectado.")
        
        client_id = self._resolve_credential_value(channel_id, "youtube", "GOOGLE_CLIENT_ID")
        client_secret = self._resolve_credential_value(channel_id, "youtube", "GOOGLE_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            raise ValueError("Falta configurar GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET para esta marca.")
            
        redirect_uri = f"http://{request_host}/api/settings/youtube/oauth/callback"
        
        body = urllib.parse.urlencode(
            {
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
        ).encode("utf-8")
        
        request = Request(
            "https://oauth2.googleapis.com/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        
        try:
            with urlopen(request, timeout=30) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                refresh_token = res_data.get("refresh_token")
                if not refresh_token:
                    # Si Google no devuelve refresh_token, normalmente ya existia acceso concedido.
                    # El usuario debe revocar el acceso y repetir el flujo para forzar un token nuevo.
                    raise ValueError(
                        "Google no devolvio 'refresh_token'. Por favor, ve a la configuracion de seguridad de tu cuenta de Google, remueve el acceso de la aplicacion y vuelve a intentar para forzar el token de actualizacion."
                    )
                
                # Guardar el refresh token para esta marca y plataforma
                self.set_integration_credential(
                    channel_id=channel_id,
                    platform="youtube",
                    key="YOUTUBE_REFRESH_TOKEN",
                    value=refresh_token,
                    label="YouTube Analytics Refresh Token",
                )
                
                return {"status": "success", "channel_id": channel_id}
        except HTTPError as exc:
            err_body = exc.read().decode("utf-8")
            logger.error(f"[OAuth Exchange Error] Status: {exc.code}, Body: {err_body}")
            raise ValueError(f"Error de intercambio de codigo OAuth: HTTP {exc.code} - {exc.reason}")
        except Exception as exc:
            logger.error(f"[OAuth Exchange Error] {str(exc)}")
            raise ValueError(f"Error al completar el flujo OAuth: {str(exc)}")


