# Plan — Salir de Railway: auditoría de infraestructura y migración a AWS

> **Auditoría hecha el 2026-11-09 (solo lectura), contrastada con el código y con lo que corre en Railway.**
> Donde este documento y otro discrepan, manda este: las cifras salen de `railway ssh`, del panel de uso
> de Railway y del código. Los precios de AWS son de lista (on-demand, us-east-2) y hay que reverificarlos
> antes de decidir.

## 0. Resumen

- Praxis hoy: **5 servicios** en el proyecto KYLOO SPACE de Railway (`praxis-web`, `praxis-api`, `praxis-db`,
  `praxis-redis`, `praxis-push-cron`), más los 3 de Kyloo Auth que ya no se usan.
- **La factura de ~30 USD no es de Praxis.** Es del *workspace* entero (6 proyectos). Ciclo 31-oct → 30-nov:
  uso 8,65 USD al día 9, estimado **19,09 USD**; KYLOO SPACE lleva **3,95 USD** (≈ 12-13 USD proyectados),
  HOME 2,99, macrofit 0,82, kyloo-agent 0,57. Memoria: 8,29 de los 8,65.
- **Por qué casi todo es RAM:** Railway cobra la memoria **reservada por minuto** (0,000231 USD/GB-min) y la CPU
  solo por lo que usa (0,000463 USD/vCPU-min). Una app Node casi dormida —`praxis-api`: 193 vCPU-min al mes, ≈ 0,4 %
  de un núcleo— paga RAM y casi nada de CPU. 19.483 GB-min = ≈ 0,45 GB de media. Es el comportamiento esperado.
- **No hay leak.** `praxis-api` sube de ~180 MB a ~600 MB en una semana y **se estabiliza** (tope de heap de
  512 MB). El ajuste es bajar ese tope (~320 MB), no buscar una fuga.
- **Mudarse a una EC2 no ahorra dinero** frente a lo que cuesta Praxis en Railway una vez retirado Kyloo Auth
  y bajado el heap (ver §5). Sí da control, S3 y respaldos propios. La decisión es del dueño.

## 1. Lo que corre de verdad (código vs. documentación)

| Pieza | Documentación | Código / producción | ¿Coincide? |
|---|---|---|---|
| Backend | un proceso Node: gateway + 8 servicios + collab (`PLAN-MONOLITO`) | `apps/backend/monolith/src/main.ts`: 8 servicios, collab y gateway en un proceso, bus en memoria | ✅ |
| Frontend | Next.js, un solo proceso bajo pm2, `:4100`, `server.mjs` reenvía el WebSocket de collab | `frontend.Dockerfile` + `frontend.pm2.config.cjs` + `server.mjs` | ✅ |
| Servicios de Railway | «Dos contenedores, un Postgres, un Redis. Nada más» (`RAILWAY.md`) | además **`praxis-push-cron`** | ❌ → corregido en `RAILWAY.md` |
| Kyloo Accounts | «implementado, sin desplegar» (`CLAUDE.md`) | `AUTH_MODE=kyloo` en `praxis-api` y `praxis-web`; el servidor está en AWS desde el 2026-11-08 | ❌ → corregido |
| RAM de `praxis-api` | «no es un leak, ~200-300 MB» (`PLAN-MONOLITO`) | 260 MB al arrancar, ~600 MB tras una semana y estable | ⚠️ matizado |
| Esquemas de la base | 7 con Prisma (`migrar.sh`) + `reports` sin base | 7 + un esquema **`alexa`** (152 kB: `alexa_sessions`, `alexa_link_codes`, `voice_query_logs`) de la integración de Alexa, ya retirada; ningún `schema.prisma` lo gestiona. Queda también la variable `VOICE_JWT_SECRET` | ⚠️ legado: borrar al migrar |

## 2. Datos medidos (2026-11-09)

| Servicio | Memoria | Disco |
|---|---|---|
| `praxis-api` | 262 MB recién desplegado; ~600 MB tras 6 días | — |
| `praxis-web` | 164 MB | — |
| `praxis-db` (Postgres 18.6) | 171 MB | base de **104 MB**; volumen de 4,6 GB |
| `praxis-redis` | 36 MB | 1,5 MB |
| `praxis-push-cron` | segundos, 2 veces al día | — |

Base de datos por tamaño: esquema `projects` 85 MB, el resto < 4 MB cada uno. **82 MB son archivos**:
`chat_attachment_blobs` 68 MB (49 adjuntos), `document_asset_blobs` 10 MB, `project_images` 4 MB, `user_covers` 1 MB.
Es decir: con `STORAGE_DRIVER=postgres` (el valor de producción) **los adjuntos viven dentro de Postgres**.

**Sueño (`sleepApplication`):** activo en `praxis-api`, `praxis-web` y `praxis-redis`; no en `praxis-db` (una base no
duerme). El backend está preparado para dormir (`PLAN-MONOLITO` M-K: tras 5 min sin mensajes los sondeos se callan).
Indicio de que funciona: el 2026-11-09 hubo ~17 h seguidas sin una sola línea de log de `praxis-api`. Mis mediciones
de memoria las hice despertándolo yo mismo (SSH, despliegues), así que **no son la media de un día normal**.

Hay además un volumen huérfano en el proyecto (`postgres-volume-DPi6`) que no cuelga de ningún servicio.

## 3. Redis no se puede quitar sin reescribir

Lo usan: sesiones y caché de tokens (`credentials`), caché de organizaciones y permisos (`billing`),
presencia y flujo de notificaciones en vivo (`gateway`), y el **bus de eventos** (Redis Streams: el
publicador `domain-outbox.publisher.ts` y el consumidor de `automation`). Son 36 MB: lo razonable es
**dejarlo como un contenedor más** en la máquina, con `--appendonly yes` (así lo define ya el compose local).

## 4. El cron y los avisos

`praxis-push-cron` solo dispara el recordatorio de **vencimientos** (`PushCronController`,
`POST /api/internal/push/vencimientos`). Decisión del dueño: **ya no se quiere ni el cron ni esos avisos.**

Para quitarlo del todo (hecho en el PR #48; falta borrar el servicio y la variable en Railway tras fusionarlo):
1. Borrar el servicio `praxis-push-cron` y la variable `PUSH_CRON_SECRET`.
2. Eliminar `PushCronController` y su ruta en `web` (`/api/internal/push/vencimientos`), y `PUSH_CRON_SECRET`
   de `env.validation.ts`. Sin la variable la ruta ya responde 404, así que es inofensivo hasta entonces.
3. **Se mantienen** las notificaciones push de mensajes (instantáneas, `PLAN-PUSH`): no dependen del cron.
4. Actualizar `PUSH-PRODUCCION.md` y `PLAN-PUSH.md`.

## 5. Coste: lo que dicen los números

Precios de lista, us-east-2, Linux on-demand (reverificar): `t4g.small` (2 GB) 0,0168 USD/h ≈ **12 USD/mes**;
`t4g.medium` (4 GB) ≈ **25 USD/mes**; IPv4 pública ≈ 3,65 USD/mes; EBS gp3 ≈ 0,08 USD/GB-mes; S3 ≈ 0,023 USD/GB-mes.

| Escenario | Coste mensual aproximado |
|---|---|
| **Hoy**: Praxis + Kyloo Auth sin uso en Railway | ≈ 12-13 USD (de ellos ≈ 3 son Kyloo Auth) |
| **A. Quedarse en Railway**: borrar `kyloo-auth-*`, el cron y el volumen huérfano; heap a ~320 MB | ≈ **5-7 USD** |
| **B. Praxis en la EC2 de Kyloo OAuth** (hay que pasarla a `t4g.medium`; hoy usa 821 MB de 1,8 GB) | EC2 ≈ 25 + disco ≈ 3 + IP ≈ 4 = **≈ 32 USD**, frente a ≈ 17 de la EC2 actual + 5-7 de Railway = ≈ 23 |
| **C. EC2 propia para Praxis** (`t4g.small` no cabe con holgura; `t4g.medium`) | ≈ 32 USD extra |

Conclusión: **B y C cuestan más que A.** Con 6 usuarios, Railway cobra por uso real y una EC2 por reserva.
Salir de Railway solo compensa por otras razones (control, un único proveedor, S3, créditos de AWS, o apagar
también el resto de proyectos del workspace, que son los que más pesan en la factura).

## 6. Si se migra (B o C): qué hay que saber

Lo bueno: el molde de Kyloo OAuth sirve casi tal cual (compose + Caddy, imágenes en ECR, despliegue por SSM con
vuelta atrás, `pg_dump` diario a S3, alarmas de CloudWatch).

Lo que hay que resolver, comprobado en el código:
- **Imágenes ARM** (`t4g`): `backend.Dockerfile` y `frontend.Dockerfile` parten de `node:22-bookworm-slim`
  (multi-arch). Prisma **no** declara `binaryTargets`: genera el motor para la plataforma donde se construye,
  así que hay que construir **en arm64** (no copiar una imagen x86). `bcrypt` ^6 trae binarios arm64.
- **Migraciones:** `start-backend.sh` ya aplica las de Prisma de los 7 servicios al arrancar (idempotente).
- **Postgres 18 → 18:** el volcado se restaura sin cambios (mismo mayor que Railway).
- **Entrada pública:** hoy solo `praxis-web` tiene dominio; el gateway va por red privada. Con Caddy: un único
  host `usepraxis.space` hacia `web:4100`, con soporte de WebSocket (`/api/collab`, lo gestiona `server.mjs`).
- **Webhook de Stripe:** entra por `web` (`/api/webhooks/stripe` → gateway). El endpoint en Stripe no cambia si
  el dominio es el mismo.
- **DNS:** `usepraxis.space` está en Hostinger (apex con A a Railway, `www` CNAME a Railway). Hay que repuntar ambos.
- **Dominio y OAuth de Google:** los URI de redirección dependen del dominio, no del servidor: sin cambios.
- **Adjuntos a S3:** hoy `STORAGE_DRIVER=postgres` (también existe `gcs`). Hace falta un tercer driver
  `s3` en `BlobStorageModule` (`apps/backend/services/assistant/src/storage/`). Con 82 MB no es urgente;
  sí conviene antes de que crezca (la base y sus respaldos se hinchan con los archivos).
- **Kyloo:** `KYLOO_ISSUER` no cambia. El SDK ya está en `@kyloo/auth` 0.2.1.

## 7. Ajustes que valen en cualquier escenario

1. Borrar en Railway los 3 servicios `kyloo-auth-*` y el volumen huérfano `postgres-volume-DPi6` (≈ 3 USD/mes).
2. Quitar el cron y los avisos de vencimientos (§4).
3. Bajar `--max-old-space-size` de 512 a ~320 en `start-backend.sh` y vigilar que no haya reinicios por memoria.
   Para descartar un leak de verdad, registrar `v8.getHeapStatistics().used_heap_size` cada hora: si **después
   del GC** sube sin parar durante días, hay fuga; si oscila, es el margen de V8.
4. Borrar el esquema `alexa` y `VOICE_JWT_SECRET` (integración retirada; la base de la nueva máquina no lo necesita).

## 8. Decisiones abiertas

- ¿Se quiere salir de Railway aun sabiendo que **no baja la factura** de Praxis? ¿Hay créditos de AWS?
- ¿Misma EC2 que Kyloo OAuth o una aparte? Juntarlas acopla el login de todo al ciclo de vida de Praxis.
- ¿Adjuntos a S3 ya, o más adelante?
- ¿Se mantiene la suspensión por inactividad de Railway (`quitarSondeoDeRedis` existe por eso)? En una EC2 no aplica.
