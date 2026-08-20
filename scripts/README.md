# Scripts de Soporte y Diagnóstico

Esta carpeta contiene utilidades y scripts complementarios para pruebas y depuración del sistema de sincronización e ingesta de **Dashboard Redes**.

> [!NOTE]
> Estos scripts son utilidades de consola y **no** interfieren con el funcionamiento diario del backend FastAPI. Han sido organizados en `utils/` para mantener limpio el directorio raíz de la herramienta.

---

## Catálogo de Herramientas (`scripts/utils/`)

### 1. 🔍 `inspect_db.py`
Permite inspeccionar los esquemas, registros activos, y snapshots persistidos en la base de datos SQLite local (`storage/dashboard_redes.db`). Es ideal para depurar de forma rápida y ver el peso de las tablas.

### 2. 🏗️ `sandbox_migration.py`
Script de migración rápida utilizado originalmente para poblar esquemas y simular data de sandbox.

---

## Cómo Ejecutar los Scripts

Para ejecutar cualquiera de las herramientas, sitúate en la raíz del backend y lanza Python apuntando a la subcarpeta:

```powershell
cd apps/backend
python ..\..\scripts\utils\inspect_db.py
```
