from __future__ import annotations

from sqlalchemy.orm import Session
from app.core.config import Settings


def bootstrap_configured_accounts(session: Session, settings: Settings) -> None:
    """
    Función no-op (desactivada). El dashboard inicia en blanco de fábrica
    y las marcas/canales se crean dinámicamente desde la interfaz.
    """
    return
