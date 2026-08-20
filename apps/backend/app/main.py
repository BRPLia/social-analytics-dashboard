from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import uvicorn
from html import escape

from app.core.config import get_settings
from app.db import init_db, session_scope
from app.models import (
    DashboardPayload,
    ResetDataSummary,
    SyncRunRecord,
    SyncSummary,
    ChannelCreate,
    ChannelUpdate,
    AccountCreate,
    AccountUpdate,
    CredentialSet,
    CredentialResponse,
    IntegrationCredentialResponse,
    IntegrationCredentialSet,
    ValidationResponse
)
from app.services.dashboard import DashboardService
from app.services.demo_data import DemoDataService
from app.services.maintenance import MaintenanceService
from app.services.sync import SyncService
from app.services.settings_service import SettingsService


settings = get_settings()
app = FastAPI(title="Dashboard Redes API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:9511", "http://localhost:9511"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    init_db()


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": settings.mode}


@app.get("/api/dashboard", response_model=DashboardPayload)
async def dashboard() -> DashboardPayload:
    with session_scope() as session:
        return DashboardService(session, settings).payload()


@app.post("/api/sync", response_model=SyncSummary)
async def sync_all() -> SyncSummary:
    with session_scope() as session:
        return SyncService(session, settings).sync_all()


@app.post("/api/sync/{platform}", response_model=SyncSummary)
async def sync_platform(platform: str) -> SyncSummary:
    with session_scope() as session:
        return SyncService(session, settings).sync_platform(platform)


@app.post("/api/sync/{platform}/{account_id}", response_model=SyncSummary)
async def sync_account(platform: str, account_id: int) -> SyncSummary:
    with session_scope() as session:
        return SyncService(session, settings).sync_account(platform, account_id)


@app.get("/api/sync-runs", response_model=list[SyncRunRecord])
async def sync_runs() -> list[SyncRunRecord]:
    with session_scope() as session:
        return SyncService(session, settings).latest_runs()


@app.post("/api/admin/reset-data", response_model=ResetDataSummary)
async def reset_data() -> ResetDataSummary:
    with session_scope() as session:
        return ResetDataSummary(**MaintenanceService(session).reset_ingested_data())


@app.get("/api/admin/demo-data")
async def demo_data_status():
    with session_scope() as session:
        return {"loaded": DemoDataService(session).is_loaded()}


@app.post("/api/admin/demo-data")
async def load_demo_data():
    with session_scope() as session:
        return DemoDataService(session).load()


@app.delete("/api/admin/demo-data")
async def unload_demo_data():
    with session_scope() as session:
        return DemoDataService(session).unload()


# ==========================================
# ENDPOINTS DE CONFIGURACION (ONBOARDING)
# ==========================================

@app.get("/api/settings/channels")
async def get_channels():
    with session_scope() as session:
        return SettingsService(session).list_channels()


@app.post("/api/settings/channels")
async def create_channel(payload: ChannelCreate):
    with session_scope() as session:
        return SettingsService(session).create_channel(
            channel_id=payload.id,
            name=payload.name,
            color=payload.color
        )


@app.put("/api/settings/channels/{channel_id}")
async def update_channel(channel_id: str, payload: ChannelUpdate):
    with session_scope() as session:
        return SettingsService(session).update_channel(
            channel_id=channel_id,
            name=payload.name,
            color=payload.color
        )


@app.delete("/api/settings/channels/{channel_id}")
async def delete_channel(channel_id: str):
    with session_scope() as session:
        return SettingsService(session).delete_channel(channel_id)


@app.post("/api/settings/accounts")
async def create_account(payload: AccountCreate):
    with session_scope() as session:
        return SettingsService(session).create_account(
            channel_id=payload.channel_id,
            platform=payload.platform,
            external_id=payload.external_id,
            name=payload.name,
            handle=payload.handle,
            url=payload.url
        )


@app.put("/api/settings/accounts/{account_id}")
async def update_account(account_id: int, payload: AccountUpdate):
    with session_scope() as session:
        return SettingsService(session).update_account(
            account_id=account_id,
            enabled=payload.enabled,
            external_id=payload.external_id,
            name=payload.name,
            handle=payload.handle,
            url=payload.url
        )


@app.delete("/api/settings/accounts/{account_id}")
async def delete_account(account_id: int):
    with session_scope() as session:
        return SettingsService(session).delete_account(account_id)


@app.get("/api/settings/credentials", response_model=list[CredentialResponse])
async def list_credentials() -> list[CredentialResponse]:
    with session_scope() as session:
        return [CredentialResponse(**cred) for cred in SettingsService(session).list_credentials()]


@app.get("/api/settings/integration-credentials", response_model=list[IntegrationCredentialResponse])
async def list_integration_credentials() -> list[IntegrationCredentialResponse]:
    with session_scope() as session:
        return [
            IntegrationCredentialResponse(**cred)
            for cred in SettingsService(session).list_integration_credentials()
        ]


@app.put("/api/settings/integration-credentials/{channel_id}/{platform}/{key}")
async def set_integration_credential(channel_id: str, platform: str, key: str, payload: IntegrationCredentialSet):
    with session_scope() as session:
        return SettingsService(session).set_integration_credential(
            channel_id=channel_id,
            platform=platform,
            key=key,
            value=payload.credential_value,
            label=payload.label,
        )


@app.post(
    "/api/settings/integration-credentials/{channel_id}/{platform}/{key}/validate",
    response_model=ValidationResponse,
)
async def validate_integration_credential(channel_id: str, platform: str, key: str) -> ValidationResponse:
    with session_scope() as session:
        res = SettingsService(session).validate_integration_credential(channel_id, platform, key)
        return ValidationResponse(**res)


@app.post("/api/settings/youtube/resolve-channel")
async def resolve_youtube_channel(payload: dict):
    input_str = payload.get("input_str", "")
    with session_scope() as session:
        try:
            return SettingsService(session).resolve_youtube_channel(input_str)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/settings/meta/discover")
async def discover_meta_accounts(payload: dict):
    token = payload.get("token", "")
    with session_scope() as session:
        try:
            return SettingsService(session).discover_meta_accounts(token)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/settings/youtube/oauth/start")
async def start_youtube_oauth(payload: dict, request: Request):
    channel_id = payload.get("channel_id", "")
    request_host = request.headers.get("host", f"{settings.host}:{settings.port}")
    with session_scope() as session:
        try:
            auth_url = SettingsService(session).start_youtube_oauth(channel_id, request_host)
            return {"status": "success", "auth_url": auth_url}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/settings/youtube/oauth/callback", response_class=HTMLResponse)
async def complete_youtube_oauth(code: str, state: str, request: Request):
    request_host = request.headers.get("host", f"{settings.host}:{settings.port}")
    with session_scope() as session:
        try:
            SettingsService(session).complete_youtube_oauth(code, state, request_host)
            safe_state = escape(state)
            html_content = f"""
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Conexion de YouTube exitosa</title>
                <style>
                    body {{
                        background-color: #101113;
                        color: #f3f4f1;
                        font-family: Inter, system-ui, -apple-system, sans-serif;
                        text-align: center;
                        padding: 60px 20px;
                        margin: 0;
                    }}
                    .container {{
                        max-width: 450px;
                        margin: auto;
                        background: #17191d;
                        padding: 40px 30px;
                        border-radius: 12px;
                        border: 1px solid rgba(238, 241, 245, 0.1);
                        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                    }}
                    .icon {{
                        display: inline-grid;
                        place-items: center;
                        width: 54px;
                        height: 54px;
                        border-radius: 50%;
                        background: rgba(132, 204, 22, 0.12);
                        color: #84cc16;
                        font-size: 18px;
                        font-weight: 800;
                        margin-bottom: 20px;
                    }}
                    h1 {{ margin: 0 0 14px; font-size: 26px; font-weight: 700; }}
                    p {{ color: rgba(243, 244, 241, 0.64); font-size: 15px; line-height: 1.5; margin: 0 0 14px; }}
                    .brand {{
                        display: inline-block;
                        padding: 4px 10px;
                        border-radius: 6px;
                        background: rgba(132, 204, 22, 0.12);
                        color: #84cc16;
                        font-weight: 700;
                        font-family: monospace;
                        margin: 4px 0 16px;
                    }}
                    .close-btn {{
                        background: #84cc16;
                        color: #101113;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-weight: 700;
                        font-size: 14px;
                        cursor: pointer;
                        margin-top: 10px;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">OK</div>
                    <h1>Vinculacion exitosa</h1>
                    <p>Tu cuenta de YouTube Analytics para la marca</p>
                    <div class="brand">{safe_state}</div>
                    <p>se ha conectado correctamente a tu base de datos local.</p>
                    <p style="font-size: 13px; color: rgba(243, 244, 241, 0.4);">Ya puedes cerrar esta pestana de forma segura.</p>
                    <button class="close-btn" onclick="window.close()">Cerrar pestana</button>
                </div>
                <script>
                    setTimeout(function() {{
                        window.close();
                    }}, 4000);
                </script>
            </body>
            </html>
            """
            return HTMLResponse(content=html_content, status_code=200)
        except Exception as e:
            safe_error = escape(str(e))
            html_error = f"""
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Error de conexion de YouTube</title>
                <style>
                    body {{
                        background-color: #101113;
                        color: #f3f4f1;
                        font-family: Inter, system-ui, sans-serif;
                        text-align: center;
                        padding: 60px 20px;
                    }}
                    .container {{
                        max-width: 450px;
                        margin: auto;
                        background: #17191d;
                        padding: 40px 30px;
                        border-radius: 12px;
                        border: 1px solid rgba(255, 91, 119, 0.2);
                        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                    }}
                    .icon {{
                        color: #ff5b77;
                        font-size: 40px;
                        font-weight: 800;
                        margin-bottom: 20px;
                    }}
                    h1 {{ margin: 0 0 14px; font-size: 26px; }}
                    p {{ color: rgba(243, 244, 241, 0.64); font-size: 15px; line-height: 1.5; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">!</div>
                    <h1>Error de vinculacion</h1>
                    <p>{safe_error}</p>
                    <p style="font-size: 13px; color: rgba(243, 244, 241, 0.4);">Cierra esta pestana y vuelve a intentarlo desde el dashboard.</p>
                </div>
            </body>
            </html>
            """
            return HTMLResponse(content=html_error, status_code=400)

@app.put("/api/settings/credentials/{key}")
async def set_credential(key: str, payload: CredentialSet):
    with session_scope() as session:
        return SettingsService(session).set_credential(
            key=key,
            value=payload.credential_value,
            platform=payload.platform,
            label=payload.label
        )


@app.delete("/api/settings/credentials/{key}")
async def delete_credential(key: str):
    with session_scope() as session:
        return SettingsService(session).delete_credential(key)


@app.post("/api/settings/credentials/{key}/validate", response_model=ValidationResponse)
async def validate_credential(key: str) -> ValidationResponse:
    with session_scope() as session:
        res = SettingsService(session).validate_credential(key)
        return ValidationResponse(**res)


def run() -> None:
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":
    run()


