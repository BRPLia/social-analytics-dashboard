# Guía de credenciales

Cómo obtener el acceso a las APIs de cada plataforma.

> Empieza por **YouTube público**: es la credencial más fácil de obtener y ya te permite ver
> la herramienta funcionando con datos reales.
>
> Si solo quieres echar un vistazo antes de dar de alta nada, carga los **datos de ejemplo**
> desde la pantalla de bienvenida (ver README).

Todas las credenciales se cargan desde la interfaz web, en **Configuración**. No edites
archivos: se guardan en tu SQLite local y nunca salen de tu equipo.

> ⚠️ **Se guardan en texto plano**, no cifradas. Cualquiera con acceso al archivo
> `storage/dashboard_redes.db` puede leer tus tokens. El archivo está en `.gitignore`, así que
> no se publica, pero protégelo como protegerías un `.env`: no lo copies a carpetas
> sincronizadas ni lo adjuntes en ningún sitio.

| Plataforma | Dificultad | Coste | Qué desbloquea |
| :--- | :--- | :--- | :--- |
| YouTube público | 🟢 Baja (5 min) | Gratis | Vistas, likes, comentarios, suscriptores |
| YouTube Analytics | 🟡 Media (15 min) | Gratis | Retención, tiempo de visualización, suscriptores netos |
| Facebook e Instagram | 🔴 Alta (30 min) | Gratis | Alcance, guardados, compartidos, vídeo |
| TikTok | 🟢 Baja (5 min) | **De pago** | Reproducciones, likes, comentarios, guardados |

---

## 1. YouTube — datos públicos

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. Ve a **APIs y servicios → Biblioteca**, busca **YouTube Data API v3** y actívala.
3. Ve a **Credenciales → Crear credenciales → Clave de API**.
4. Copia la clave y pégala en la interfaz, en `YOUTUBE_API_KEY`.

**Cuota:** 10.000 unidades al día, gratis. Una sincronización completa consume muy poco.

---

## 2. YouTube — retención y tiempo de visualización

Requiere OAuth porque son datos privados del canal. **Solo funciona con canales que tú administras.**

1. En el mismo proyecto, activa también **YouTube Analytics API**.
2. Ve a **Pantalla de consentimiento de OAuth**, configúrala como **Externa** y añade tu
   cuenta de Google como usuario de prueba.
3. Ve a **Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo: **Aplicación web**
   - URI de redirección autorizado: `http://127.0.0.1:9512/api/settings/youtube/oauth/callback`
4. Copia el **Client ID** y el **Client Secret** en la interfaz.
5. Pulsa **Conectar con Google** en el panel de configuración y autoriza el acceso.

> ⚠️ La YouTube Analytics API tiene un retraso de procesamiento de **48 a 72 horas**. Las
> vistas públicas se ven al instante; la retención de un vídeo de ayer todavía no está.

---

## 3. Facebook e Instagram

Es la más laboriosa. Instagram debe ser una **cuenta profesional o de empresa vinculada a
una página de Facebook** — con una cuenta personal no hay métricas disponibles.

1. Entra a [Meta for Developers](https://developers.facebook.com/) y crea una app de tipo
   **Empresa**.
2. Abre el **Explorador de la API Graph**.
3. Selecciona tu app y genera un token de usuario con estos permisos:
   - `pages_show_list`
   - `pages_read_engagement`
   - `read_insights`
   - `instagram_basic`
   - `instagram_manage_insights`
4. **Convierte el token en uno de larga duración.** El que genera el explorador caduca en
   una hora. Usa la [Herramienta de depuración de tokens](https://developers.facebook.com/tools/debug/accesstoken/)
   y pulsa **Extender token de acceso** (pasa a durar ~60 días).
5. Pega ese token en la interfaz, en `META_USER_ACCESS_TOKEN`.
6. Pulsa **Descubrir cuentas**: la herramienta lista automáticamente tus páginas y las
   cuentas de Instagram vinculadas. No necesitas buscar IDs a mano.

> El token caduca cada ~60 días y hay que renovarlo repitiendo los pasos 3 a 5.

---

## 4. TikTok (opcional, de pago)

TikTok no ofrece una API pública de analítica para perfiles propios, así que la ingesta se
hace mediante scraping de perfiles públicos con [Apify](https://apify.com/).

1. Crea una cuenta en Apify.
2. Ve a **Settings → Integrations** y copia tu **API token**.
3. Pégalo en la interfaz, en `APIFY_API_TOKEN`.
4. Añade la cuenta indicando el handle (`@tumarca`) o la URL del perfil.

**Coste:** Apify tiene un plan gratuito limitado; el uso continuado es de pago. El actor
utilizado es `clockworks~tiktok-profile-scraper`.

---

## Solución de problemas

| Síntoma | Causa habitual |
| :--- | :--- |
| Instagram devuelve error o no aparece | La cuenta no es profesional, o no está vinculada a la página de Facebook |
| El token de Meta deja de funcionar | Caducó. Regenéralo y vuelve a extenderlo |
| YouTube no muestra retención | Falta el OAuth, o el vídeo tiene menos de 72 horas |
| `redirect_uri_mismatch` al conectar Google | El URI de redirección no coincide exactamente con el del paso 2.3 |
