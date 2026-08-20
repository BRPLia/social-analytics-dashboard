import sys
from pathlib import Path


script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent.parent
backend_dir = project_root / "apps" / "backend"
sys.path.append(str(backend_dir))

from app.core.config import get_settings
from app.db import init_db, session_scope
from app.services.dashboard import DashboardService


def main():
    print("Iniciando verificacion de payload persistido...")

    print("Inicializando base de datos...")
    init_db()

    settings = get_settings()
    with session_scope() as session:
        print("Obteniendo payload de dashboard...")
        service = DashboardService(session, settings)
        payload = service.payload()

        print("\n=== VERIFICACION DE PAYLOAD ===")
        print(f"Generado en: {payload.generated_at}")
        print(f"Canales cargados: {len(payload.channels)}")
        print(f"Cuentas sociales: {len(payload.accounts)}")

        print("\n--- Resumen Global de KPIs ---")
        summary = payload.summary
        print(f"Vistas: {summary.views} (Delta: {summary.views_delta})")
        print(f"Interacciones: {summary.interactions} (Delta: {summary.interactions_delta})")
        print(f"Seguidores totales: {summary.followers_count} (Delta: {summary.followers_delta})")
        print(f"Retencion promedio: {summary.retention_rate}% (Delta: {summary.retention_delta}%)")
        print(f"Volumen de posts: {summary.post_count} (Delta: {summary.post_count_delta})")

        print("\n--- Snapshots por Plataforma ---")
        for plat in payload.platforms:
            print(
                f"- {plat.platform} ({plat.channel_id}): "
                f"Views={plat.views} (Delta={plat.views_delta}), "
                f"Followers={plat.followers_count} (Delta={plat.followers_delta}), "
                f"Interactions={plat.interactions} (Delta={plat.interactions_delta})"
            )

        print("\n--- Contenido Top (Primeros 3) ---")
        for idx, content in enumerate(payload.top_content[:3]):
            print(
                f"{idx + 1}. {content.title[:40]}... en {content.platform} | "
                f"Views: {content.views} | URL: {content.url} | Diagnosis: {content.diagnosis}"
            )

    print("\nPrueba de payload exitosa sin errores de validacion.")


if __name__ == "__main__":
    main()
