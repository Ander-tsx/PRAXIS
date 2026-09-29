# Plan — Monolito modular: un proceso en vez de once

> **Etapa cerrada y desplegada** (2026-09-29, `f5532d08` en `main`, rama `feature/prax-semiagentico`). Va
> **antes** de [PLAN-PRAX-SEMIAGENTICO](PLAN-PRAX-SEMIAGENTICO.md), que queda en
> pausa hasta cerrar esta.
>
> ⚠️ Toca el backend entero por decisión del dueño del producto.
>
> **Se sigue estrictamente.** Una sesión que retome esto lo lee entero y marca
> la casilla de cada fase, con su commit, al cerrarla.

## 0. Por qué

La factura de Railway del 31-08 al 30-09 es de **$22**. De ella, **$8,68 son
RAM de `praxis-api`**. La CPU del mismo servicio es de **$0,39**, con una media
de **0,02 vCPU**: está casi dormido y paga memoria todo el mes.

Railway cobra $0,000231 por GB-minuto. 37.487 GB-min en 29 días son **~0,9 GB
ocupados sin parar**. No es un leak. Es el coste fijo de **11 procesos Node**:
el gateway, diez servicios y pm2. Cada uno carga su propio V8, NestJS y
librerías aunque no haga nada. Medido en local el 2026-09-29, con el backend
construido y en reposo (`footprint`, huella física):

| Proceso | RAM |
|---|---|
| gateway | 154 MB |
| cada uno de los 9 servicios NestJS | 119–131 MB |
| collab (sin NestJS) | 59 MB |
| **Total** | **1.335 MB** |

`reports`, que no tiene ni base de datos, ocupa 121 MB. El tope de 256 MB por
proceso (`6be6b4a0`, 19-09) cortó los picos de los despliegues, pero no puede
bajar la base.

**El objetivo: un solo proceso Node, ~200-300 MB, y `praxis-api` de ~$9 a
~$2-3 al mes.**

Es la misma conclusión que la de [PLAN-FUSION-ZONAS](PLAN-FUSION-ZONAS.md) en el
frontend: el reparto en procesos se paga entero y no da ningún beneficio,
porque ya corrían todos en **un solo contenedor**.

## 1. Decisiones

**M1 — Un proceso, un contexto Nest por servicio.** No se fusionan los módulos
en un solo `AppModule`. Cada servicio conserva su `AppModule`, su contenedor de
inyección, su `ConfigModule` y su Prisma, y arranca con
`NestFactory.createMicroservice(AppModule, { strategy })`. Así:

- no se mezclan proveedores globales;
- el código de negocio no se toca;
- la capa de mensajes se puede ir quitando más adelante, módulo a módulo, si
  algún día compensa.

**M2 — Transporte en proceso, con la semántica exacta de TCP.** Un paquete
nuevo, `@praxis/local-transport`, con dos piezas:

- **`LocalServer`**: una `CustomTransportStrategy` que registra sus manejadores
  en un bus del proceso.
- **`LocalClient`**: un `ClientProxy` que los invoca.

Tres reglas que no se negocian:

- **Todo cruza por `JSON.parse(JSON.stringify(x))`**, a la ida y a la vuelta.
  TCP lo hace así, y los servicios dependen de ello: las fechas llegan como
  cadena, `undefined` desaparece y nadie comparte referencias mutables.
  Saltárselo no da error: da un `Date` donde el código espera un `string`.
- **Los errores viajan con la forma de TCP.** El gateway lee `statusCode` por la
  forma del objeto, no por la clase (`standard-exception.filter.ts:194-200`).
  Se reutiliza `Server.send()` de Nest para que el sobre `{ err, response,
  isDisposed }` sea el mismo.
- **Se entrega siempre en otra vuelta del bucle de eventos**, nunca de forma
  síncrona. Como en TCP.

El bus vive en `globalThis[Symbol.for(…)]` y no en una variable de módulo: si
alguna vez se resuelven dos copias del paquete, siguen viendo el mismo.

**M3 — Una sola factoría de clientes, y TCP se queda.** `clienteDeServicio('PROJECTS')`
sustituye a los ~35 `ClientsModule.registerAsync` y a los 5
`ClientProxyFactory.create` repartidos por el código. Con
`PRAXIS_TRANSPORT=local` devuelve `LocalClient`; sin él, TCP como hoy. **El
desarrollo (`dev:backend`) y las pruebas de integración siguen en TCP**:
`automation-health.integration.spec.ts` levanta un microservicio TCP, y
`nest start --watch` por servicio sigue siendo la forma cómoda de escribir
código.

**M4 — Cada servicio lee su propia URL de base de datos.** En un solo
`process.env`, un único `DATABASE_URL` haría que los 7 Prisma escribieran en el
schema del primero, sin un error. Los `PrismaService` leen
`<SERVICIO>_DATABASE_URL` y, si no existe, `DATABASE_URL`, para que los `.env`
de desarrollo sigan valiendo. El monolito compone las siete a partir de
`POSTGRES_*`, igual que hace hoy `backend.pm2.config.cjs`. De paso,
`automation` y `billing` pasan a respetar `DATABASE_POOL_MAX`: hoy abren 10
conexiones cada uno.

**M5 — El `ValidationPipe` de los servicios sigue sin validar los mensajes.**
Hoy **no se aplica** a los mensajes TCP. Se monta en la app Express híbrida y
Nest 11 no lo hereda sin `inheritAppConfig`. Activarlo ahora, con
`forbidNonWhitelisted`, rompería llamadas que funcionan. El monolito **no lo
monta**, y la forma actual de arrancar se sustituye sin cambiar ese
comportamiento. Validar los mensajes entre servicios es una mejora posible,
pero **aparte**, con su auditoría.

**M6 — collab entra al proceso como función.** Hoy `main.ts` hace todo al
importarse: `dotenv`, lee el entorno arriba del archivo y crea el cliente TCP.
Pasa a exportar `arrancarCollab({ puerto, jwtSecret, projects })`, y su
`main.ts` queda como envoltorio para desarrollo. Sigue escuchando en
`127.0.0.1:3010` detrás de `montarProxyDeCollab`. Es ESM, así que el monolito
lo carga con `import()` dinámico.

**M7 — Sin pm2.** El contenedor arranca con `node apps/backend/monolith/dist/main.js`.
Si el proceso muere, Railway reinicia el contenedor: es lo que pm2 hacía por
proceso, y con uno solo sobra. El techo de heap pasa a
`--max-old-space-size=512`, para todo.

**M8 — Una sola copia de NestJS.** `class-validator` se unifica en `^0.15.1`.
Hoy hay dos versiones, y pnpm resuelve **dos copias** de `@nestjs/*`: en un solo
proceso serían dos copias en memoria.

**M9 — Alexa se elimina entera.** «No se volverá a usar jamás.» El servicio,
sus rutas y guard en el gateway, sus contratos, la prueba `12-voz`, pm2, los
**dos** Dockerfile, `migrar.sh`, el dev-cli y la documentación. El schema
`alexa` de Postgres se queda huérfano, sin estorbar. Borrarlo es un
`DROP SCHEMA alexa CASCADE` a mano, que **no** se hace desde el código.
`apps/PraxisSkill/` se archiva en el mismo commit.

**M10 — De `reports` se borra lo muerto; el servicio sigue hasta PRAX F3.**
Solo está vivo `report_briefing`, el contexto de PRAX con proyecto.
Se borra:

- las 11 rutas de análisis del gateway y la de `portfolio`: cero llamadas desde
  el frontend;
- `report-layouts` y el modelo `ReportLayout`, con migración;
- `QuickAccess`, que enlaza a `/reports` y da 404;
- `proponer_grafico` y `ChartProposalCard`: una propuesta sin botón.

El servicio en sí entra al monolito como un contexto más, que en RAM casi no
cuesta. Se borra entero cuando las consultas `consultar_*` de
PLAN-PRAX-SEMIAGENTICO D3 sustituyan al briefing. `canViewReports` **se
queda**: decide el acceso a PRAX.

## 2. Invariantes

- **I1** — Ningún cambio de comportamiento visible. `e2e:regresion` sale igual
  antes y después, salvo las pruebas de lo que se borra a propósito
  (`12-voz` y los casos `/reports/*`).
- **I2** — Lo que cruza entre servicios pasa por JSON, siempre, en los dos
  transportes.
- **I3** — Cada Prisma escribe en su schema. Se comprueba al arrancar: cada
  servicio registra el schema al que se conectó.
- **I4** — TCP sigue funcionando: desarrollo, pruebas de integración y, si hiciera
  falta, volver a desplegar separado.

## 3. Orden

- [x] **M-A — Fuera Alexa** (`ea954e9d`) (M9). Primero, porque quita un servicio y dos
  clientes que ya no hay que convertir.
- [x] **M-B — Una sola copia de NestJS** (`173538e4`) (M8). `pnpm why @nestjs/core` tiene
  que dar una ruta.
- [x] **M-C — `@praxis/local-transport`** (`06d38e5a`) (M2) y pruebas unitarias propias:
  - fechas a cadena;
  - `undefined` fuera;
  - sin referencias compartidas;
  - `RpcException` con `statusCode`;
  - un `Observable` de varios valores;
  - un error lanzado a mano;
  - un patrón que no existe.
- [x] **M-D — La factoría de clientes** (`c2b3b97e`) (M3) en los ~40 sitios. Con TCP por
  defecto: `pnpm test` y `e2e:regresion` sin cambios.
- [x] **M-E — URL de base de datos por servicio** (`a4e0d6ee`) (M4) y la fuga de conexiones
  de `automation` y `billing`.
- [x] **M-F — collab como función** (`1637a60f`) (M6); arranque del gateway exportable.
- [x] **M-G — `apps/backend/monolith`**: el arranque único. `start:backend` pasa
  a usarlo. Medir la RAM con el mismo método de §0. `e2e:regresion` contra el
  monolito.
- [x] **M-H — Imagen y Railway** (falta probar la imagen) (M7): Dockerfile sin pm2 y `start-backend.sh`
  con `exec node`. `docs/deploy/RAILWAY.md` actualizado.
  ⚠️ **Desplegar es fusionar a `main`**, y eso lo decide el dueño del producto.
- [x] **M-I — Lo muerto de `reports`** (M10).
  - **Fuera**: las 11 rutas del gateway más `portfolio` y `layout`, el módulo
    `report-layouts` de projects, su DTO y `QuickAccess`.
  - **Pruebas**: las e2e que probaban `canViewReports` con `/reports/snapshot`
    ahora lo prueban con `/assistant/quota`. El permiso sigue vivo, porque
    decide quién habla con PRAX de un proyecto.
  - **Dos cambios de alcance**:
    - La **tabla `ReportLayout` se queda**. No se pudo ver qué hay en
      producción (`praxis-db` no tiene URL pública) y no se borran datos sin
      mirarlos. Su modelo lleva la nota; el `DROP` es una migración aparte.
    - **`proponer_grafico` y su tarjeta pasan al plan de PRAX**, que reescribe
      las propuestas en F7/F8. Quitarlos aquí sería tocar dos veces los mismos
      archivos.
- [x] **M-K — Que `praxis-api` se pueda dormir**. El dueño del producto lo pidió
  expresamente (2026-09-29): «en horas nocturnas salvará dinero, +8 h».
  `sleepApplication` **ya está activado** en Railway, y el servicio no se duerme
  nunca. Railway lo duerme tras 10 minutos sin tráfico saliente, y el backend
  habla con Postgres y Redis cada pocos segundos aunque no haya nadie:
  - el `setInterval` del buzón de salida de tasks y projects;
  - el consumidor de automation (`inbound-event.consumer.ts:81`), **cada
    segundo**. En cada vuelta hace `xautoclaim`, `xreadgroup`, evalúa
    pendientes y purga en Postgres, y escribe una línea
    `inbound_event_metrics` en el log, también en producción: son 86.400
    líneas al día sin que pase nada;
  - la suscripción pub/sub del gateway.

  **Hecho así.** `@praxis/local-transport/src/actividad.ts` guarda cuándo pasó
  el último mensaje entre servicios. Cada `LocalClient.publish` cuenta, y toda
  petición de usuario y toda edición de collab cruza al menos uno.
  - Tras `PRAXIS_REPOSO_MS` sin mensajes (5 min por defecto), los dos sondeos
    se saltan sus vueltas.
  - El primer mensaje los reanuda con una pasada inmediata.
  - Solo en el monolito: con procesos separados, `enReposo()` es siempre
    `false`.

  **Medido en local** con un reposo de 20 s:
  - los sondeos se detienen;
  - un login los despierta en el acto;
  - **0 bytes salientes del proceso en 60 s de reposo** (`nettop`).

  Railway lo dormirá unos 15 min después del último uso: 5 de reposo más 10 sin
  tráfico.

  **Ninguna automatización depende de la hora.** Las de barrido, como «una tarea
  está vencida», solo corren al pulsar «revisar» (`reviewProject(…,
  'manual')`), y no hay ningún cron. Las reactivas esperan en el stream de
  Redis y se procesan al despertar.

  ⚠️ **El precio:** la primera petición tras dormir espera a que arranque el
  contenedor, unos segundos.

  **Dos arreglos para que despertar no rompa nada** (2026-09-29, antes del
  primer despliegue):
  - **Las migraciones ya no se aplican en cada arranque.**
    - **El problema:** con sueño, cada despertar es un arranque, y los siete
      `prisma migrate deploy` costaban 8,4 s medidos en local antes de servir
      nada.
    - **El arreglo:** `monolith/scripts/migraciones-al-dia.cjs` compara, con una
      sola conexión, las carpetas de migración de la imagen con
      `_prisma_migrations` de cada schema (0,13 s). `start-backend.sh` solo
      llama a `migrar.sh` si falta alguna o si la comprobación falla: ante la
      duda, migra.
  - **El frontend reintenta mientras el backend despierta.**
    - **El problema:** Railway avisa de que *«the first request sent to a slept
      service may return a 502»*. `praxis-api` solo recibe tráfico de
      `praxis-web` por la red privada, que sí lo despierta.
    - **El arreglo:** `commons/api/despertar.ts` (`fetchAlGateway`), usado en
      todos los `fetch` del servidor web al gateway. Reintenta lo que no llegó a
      salir con cualquier método, y los 502/503 que no son JSON solo en
      `GET`/`HEAD`: un `POST /auth/refresh` repetido rotaría los tokens dos
      veces. Esperas de 0,8, 2 y 4 s, dentro del plazo de 15 s.
  - **`praxis-web` sigue sin dormir**, como estaba: dormirlo haría que la
    primera visita pudiera recibir el 502 directamente en el navegador. Se
    decide después de ver unos días cómo despierta `praxis-api`.

  ⚠️ **Lo que lo mantiene despierto sin querer:** una pestaña abierta, por los
  latidos del SSE cada 25 s. Eso está bien: alguien lo está usando.
- [x] **M-J — Documentación**: `CLAUDE.md` (puertos, comandos, «los 10
  servicios», trampa 14), `STRUCTURE`, `ESTADO-ACTUAL` y el plan de PRAX
  (§1 cambia de sitio, no de fondo).

## 3.1 El despliegue (lo hace Claude, por encargo)

Praxis tiene usuarios reales. Todo lo de aquí va **en este orden**:

1. **Traer `main`.** En Railway, `praxis-api` y `praxis-web` despliegan desde
   `main`, y hay más gente empujando: el despliegue activo el 2026-09-29 era un
   commit de `joseman11`. Se fusiona `main` en la rama y se resuelven los
   conflictos antes de nada.
2. **Probar la imagen de verdad.** `docker build` del `backend.Dockerfile`, y
   arrancarla en local contra una copia de la base.
3. **Copia de seguridad.** `pg_dump` de `praxis-db` con la CLI de Railway,
   ya instalada y con sesión; el repo está enlazado a «KYLOO SPACE /
   production». Se guarda fuera del repositorio.
4. **Avisar al dueño del producto** y hacer el push a `main`.
5. **Vigilar**: logs del arranque, healthcheck en `/api`, la RAM de las
   primeras horas y un recorrido a mano por `usepraxis.space`.
6. **Vuelta atrás**: *Redeploy* del despliegue anterior desde Railway. Solo si
   hiciera falta, la copia del paso 3.

Datos que no se tocan: `praxis-db` y `praxis-redis` siguen siendo los mismos.
Las sesiones abiertas siguen valiendo, porque `JWT_SECRET` no cambia.

## 4. Registro

- **2026-09-29** — Plan escrito tras medir la RAM en local, un inventario de
  arranques, clientes, configuración y globales, y la evaluación de `reports`.
  Alexa fuera por decisión del dueño del producto.
- **2026-09-29** — M-A a M-H.
  - **RAM**: el monolito en local, construido y en reposo, ocupa **189 MB**,
    frente a 1.335 MB. Tras las 167 e2e de API, **150 MB**: no crece.
  - **e2e de API**: **167/167** contra los once procesos TCP, sin Alexa, y
    **167/167** contra el monolito.
  - **Encontrado de paso, anterior a esta etapa y sin arreglar aquí**: la
    organización personal choca a veces por `slug` al registrarse
    (`Unique constraint failed on the fields: (slug)`, 3 y 5 veces en unas 190
    altas de e2e):
    - `slugLibre` (`billing/.../organizations.service.ts:574`) desempata con
      solo 2 bytes aleatorios y comprueba una sola vez. Con cientos de
      «mi-espacio-xxxx» en la base de pruebas, choca.
    - `personalDe` relanza el error y la organización se crea en el siguiente
      acceso, así que ninguna prueba falla.
    - Con nombres reales es improbable. Lo arreglaría un sufijo más largo y un
      reintento.
- **2026-09-29, 11:07 UTC** — **Desplegado** (`f5532d08`).
  - **Antes de desplegar**:
    - `main` fusionado en la rama, con los dos commits de documentos de otra
      persona.
    - e2e: API 167/167; interfaz 59/70, con los mismos fallos que da el backend
      anterior (abajo).
    - Imagen de Railway probada en local.
    - **0 bytes salientes en 11 minutos de reposo.**
  - **En producción**:
    - `start-backend.sh` dijo «Migraciones ya aplicadas; sin Prisma».
    - El monolito arrancó con cada servicio en su schema.
    - La landing y `/auth/login` responden 200, y un login falso llega hasta
      credentials y vuelve 401.
  - **Sin copia de la base.** `praxis-db` no tiene URL pública, y `railway ssh`
    pedía registrar una clave SSH en la cuenta del dueño, cosa que no se hace
    sin él. El despliegue **no cambia el esquema**: solo desaparecen los
    archivos de migración de Alexa, ya aplicados, y un comentario de Prisma. La
    vuelta atrás es redesplegar la versión anterior desde Railway.
- **Los 11 fallos de interfaz que no son del monolito.** Con los once procesos
  separados fallan las mismas pruebas:
  - 9 de `07-reglas`;
  - `04-invitaciones:22`;
  - `09-scrum:55`.

  Sueltas pasan: por ejemplo, la de crear una regla, en 5 s. La del estado
  vacío de reglas ve **dos** párrafos idénticos durante el streaming de la
  página (una sonda en el DOM encuentra uno solo pasados 3 s).

  Son fragilidad de las pruebas escritas para `next dev` al correr contra la
  build de producción. Quedan para arreglarse aparte.
