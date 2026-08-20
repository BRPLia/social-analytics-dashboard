from functools import lru_cache
from pathlib import Path
import os

from pydantic import BaseModel


PROJECT_ROOT = Path(__file__).resolve().parents[4]


def _env_value(key: str, default: str = "") -> str:
    direct = os.getenv(key)
    if direct:
        return direct
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return default
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == key:
            return value.strip()
    return default


class Settings(BaseModel):
    host: str = _env_value("DASHBOARD_REDES_HOST", "127.0.0.1")
    port: int = int(_env_value("DASHBOARD_REDES_PORT", "9512"))
    mode: str = _env_value("DASHBOARD_REDES_MODE", "mock")
    project_root: Path = PROJECT_ROOT

    @property
    def platform_kpis_path(self) -> Path:
        return self.project_root / "config" / "platform-kpis.example.json"

    @property
    def env_path(self) -> Path:
        return self.project_root / ".env"

    def env_value(self, key: str) -> str:
        try:
            from app.db import session_scope, ApiCredentialOrm
            with session_scope() as session:
                cred = session.query(ApiCredentialOrm).filter(ApiCredentialOrm.credential_key == key).first()
                if cred and cred.credential_value:
                    return cred.credential_value
        except Exception:
            pass
        return ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
