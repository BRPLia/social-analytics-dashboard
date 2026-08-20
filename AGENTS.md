# dashboard-redes — Guía para agentes y colaboradores

Lee este archivo antes de modificar el proyecto.

## Objetivo
Dashboard local para consolidar y analizar el rendimiento de cuentas de redes sociales,
homologando métricas dispares bajo una temporalidad única.

## Reglas de trabajo
- **Portabilidad:** nada debe depender de rutas absolutas ni de un sistema operativo concreto.
- **Configuración en base de datos:** marcas, cuentas y plataformas activas viven en SQLite y se
  gestionan desde la interfaz. Añadir o quitar una red no debe exigir tocar componentes de la UI.
- **Credenciales:** tokens y secretos viven únicamente en SQLite, cargados desde la interfaz web.
  `.env` se limita a host, puerto y modo de ejecución. Nunca se commitea una credencial.
- **Contratos normalizados:** la UI consume modelos normalizados, no respuestas crudas de las APIs.
- **Conectores aislados:** cada plataforma se integra como un módulo independiente en
  `apps/backend/app/connectors/`.
- **Degradación segura:** si un conector falla debe devolver estado degradado y diagnóstico,
  nunca romper el dashboard completo.

## Criterios de calidad (ISO/IEC 25010)
- **Mantenibilidad:** módulos pequeños, contratos tipados, conectores desacoplados.
- **Portabilidad:** aplicación local, estado en SQLite, `.env` mínimo, sin dependencia de proveedor.
- **Seguridad:** el backend es el único lugar donde se manejan credenciales OAuth.
- **Fiabilidad:** modo `mock` verificable y endpoint de healthcheck.
- **Usabilidad:** panel denso y legible, sin texto tutorial incrustado en la interfaz.

## Antes de dar por cerrado un cambio
1. Verificar que el backend arranca y `/api/health` responde.
2. Verificar que el frontend compila (`pnpm typecheck`).
3. Comprobar que no se ha añadido ninguna credencial ni dato personal al control de versiones.
