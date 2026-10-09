# Plan OAuth y Kyloo Accounts

> **Estado: implementado en la rama `feature/descripcion-md-legal-oauth` (2026-10-09), sin
> desplegar.** Cierra M7 de [PLAN-MCP.md](PLAN-MCP.md) y añade «Continuar con Kyloo» al login.
> Va acompañado de una rama `fix/endurecimiento-y-mcp` en el repo hermano **KYLOO-AUTH**
> (`../KYLOO-AUTH`, el servidor de `accounts.kyloo.com.mx`). **Las dos se despliegan juntas**: el
> orden y lo que falta está en «Antes de producción».

---

## Qué se decidió

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Kyloo Accounts es el servidor de autorización del MCP; Praxis es el servidor de recursos.** Praxis no emite tokens, solo los verifica | La especificación de MCP separa los dos. Lo contrario (OAuth dentro de credentials-service) era reimplementar lo que Accounts ya tiene |
| D2 | **Vinculación, no cuentas compartidas.** Cada producto conserva sus cuentas, roles y planes; Accounts solo acredita la identidad | Es la idea del dueño (2026-10-02). Praxis no sabe de Accounts más que `kylooSub` |
| D3 | **Se vincula por `kylooSub` y, la primera vez, por correo verificado — solo si la cuenta de Praxis ya confirmó su buzón.** Si no, 409 | La trampa de heredar cuentas ajenas (ver `loginWithGoogle`). Hoy registrarse exige confirmar el correo, así que `emailVerifiedAt` ya prueba la posesión |
| D4 | **Registro dinámico de clientes (RFC 7591), endurecido.** Solo públicos con PKCE, `redirect_uri` en lista blanca, scopes del MCP, sin nombres que suplanten a la casa, nunca `skip_consent`, y la pantalla de consentimiento los marca «no verificados» | ChatGPT y Claude web se dan de alta solos: no se pueden registrar a mano |
| D5 | **El token OAuth no lleva la organización, lleva `praxis_connection`.** La conexión (`McpConnection`) guarda un conjunto de organizaciones y una activa | La persona pidió poder usar el MCP en varias organizaciones **sin borrar y volver a conectar**. Con la organización dentro del token, cambiarla exigiría otro token |
| D6 | **La organización se elige entre iniciar sesión y consentir** (`/organizacion`, `postLogin` de oauth-provider), preguntando a Praxis con una llamada firmada | Es lo que se acordó. El selector sale de Praxis porque Accounts no sabe de organizaciones |
| D7 | **Cambiar de organización es una herramienta del MCP** (`switch_organization`) **y una pantalla** (Integraciones). Ampliar el conjunto solo se hace en la pantalla | El agente puede moverse dentro de lo que la persona le dio; no puede darse más |

## Invariantes

1. **I2 sigue en pie**: ninguna herramienta recibe «la organización» como dato. `switch_organization`
   usa `targetOrgId` y **cambia la sesión**, no opera dentro de otra; el servidor comprueba que esté
   entre las de la conexión *y* que sea usable (plan, interruptor, pertenencia).
2. **Revocar o cambiar de organización surte efecto en la siguiente llamada**, no cuando caduque el
   token (I4). Por eso la organización no viaja en el token y `mcp_conn_session` se consulta en cada
   petición.
3. **El `sub` del token tiene que ser el de la conexión.** Sin eso, un token de Kyloo de otra persona
   o de otro cliente podría presentarse con el id de una conexión ajena.
4. **`aud` = la dirección del MCP** (RFC 8707). Un token pedido para otro recurso, o el `id_token`
   de otra aplicación de Kyloo, no abre el MCP.
5. **Las llamadas de Accounts a Praxis van firmadas** (HMAC de hora, método, ruta y cuerpo crudo) y
   la identidad que traen sale de una sesión de Kyloo con el correo verificado, nunca del cuerpo.
6. **Cambiar la contraseña revoca también las conexiones OAuth** (`revocarTodos`).

## Cómo funciona

```
cliente de IA ── POST /api/mcp ─────────────▶ 401 + WWW-Authenticate: resource_metadata=…
cliente de IA ── GET  /.well-known/oauth-protected-resource/api/mcp ──▶ { authorization_servers: [Accounts] }
cliente de IA ── GET  accounts…/.well-known/oauth-authorization-server/api/auth
cliente de IA ── POST accounts…/api/auth/oauth2/register          (DCR)
persona       ── authorize ▶ /entrar ▶ /organizacion ▶ /consentimiento ▶ código
cliente de IA ── POST accounts…/oauth2/token  resource=…/api/mcp ──▶ JWT { aud, scope, praxis_connection }
cliente de IA ── POST /api/mcp  Bearer <JWT> ──▶ verifica firma+iss+aud ▶ mcp_conn_session ▶ JWT interno de 2 min
```

**Entrar con Kyloo** (login, no MCP): `/auth/api/kyloo/start` → Accounts → `/auth/api/kyloo/callback`
→ gateway `POST /auth/kyloo` → credentials-service canjea el código con el secreto del cliente y
verifica el `id_token`.

## Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Cliente OIDC (canje, JWKS, userinfo) | `credentials/src/auth/kyloo-oidc.service.ts` |
| Login con Kyloo (vinculación) | `credentials/src/auth/auth.service.ts` → `loginWithKyloo` |
| Conexiones OAuth | `credentials/src/personal-tokens/mcp-connections.service.ts`, modelo `McpConnection` |
| Verificación del token OAuth | `gateway/src/mcp/kyloo-oauth.service.ts` |
| Sesión OAuth, sesión bloqueada | `gateway/src/mcp/mcp-access.service.ts` (`abrir`, `abrirConOAuth`) |
| Herramientas de organización | `gateway/src/mcp/mcp-tools.ts` (`list_organizations`, `switch_organization`) |
| Rutas internas para Accounts + firma | `gateway/src/mcp/kyloo-internal.{controller,guard}.ts` |
| Pantalla de conexiones | `web/…/Integrations/ConexionesDeIa.tsx` |
| Paso al gateway (internas) y metadatos RFC 9728 | `web/src/app/api/internal/kyloo/`, `web/src/app/.well-known/oauth-protected-resource/` |
| Flujo del navegador | `web/src/lib/auth/kyloo.ts`, `web/src/app/auth/api/kyloo/{start,callback}` |

En KYLOO-AUTH: `apps/api/src/{auth,config}.ts`, `oauth/{dcr-policy,privilegios,scopes}.ts`,
`praxis/*`, `http/praxis.routes.ts`, y en `apps/accounts` las páginas `consentimiento` y `organizacion`.

## Lo que se encontró en KYLOO-AUTH (auditoría)

Corregido en `fix/endurecimiento-y-mcp`:

| Sev. | Hallazgo | Arreglo |
|---|---|---|
| 🔴 | **Cualquier cuenta registrada creaba clientes OAuth** por `POST /oauth2/create-client` (comprobado: un cliente «Kyloo Soporte Oficial» con un `redirect_uri` propio). `clientPrivileges` y `resourcePrivileges` estaban sin definir | Solo admiten el secreto interno del proceso (`oauth/privilegios.ts`); prueba `@security` |
| 🔴 | El login se **tematizaba por nombre de cliente**: un cliente llamado «praxis» vestía el login de Praxis (suplantación) | Solo se tematiza un cliente `verified` (dado de alta con `skip_consent`); el resto muestra «aplicación no verificada» |
| 🟠 | `REQUIRE_EMAIL_VERIFICATION` y `RATE_LIMIT_ENABLED` arrancaban en falso por omisión; los productos que confían en `email_verified` heredaban cuentas sin verificar | `loadConfig` **falla al arrancar en producción** si faltan, y si falta https, la clave de correo o el secreto es el de ejemplo |
| 🟠 | El límite de peticiones usaba el **primer** valor de `x-forwarded-for` (lo escribe quien llama) y `trustProxy: true` | `apps/accounts` escribe la IP real en una cabecera propia; sin `trustProxy` |
| 🟠 | 300 intentos/min globales para contraseñas | Límites por ruta en Better Auth (5/min en login, 10/h en registro…) |
| 🟡 | `client_credentials` anunciado sin usarse | `grantTypes` solo `authorization_code` y `refresh_token` |
| 🟡 | Sin rotación de claves JWKS | Rotación a 90 días con 30 de gracia |
| 🟡 | `consentPage` apuntaba a una página que no existía | `/consentimiento` |
| 🟡 | Metadatos solo bajo `/api/auth/.well-known`; los clientes MCP prueban primero la inserción de ruta (RFC 8414) | Reenvío en `apps/accounts` |
| 🟡 | El README decía que el `id_token` traía `email`/`name`/`email_verified`: **no los trae** (solo `userinfo`) | README corregido; Praxis pide `userinfo` |
| 🟢 | Los clientes de la casa quedaban enlazados al recurso del MCP | `seed:clients` los desenlaza |

**Sin tocar, a propósito:** CSP con `'unsafe-inline'` en scripts (Next lo necesita sin nonces);
rate limit en memoria (un proceso).

## Trampas

- 🔴 **El `id_token` de Accounts no trae el correo.** Si un producto nuevo lo da por hecho, no
  falla: entra sin identidad. Hay que pedir `userinfo` y exigir `sub` igual.
- ⚠️ **`consentReferenceId` se llama tres veces por autorización** (al continuar, al consentir y al
  emitir el código): la elección de organización se lee, no se consume.
- ⚠️ **`shouldRedirect` de `postLogin` tiene que acabar diciendo que no**, o el flujo no sale del
  bucle. Por eso la elección se recuerda por (sesión, cliente) y caduca a los 15 minutos.
- ⚠️ **Un `import type` de una clase inyectada rompe Nest sin error**; y un ciclo entre
  `kyloo-oauth.service` y `mcp-access.service` lo habría hecho igual → `McpAccessError` vive en
  `mcp-errors.ts`.
- ⚠️ **La firma HMAC cubre el cuerpo crudo.** El paso de `web` reenvía `arrayBuffer`, no JSON
  reserializado.
- ⚠️ `/.well-known/` está fuera del `matcher` de `proxy.ts`.
- ⚠️ **Los hosts de `DCR_REDIRECT_ORIGINS` son una suposición** hasta probar con ChatGPT y Claude
  reales (`claude.ai`, `claude.com`, `chatgpt.com`, `vscode.dev`). Un destino que falte da 400 en el
  registro, con el motivo. Cursor usa un esquema propio (`cursor://`) y **no está admitido todavía**;
  los clientes de escritorio (Claude Code) entran por el bucle local.

## Antes de producción

Nada de esto está hecho; **no se ha leído ni tocado Railway** (el sistema denegó la lectura de
variables de producción y no se rodeó).

1. **KYLOO-AUTH** (`kyloo-auth-api`): aplicar la migración (`pnpm db:migrate`; añade
   `praxis_selection`) **antes** de arrancar la versión nueva. Variables: `REQUIRE_EMAIL_VERIFICATION=true`,
   `RATE_LIMIT_ENABLED=true`, `RESEND_API_KEY`, `MCP_RESOURCES=https://usepraxis.space/api/mcp`,
   `DCR_ENABLED=true`, `PRAXIS_INTERNAL_URL=https://usepraxis.space`, `PRAXIS_INTERNAL_SECRET`
   (32+ caracteres). Si alguna falta, **el servicio no arranca** — es lo previsto.
2. **KYLOO-AUTH** (`kyloo-auth-accounts`): nada nuevo. El servicio API debe ser alcanzable solo por
   red privada.
3. Dar de alta Praxis como cliente:
   `pnpm --filter @kyloo-auth/api run seed:clients praxis https://usepraxis.space/auth/api/kyloo/callback`
   (una vez por entorno; el secreto sale una sola vez).
4. **Praxis, `api`** (monolito): `KYLOO_ISSUER=https://accounts.kyloo.com.mx/api/auth`,
   `KYLOO_CLIENT_ID`, `KYLOO_CLIENT_SECRET`, `MCP_RESOURCE_URL=https://usepraxis.space/api/mcp`,
   `KYLOO_INTERNAL_SECRET` (el mismo que `PRAXIS_INTERNAL_SECRET`), y `prisma:deploy` (dos migraciones
   de credentials).
5. **Praxis, `web`**: `KYLOO_ISSUER`, `KYLOO_CLIENT_ID`, `MCP_RESOURCE_URL`, `NEXT_PUBLIC_KYLOO_LOGIN=1`.
6. Probar con **ChatGPT y Claude web reales** y ajustar `DCR_REDIRECT_ORIGINS`. Probar a mano en un
   navegador `/organizacion`, `/consentimiento` y el botón «Continuar con Kyloo».
7. Rellenar `razonSocial` y `domicilio` en `web/src/content/legal/entidad.ts` y crear los buzones
   `privacidad@` y `soporte@usepraxis.space`.

## Qué se verificó

- KYLOO-AUTH: 32 pruebas de integración (flujo completo con registro dinámico, consentimiento
  parcial, `aud`, `invalid_target`, elección de organización, claims) y 8 unitarias.
- Praxis: pruebas del verificador OIDC y de la vinculación, de las conexiones, del guard HMAC y del
  verificador de tokens OAuth.
- **De punta a punta, en local, con los dos sistemas reales**: cuenta de Kyloo → registro dinámico →
  `/organizacion` (lista firmada contra el gateway) → consentimiento sin «borrar» → token → MCP de
  Praxis (`initialize`, `tools/list`, `list_organizations`, `list_projects`, `delete_task` negado,
  `switch_organization` ajena negada) → revocar → 401 en la siguiente llamada.
- **No verificado**: las pantallas en un navegador (solo `tsc`), ChatGPT/Claude reales, y producción.
