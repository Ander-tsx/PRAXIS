# Plan de pulido y refactorización

> **Documento de trabajo con estado.** Se actualiza al terminar cada tarea. Si
> una sesión se corta, se retoma leyendo «Dónde estamos» y siguiendo por la
> primera tarea sin marcar.

## Dónde estamos

| | |
|---|---|
| **Etapa actual** | E1 ✅ · E2 ✅ · **E3 en curso** |
| **Última tarea terminada** | E3.2 — la zona está registrada y el shell la sirve |
| **Siguiente** | E3.3 — mover las pantallas del chat |
| **Rama** | `feature/pulido` (un commit por tarea, sin `push`) |
| **Actualizado** | 2026-08-17 |

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado o
descartado (con motivo)

---

## Principios de esta etapa

1. **Nada de funcionalidad nueva.** Solo corrección, cobertura, estructura y
   rendimiento.
2. **Una etapa no empieza hasta que la anterior está verde.** El orden no es
   arbitrario: E1 levanta la red que hace seguras a E3 y E4.
3. **Cada cambio de comportamiento se acompaña de la prueba que lo fija.** Las
   fases 1-4 se verificaron con compilador y `next build`, y eso detecta que el
   código es coherente consigo mismo, no que hace lo que dice. Seis fallos
   llegaron a producción por ese hueco.
4. **Verificar antes de afirmar.** «Compila» no es «funciona».

---

## E1 — Red de seguridad (primero, y sin excepción)

Sin esto, E3 y E4 son refactorizaciones a ciegas sobre las zonas que más se han
tocado.

- [x] **E1.1 — Ejecutar `pnpm e2e:regresion` y anotar el estado real.**
      *Resultado (17-08, proyecto `api`):* **132 pasan, 3 fallan**, 16.0 min.
      Los tres rojos son el mismo síntoma y **ninguno era una regresión de las
      fases 1-4** —las sospechas de E1.2 no se materializaron: ni la presencia
      efectiva, ni el borrado suave, ni los campos nuevos, ni el limitador
      rompieron nada—:
      - `02-auth` › el refresh devuelve un access token nuevo → 401
      - `02-auth` › el logout responde 200 e invalida el refresh token → 400
      - `07-suspension` › quien queda suspendido no puede renovar su sesión → 401

- [x] **E1.2 — Arreglar los rojos.**
      Causa única, y de fuera del código: `credentials/.env` tenía
      `REFRESH_TOKEN_EXPIRES_IN=50`. `jsonwebtoken` pasa las cadenas por `ms()`,
      donde **un número pelado son milisegundos**, así que el refresh se firmaba
      con `exp` igual a `iat` y moría antes de llegar al navegador. Entrar
      funcionaba, y lo único roto era la renovación: la sesión se caía a los
      quince minutos con un 401 y ninguna otra pista.
      Arreglado el valor y añadido un patrón Joi que **exige unidad**, así que un
      `.env` así ya no arranca el servicio (`547eacc`).

- [x] **E1.3 — Pruebas de API del chat** (`e2e/tests/api/15-chat.spec.ts`).
      **16 pruebas, verdes** (`6857c5a`). Cubre:
      - enviar / listar / paginar con `before` y con `after`;
      - borrado suave: la fila se queda, `deletedAt` puesto, `body` vacío, sin
        adjuntos ni reacciones, y **desfijado**;
      - una lápida rechaza editar, reaccionar, fijar y ser citada;
      - tope de 5 fijados: el sexto da 400 con el mensaje esperado;
      - `visibleEnChat`: una respuesta de hilo no sale en el historial general;
      - `unread` sube con un mensaje ajeno y se pone a cero al marcar leído;
      - aislamiento: un `channelId`/`before`/`after` de otra conversación no
        filtra nada.

      Dos cosas que no eran obvias y costaron cinco rojos propios, ya escritas
      en el archivo: el historial se sirve **ascendente** —así que el cursor de
      `before` es `items[0]`, no el último— y **escribir adelanta tu propia marca
      de lectura**, mientras que listar no. Ninguna era un fallo del sistema.

- [x] **E1.4 — Pruebas de la presencia efectiva** (`16-presencia.spec.ts`).
      **6 de API + 3 unitarias, verdes** (`c7d288a`).
      - sin conexión abierta, la presencia servida es `AWAY` pase lo que pase
        —también en la respuesta del propio `PATCH` y en `/users/me`—;
      - `GET /users?ids=` aplica el cruce a **toda** la lista, no solo al primero;
      - un estado fuera del conjunto se rechaza, y la presencia ajena no se toca.

      ⚠️ **La otra mitad de la tabla no se puede probar por la API**: sin abrir
      un flujo SSE ninguna cuenta está conectada, así que «estando conectado se
      respeta lo elegido» no es observable desde ahí. Como es una función pura,
      se fija donde vive: `gateway/src/presence/presence.service.spec.ts`.

- [x] **E1.5 — Prueba del reparto de eventos.**
      **12 unitarias, verdes** (`3821373`): los destinatarios salen de la base,
      incluyen al autor, `mio` y `peerId` se resuelven por destinatario, el
      silenciado **recibe** el evento marcado y los silenciados se piden en una
      sola consulta.

      Destapó un fallo real: `void this.redis.publish(...)` deja el rechazo
      **fuera** del `try/catch`, y en Node un `unhandledRejection` mata el
      proceso. No se veía porque `RedisService.publish` traga sus errores — o
      sea que projects-service dependía de una invariante de otro archivo para
      no caerse cuando Redis parpadea.

- [!] **E1.1b — La mitad de interfaz de la suite nunca se había ejecutado.**
      Descubierto al mirar por qué fallaban **31 de 31** pruebas `ui`, incluida
      «la landing responde sin sesión», que es la más simple que hay. No eran
      regresiones: era
      `browserType.launch: Executable doesn't exist … chrome-headless-shell`.
      Chromium no estaba instalado en esta máquina, así que el proyecto `ui`
      llevaba desde siempre sin dar un solo dato.

      Resuelto con `pnpm e2e:instalar`. ⚠️ **Y conviene que quede escrito**: un
      fallo de arranque del navegador sale como 31 pruebas rojas con mensajes de
      aserción distintos, que es indistinguible de una regresión gorda hasta que
      abres un `error-context.md`. Ante un rojo masivo y uniforme, mirar primero
      si el navegador arrancó.

- [x] **E1.6 — `pnpm e2e:seguridad`**: **14 de 14 en verde** (2,1 min).

      ⚠️ **Y eso desmiente lo que dice el README de `e2e/`.** Las `@security`
      viven aparte porque «describen lo que queremos, no lo que hay» y para que
      un rojo esperado no tape uno nuevo. Ya no hay ningún rojo esperado: pasan
      las catorce. Conviene actualizar esa nota o la separación se convierte en
      folclore.

**Marcador final de E1 (17-08), stack en frío y sin tocar nada durante la corrida:**

| Proyecto | Resultado |
|---|---|
| `api` (regresión) | 157 ✅ |
| `ui` (regresión) | 33 ✅ |
| `@security` | 14 ✅ |
| unitarias (projects + gateway) | 12 + 39 ✅ |

Es la primera vez que la suite pasa entera en esta máquina.

⚠️ **Corregido (17-08): esta tabla decía `api 184` y era un error de
transcripción que se sostuvo hasta que los números dejaron de cuadrar.** 184 no
era el total de `api`: era el **total de aprobadas de una corrida intermedia**,
la de los 6 rojos de E1.7 —190 pruebas menos 6—. Al pasarlo a la tabla se anotó
en la fila de `api` y se le sumó `ui 33` al lado, que ya estaba dentro de esas
184. O sea que la tabla presumía de 217 pruebas donde había 190, mezclando dos
corridas distintas.

Verificado con `playwright test --list`, que cuenta sin ejecutar: `api` tiene
**158** hoy (157 en el commit del marcador, más la que añadió `32592f3`) y `ui`
tiene **33**. Y `git diff 8d2d030..HEAD -- e2e/tests/` confirma que **no se ha
borrado ninguna prueba**: el único cambio es una añadida. La suite no ha
encogido; lo que estaba mal era la cuenta.

**La lección, que es la misma que E1.1b y E1.8:** un número apuntado a mano en
un documento no es una medición. Los marcadores se sacan de `--list` y del
resumen de la corrida, y se anota **de qué corrida salen**.

- [!] **E1.7 — El limitador de login *no* era el problema. Diagnóstico erróneo,
      se deja escrito para que no se repita.**

      Durante la corrida sostuve que los 6 rojos de interfaz eran el límite de
      10 logins/minuto: fallaban consecutivos y agotaban **exactamente** el tope
      de 120 s, que es la firma clásica del reloj. Era falso. Al abrir el
      `error-context.md` la sesión estaba abierta y la página pintada: lo que
      faltaba era **un botón que no existía** (ver el arreglo en `bd94296`).

      ⚠️ **La lección es de método, no de código.** El patrón «consecutivos y en
      el tope exacto» es sugerente pero no concluyente, y la captura del fallo
      —que Playwright ya escribe— resuelve la duda en treinta segundos. Teorizar
      antes de abrirla costó tres vueltas.

      El límite sigue siendo real y sigue apretando —hay pruebas que tardan 1,3
      min por la espera—, pero **no impide que la suite pase**. Lo de contar por
      cuenta en vez de por IP se queda como mejora en E6, no como bloqueante:

      contar por IP castiga a quien comparte salida (una oficina detrás de un
      NAT se bloquea entre sí) y **no** frena a quien reparte los intentos entre
      muchas IPs contra una sola cuenta, que es el ataque real.

- [!] **E1.8 — Un servicio que no compila no se anuncia: se nota tres capas más
      allá.** Al retomar (17-08) el árbol tenía una edición a medias de E6.7 —un
      `this.logger` en `AuthService` que no existía—. Lo que se veía era **«No se
      pudo crear la cuenta»** en el navegador y un 500 del gateway; el gateway
      decía `ECONNREFUSED` porque credentials-service nunca llegó a arrancar.

      ⚠️ **`pnpm dev:backend` sigue en pie con un servicio caído.** `turbo` lanza
      los ocho en paralelo y el que falla imprime su `Found 1 error` una vez, al
      principio, entre el arranque de los otros siete; a partir de ahí no vuelve
      a quejarse y el resto del log parece normal. Antes de diagnosticar nada del
      backend: `grep 'Found [0-9]* error' <log>` y comprobar que **los ocho**
      dicen cero.

      Es el mismo patrón que E1.1b: el fallo real está lejos del síntoma, y
      leerlo cuesta treinta segundos si se sabe dónde mirar.

---

## E2 — Deuda conocida de las fases 1-4

Lista cerrada, ya diagnosticada. Ninguna necesita investigación.

- [x] **E2.1 — `terraform apply` del pool.** `max_connections = 150` en
      `sql.tf`. Es la mitad del arreglo de la lentitud: la otra
      (`DATABASE_POOL_MAX = 5`) ya está en el código y viaja con el despliegue.

      **Aplicado en producción el 17-08 a las 22:45 UTC** (lo ejecutó el usuario;
      la herramienta bloquea las escrituras contra producción). `Apply complete!
      Resources: 0 added, 1 changed, 0 destroyed`, acotado con
      `-target=google_sql_database_instance.postgres`.

      ✅ **Verificado que el valor está vivo, no solo configurado.** Son dos cosas
      distintas y conviene no confundirlas: `gcloud sql instances describe`
      devuelve lo que está *pedido*, y `max_connections` es un parámetro estático
      que solo entra en vigor **al arrancar**. La instancia solo tiene IP privada,
      así que no hay `SHOW max_connections` posible desde fuera de la VPC — pero
      los logs de Cloud SQL registran el reinicio, que es la prueba que hacía
      falta:

      ```
      22:45:34.551  received fast shutdown request
      22:45:34.905  database system is shut down
      22:45:41.816  starting PostgreSQL 16.14
      22:45:41.988  database system is ready to accept connections
      ```

      **~7,4 s de corte.** El `UPDATE` de la API duró 21 s en total (22:45:23 →
      22:45:44) y el reinicio va dentro: Cloud SQL lo hace solo, no aparece como
      operación `RESTART` aparte. Que no salga una línea de reinicio en la salida
      de `terraform` **no significa que no lo haya habido** — es justo lo que
      había que comprobar y por poco se da por bueno sin mirar.

      ⚠️ Para futuros flags estáticos, el patrón de comprobación es este:
      `gcloud logging read` sobre `resource.type="cloudsql_database"` filtrando
      por `database system is ready to accept connections`. Sirve sin credenciales
      de base de datos y sin entrar en la VPC.

- [x] **E2.2 — Una consulta por evento, y sin caché.** (`e7c7c95`)
      Eran **cuatro** viajes por evento —canal, proyecto, miembros, silenciados—,
      o sea cuatro por cada mensaje, edición, borrado, reacción y marca de
      lectura del chat de un equipo. Ahora es **una** sentencia con dos `LATERAL`
      que agregan cada lista en la propia base.

      ⚠️ **No se cachea, que era lo que proponía el plan**, y la razón es la
      misma por la que ya se había recortado el alcance a «el canal y no los
      miembros»: cachear la lista de destinatarios abre una ventana en la que
      alguien recién sacado de un proyecto sigue recibiendo los mensajes del
      equipo. Resuelto el coste con SQL, la caché no aporta nada que compense esa
      ventana. La fila del canal sí es inmutable y sería segura de cachear, pero
      ya no hace falta: iba en la misma sentencia.

      ⚠️ **Y un `select` anidado de Prisma no vale.** Emite una consulta por
      relación y las cose en memoria: daba las mismas cuatro sentencias con mejor
      pinta. Se descartó mirando el SQL real con `log_statement='all'`, y queda
      anotado en el código. `relationLoadStrategy: 'join'` sí lo haría, pero
      exige el preview `relationJoins` y regenerar el cliente, que en este repo
      es la operación delicada de siempre.

- [x] **E2.3 — Adelgazar el fan-out de presencia.** (`4c9c9fc`)
      `anunciar` pedía `chat_contacts`, que devuelve por cada contacto todos los
      proyectos en común con nombre, slug y rol —dos `join` y una fila por cada
      par (persona, proyecto)— para usar **una columna**. Ahora hay
      `cmd: 'chat_peer_ids'`, que lo resuelve con `distinct` y sin `join`.
      Verificado contra Redis con un `psubscribe`: el cambio llega a la propia
      cuenta con `mio: true` y a los compañeros con `mio: false`.

- [x] **E2.4 — `usePresencia` en `ProjectMembers`** (projects-front). (`9476983`)
      Era la única superficie con esferas de estado que no escuchaba el flujo.
      `ProjectMembers` es de servidor, así que el avatar baja a un componente de
      cliente mínimo (`MemberAvatar`) en vez de convertir la pestaña entera.

      ✅ **`ui/05-equipo.spec.ts` pasa** (17-08). Existe justo porque `tsc` no ve
      un error de frontera servidor/cliente: da verde y la pantalla revienta al
      pedirla.

- [x] **E2.5 — Huecos largos de reconexión.** (`32592f3`)
      `?after=` recortaba el hueco al tope y **no lo decía**. Tras un corte largo
      el panel pegaba el trozo recibido al final de lo que ya tenía y lo de en
      medio desaparecía para siempre: un agujero mudo, sin error y sin nada que
      lo delatara.

      Se pide `limit + 1`, se devuelven `limit` y **`hasMoreAfter`** dice si
      desbordó; con `true` el panel no pega nada, recarga la conversación entera.
      Campo propio y no `hasMore` porque significan cosas opuestas: aquel es
      «queda más hacia arriba», este «falta hacia abajo».

      Se hizo el mínimo del plan, no el ideal: **Redis Streams con
      `Last-Event-ID`** para replay exacto sigue sin hacerse y sigue siendo una
      decisión aparte, más cara. Con esto no se pierde nada en silencio, que era
      lo urgente; lo que queda es evitar la recarga completa.

- [x] **E2.6 — Acuses por mensaje: se cierra como límite del producto.**
      *Decisión del usuario (17-08).* El «visto» dentro de un hilo sigue
      **oculto** (`mostrarVisto={false}` en `ThreadPanel`), y ahora está escrito
      por qué: `ChatChannelState` guarda un `lastReadAt` por (canal, persona), y
      que esa marca vaya por delante de un mensaje de hilo **no dice nada** sobre
      si alguien abrió el hilo. Enseñarlo igualmente sería peor que no enseñar
      nada — diría «leído» con apariencia de dato exacto.

      Implementarlo cuesta una tabla de acuses por mensaje, su migración y una
      escritura por cada mensaje visto: el gesto más frecuente del sistema pasa
      de tocar una fila por canal a una por mensaje en pantalla. Coste de
      escritura permanente por una marca en una superficie secundaria.

      Documentado como **punto 25 de PENDIENTES-BACKEND.md**, con la vía barata
      si algún día se retoma (un `lastReadAt` por hilo, que depende del punto 20).

---

## E3 — Extraer el chat a su propio microfrontend

`chat-front`, puerto **4106**, basePath `/chat`. Sigue el checklist de zona nueva
de ESTADO-ACTUAL §17.7.

> ⚠️ **Después de E1.** Esta etapa mueve todas las rutas del chat; sin pruebas
> detrás, un enlace mal migrado se descubre en producción.

- [x] **E3.1 — Andamiaje de la zona.** Checklist de §17.7 completo:
      `package.json` (puerto 4106), `next.config` con `basePath: '/chat'`,
      `tsconfig` con los `paths` a commons, `postcss.config.mjs`, `proxy.ts` con
      su guard **y `'/'` como entrada aparte del matcher**,
      `app/api/gateway/[...path]/route.ts`, `globals.css` importando
      `commons/styles/theme.css` con su `@source` y sus `@font-face` con el
      basePath, `layout.tsx` estampando `data-theme` desde la cookie, más
      `error.tsx`, `not-found.tsx`, el icono y las fuentes en `public/fonts/`.

      **Verificado sirviendo la zona sola en el 4106**, que es justo lo que tiene
      que poder hacerse. Las cinco cosas que el andamiaje debe acertar y que
      fallan en silencio:

      | Comprobación | Resultado |
      |---|---|
      | `/chat` **sin sesión** (la raíz) | 307 → `/auth/login` |
      | `/chat/<peerId>` sin sesión | 307 → `/auth/login` |
      | Con `x-forwarded-host` (el shell delante) | 307 → **`:4100`**, no al puerto interno |
      | `/chat/api/gateway/*` sin sesión | **401 JSON**, no un redirect HTML |
      | `/chat/fonts/*.woff2` sin sesión | 200 `font/woff2` |

      Y con sesión, la página se pinta **con estilos**: la hoja generada trae las
      variables del tema (`--color-background`, `--color-primary`… dos
      definiciones cada una, clara y oscura) y las cuatro utilidades que usa.
      Incluye `--color-info` y `--color-error-muted`, que la página **no** usa
      como clase — o sea que el `@theme static` de `theme.css` está haciendo su
      trabajo y el import resolvió de verdad. Ver el aviso de Tailwind en
      CLAUDE.md: si ese import falla, no hay error, hay una pantalla sin estilos.

      El `data-theme` sale de la cookie, comprobado en los dos sentidos:
      `praxis_theme=light` → `light`, `=dark` → `dark`, sin cookie → `dark`
      (`DEFAULT_THEME`).

      ⚠️ **Hay una página provisional** en `(private)/page.tsx` y la sustituye
      E3.3. Existe porque una zona sin ninguna ruta no arranca, y sin arrancar no
      se puede comprobar nada de lo de arriba.

- [x] **E3.2 — Registrar la zona.** Los cuatro sitios:
      - **`rewrites()` del web-shell**, las **dos** entradas (`/chat` y
        `/chat/:path*`), con `CHAT_FRONT_URL` y su `?? localhost:4106`.
      - **`scripts/dev-cli/config/services.mjs`**: entrada en `FRONTEND_APPS`,
        que es de donde salen los `.env.local` y los puertos que el CLI vigila.
        Comprobado con `revisarCatalogo()` — devuelve `[]`, o sea que la carpeta
        existe y el `package.json` se llama como dice el catálogo.
      - **`.env.local`** de la zona, con el `JWT_SECRET` **idéntico** al del
        gateway (verificado con un `diff`, no a ojo: si no coincide, la sesión se
        ve inválida y todo redirige al login sin decir por qué).
      - **El despliegue**: `frontend.pm2.config.cjs` (proceso `chat-front` en el
        4106 y `CHAT_FRONT_URL` en el bloque `zonas`) y el rango del comentario
        de `arranque-frontend.yaml`.

      **Verificado por el shell**, que es lo que faltaba de E3.1:

      | Comprobación | Resultado |
      |---|---|
      | `:4100/chat` sin sesión | 307 → `/auth/login` **en el 4100** |
      | `:4100/chat` con sesión | sirve la zona (`<title>Mensajes | Praxis</title>`) |
      | `:4100/chat/algo` | 404 **de chat-front**, no del shell |
      | CSS de la zona por el shell | 200 `text/css` |
      | Fuente por el shell | 200 `font/woff2` |

      El 404 se comprueba por su texto («Ir a mensajes»), no por el código: el
      shell también responde 404 a lo que no casa con ningún rewrite, así que el
      número solo no distingue «llegó a la zona y no hay ruta» de «el rewrite no
      existe». Es la forma de fallo que se lleva por delante una zona entera
      pareciendo un enlace roto.

      De paso, dos cosas que estaban desactualizadas y se corrigen: el recuento
      de zonas (seis → siete) en el CLI, en `CLAUDE.md` y en el pm2, y un
      comentario del catálogo que anunciaba una función `assertCatalogoSano()`
      que **no existe** — se llama `revisarCatalogo()`.

- [ ] **E3.3 — Mover las pantallas.** De `dashboard-front/src/app/(private)/chat/`
      a `chat-front/src/app/(private)/`: `layout`, `page`, `[peerId]`,
      `proyecto/[projectId]`, `actions.ts`, `proyecto-actions.ts`. Y los
      organismos `ChatDirectory`, `DirectConversation`, `ProjectConversation`.

- [ ] **E3.4 — Reescribir las rutas.** Todas cambian de `/dashboard/chat/…` a
      `/chat/…`. Sitios conocidos (verificar con `rg 'dashboard/chat'` que no
      queda ninguno):
      - `AvisosEnVivo.destinoDeMensaje` (las dos ramas)
      - `ChatDirectory`: enlaces de persona y de proyecto, y `activoDeLaRuta`
      - `ProjectChatPreview.href` (projects-front)
      - `commons/auth/nav.ts` → `CHAT_HREF`
      - `AppShell` → `HREF_DE_MENSAJES`
      - `dashboard-front/src/lib/ultimo-chat.ts` y el `proxy.ts` que lo llama:
        **se mudan enteros** a la zona nueva
      - `useConversacionesEnVivo` → la constante `GATEWAY`
      - `hrefDeAvatar(..., '/dashboard/api/gateway')` en ChatDirectory y
        DirectConversation
      - `revalidatePath` de las acciones (las rutas ya no llevan `/chat` delante)

      ⚠️ **Cuatro sitios más que esta lista no tenía** (barrido real de
      `rg 'dashboard/chat'`, 17-08). Los cuatro son enlaces «escribir a esta
      persona» repartidos por zonas que no son el chat, que es justo la clase de
      sitio donde un enlace roto no se ve hasta que alguien lo pulsa:
      - `commons/organisms/AppLayout/navigation.tsx:102` — la entrada del menú
        lateral. Está **además** de `HREF_DE_MENSAJES` de `AppShell`, o sea que
        la ruta del chat vive hoy en **tres** constantes distintas (con
        `CHAT_HREF` de `nav.ts`). Al mudar conviene dejar una sola.
      - `commons/organisms/ChatPanel/RichText.tsx:61` — el destino de una
        **mención** dentro de un mensaje.
      - `admin-front/.../UsersTable.tsx:99` — escribir a una cuenta desde el
        panel de administración. Es la única referencia al chat desde
        `admin-front`.
      - `projects-front/.../ProjectMembers.tsx:161` — escribir a un miembro
        desde la pestaña Equipo.

      Con estos, el recuento actual es de **13 referencias en 5 zonas**
      (`commons` incluido). Ninguna da error de compilación al quedarse vieja:
      salen como un 404 al pulsar.

- [ ] **E3.5 — Redirecciones de cortesía.** `/dashboard/chat/*` → `/chat/*`
      permanente, para que no se rompa ningún enlace ya compartido ni las
      cookies de «último chat» que estén puestas.

- [ ] **E3.6 — Verificar.** Levantar las **siete** zonas, navegar entre ellas y
      comprobar que el flujo SSE se abre una vez por zona y que la insignia se
      mantiene al cruzar de `/dashboard` a `/chat`.

---

## E4 — Notificaciones dentro de `/dashboard`

- [ ] **E4.1 — Llevar la bandeja al panel.** `NotificationList` pasa a ser una
      sección de `dashboard-front/src/app/(private)/page.tsx`. El panel tiene
      poco contenido; la bandeja lo llena sin inventarse una pantalla.
- [ ] **E4.2 — Conservar el filtro y la paginación**, que hoy viven en
      `?soloSinLeer=` y `?page=`. Al compartir página con el resto del panel hay
      que prefijar los parámetros (`?avisos_page=`) para no chocar.
- [ ] **E4.3 — Quitar la entrada del menú** (`NOTIFICATIONS_HREF` en
      `commons/auth/nav.ts`) y mover su insignia a donde quede la sección.
- [ ] **E4.4 — `/dashboard/notifications` redirige a `/dashboard`.** Hay enlaces
      vivos: los correos y las tarjetas de aviso apuntan ahí.
- [ ] **E4.5 — Revisar `AutoRefresh`.** Repasa la bandeja cada N segundos; en el
      panel puede sobrar, porque los avisos ya piden refresco por el flujo.

---

## E5 — Unificar el idioma del código a inglés

> ⚠️ **Leer esto antes de empezar.** Es la tarea más grande del plan y la de peor
> relación valor/riesgo si se hace de golpe. El repositorio está en español de
> forma consistente —identificadores, comentarios, mensajes de commit, los tres
> documentos de `docs/frontend/` y el propio CLAUDE.md—, así que no es «traducir
> unas variables»: es un cambio de convención que toca todo.
>
> **Recomendación:** hacerlo **por lotes y con renombrado mecánico**, nunca a
> mano y nunca mezclado con otro cambio en el mismo commit. Un renombrado que
> viaja junto a una corrección hace imposible revisar ninguna de las dos.

> **Medido (17-08), para que la decisión no sea a ojo.** De **1.233
> identificadores exportados** en `apps/`, unos **160 tienen raíz española** —el
> 13%—. No están repartidos: se concentran en lo más nuevo (`realtime/`, el
> asistente con sus `Propuesta*`, el chat) y el resto del repo ya exporta en
> inglés. O sea que el nivel 1 —solo identificadores— es un lote acotado y no
> «tocar todo», que es lo que este documento temía.
>
> Lo que sí toca todo es el nivel 3: los comentarios, que son la mitad del valor
> de este repositorio y están escritos en español con cuidado.

> **Un ejemplo real, señalado por el usuario (17-08):** `contarSinLeerDeVarios`.
> Hace falta leer el cuerpo para saber qué cuenta, de qué y para quién. En
> inglés sería `countUnreadForChannels`, que se entiende sin abrirlo. Es la
> clase de nombre que justifica esta etapa: no es incomodidad estética, es que
> el nombre no dice lo que hace.

- [ ] **E5.0 — Decidir el alcance.** Tres niveles, de menor a mayor coste:
      1. **Identificadores** (variables, funciones, tipos, props). Es lo que de
         verdad se lee como «código en dos idiomas».
      2. **+ comentarios.** Los de este repositorio son prosa larga y explicativa;
         traducirlos es reescribirlos, con riesgo real de perder el matiz que los
         hace útiles.
      3. **+ documentos y commits.** Alcance máximo.
      *Decisión:* _(pendiente — mi recomendación es empezar por 1 y valorar 2
      cuando esté hecho)_

- [ ] **E5.1 — Glosario.** Un mapa cerrado antes de tocar nada, para que no
      salgan tres traducciones del mismo término:
      `aviso → notice` · `mensaje → message` · `hilo → thread` ·
      `fijado → pinned` · `adjunto → attachment` · `presencia → presence` ·
      `directorio → directory` · `evento → event` · `canal → channel` ·
      `borrado → deleted` · `leído → read` · `silenciado → muted`

- [ ] **E5.2 — Lote 1: `commons/realtime/`.** Es el módulo más nuevo, el más
      pequeño y el que menos gente ha tocado. Sirve de ensayo del método.
- [ ] **E5.3 — Lote 2: `commons/api/`.**
- [ ] **E5.4 — Lote 3: `commons/organisms/ChatPanel/`.** El más grande.
- [ ] **E5.5 — Lote 4: `apps/backend/services/projects/src/{chat,realtime}/`.**
- [ ] **E5.6 — Lote 5: gateway (`presence`, `notifications`).**
- [ ] **E5.7 — El resto**, zona por zona.
- [ ] **E5.8 — Actualizar CLAUDE.md** con la convención nueva, o el documento
      seguirá diciendo lo contrario de lo que hace el código.

---

## E6 — Optimización y seguridad

- [ ] **E6.1 — Repasar el resto de N+1.** La Fase 1 arregló cinco. Barrer con
      `rg 'ids.map|\.map\(.*api\.get'` por si queda alguno.
- [ ] **E6.2 — Índices que faltan.** Revisar los planes de las consultas que más
      se ejecutan: historial del chat, `countUnread`, `misConversaciones`.
      `contarSinLeerDeVarios` es SQL crudo y merece un `EXPLAIN`.
- [ ] **E6.3 — Tope de conexiones SSE por cuenta.** Hoy no hay ninguno: cien
      pestañas abiertas son cien conexiones sostenidas contra el gateway. Es una
      denegación de servicio trivial contra uno mismo y contra los demás.
- [ ] **E6.4 — Repasar los `catch` que se tragan errores.** El patrón
      `.catch(() => null)` fue la causa de que un 429 se leyera como «esta cuenta
      no existe». Buscar los que quedan y decidir en cada uno si degradar es
      correcto o si está ocultando algo.

- [x] **E6.7 — Promesas sueltas que pueden tumbar un servicio.**
      Un `void promesa()` que se rechaza es un `unhandledRejection`, y en Node
      **eso mata el proceso**. No lo cubre el `try/catch` que lo rodea: para
      cuando el rechazo ocurre, la función ya salió de él. Lo descubrió la prueba
      de `PublicadorDeEventos`, que tiró el proceso de Jest en seco.

      Barrido de `rg '^\s*void [a-zA-Z_$][a-zA-Z0-9_$.]*\('` sobre `apps/backend`
      — 18 sitios, clasificados:

      - [x] `PublicadorDeEventos.repartir` → el `publish` del bucle (`3821373`).
      - [x] `PresenceService.anunciar` → el `publish` del bucle (`4c9c9fc`).
      - [x] `ChatService.send` → `void this.touchRead(...)`. Es una escritura de
            Prisma: cualquier tropiezo de la base al mandar un mensaje tumbaba
            projects-service. Tragado con un `warn`; lo único que se pierde es
            que tu propio mensaje te cuente como no leído hasta el siguiente.
      - [x] `AuthService.register` → `void this.tokens.enviarVerificacion(...)`.
            `MailService.enviar` sí traga lo suyo, pero `emitir()` es otra
            escritura de Prisma. Una base con hipo durante un alta se llevaba por
            delante credentials-service, o sea la autenticación entera. El alta
            ya está guardada al llegar ahí; lo que se pierde es el correo, y para
            eso está «reenviar».
      - [x] `NotificationsStreamService` → `void this.conNombre(e).then(...)`.
            Lo que puede rechazar no es `conNombre` —que no lanza, y está
            documentado— sino el `.then`: repartir llama a `next()` sobre cada
            `Subject`, y un suscriptor que lanza propaga hacia fuera. Un oyente
            con un fallo tumbaba el gateway, y con él el flujo de todo el mundo.
      - [x] El resto —`marcarVivo`, `marcarIdo`, `anunciar`, `elegidaDe`,
            `repartir`, `aUnaPersona`— ya tienen su `try/catch` o su `.catch()`
            **dentro**. Revisados, no hace falta tocarlos.

      ⚠️ **Los tres sitios comparten una forma, y conviene saber reconocerla**:
      un `void promesa()` cuyo `try/catch` envolvente *parece* cubrirlo. No lo
      cubre —para cuando el rechazo ocurre la función ya salió del `try`— y el
      síntoma no es un error en un log: es el servicio entero desapareciendo por
      un parpadeo de Postgres o de Redis. Ninguno de los tres daba ningún aviso
      hasta que se caía.
- [ ] **E6.5 — Revisar el tamaño de los bundles.** `sileo` arrastra `motion`;
      comprobar cuánto pesa en cada zona y si compensa cargarlo diferido.
- [~] **E6.6 — Revisión de dependencias.** `pnpm audit`: 38 avisos —1 crítico,
      25 altos, 12 moderados—. Casi todo es transitivo (`tar` vía
      `@mapbox/node-pre-gyp`, `sharp`, `postcss` vía el propio Next), pero hay uno
      que es nuestro y urgente:

      🔴 **Next 16.2.9 acumula nueve avisos, todos corregidos en 16.2.11.** Es un
      salto de parche y lo declaran las **siete** zonas (`commons` incluido). Dos
      de los nueve pegan justo donde vive esta arquitectura:
      - *Middleware / Proxy bypass en App Router* — el guard de sesión de PRAXIS
        **es** `proxy.ts`, en cada zona. Un bypass ahí es entrar sin sesión.
      - *SSRF en `rewrites()` por hostname de destino controlado* — el
        multi-zone entero se sirve con `rewrites()` desde el shell.

      Los otros siete: DoS en Server Actions, SSRF en Server Actions sobre
      servidor propio, dos confusiones de caché de cuerpos de respuesta, payload
      sin límite en Edge, DoS del optimizador de imágenes con SVG, y exposición
      sin autenticar de los endpoints internos de Server Functions.

      ✅ Subido a `16.2.11` en las siete (`08cafc0`). Queda confirmar con la
      regresión entera, que es lo que está corriendo.

      Lo que **no** se toca: `tar`, `sharp` y `postcss` son transitivos y no hay
      versión nuestra que los suba. `postcss` entra por el propio Next, así que
      se resolverá solo cuando Next lo suba.

---

## Riesgos anotados

| Riesgo | Mitigación |
|---|---|
| E3 rompe enlaces del chat en silencio | E1 primero; `rg 'dashboard/chat'` a cero; redirección de cortesía |
| E5 mezcla renombrado con corrección | Lotes; un commit por lote; nada más en ese commit |
| E2.1 reinicia Cloud SQL | Ventana acordada; avisar antes |
| Las fases 1-4 siguen sin cobertura | Es exactamente E1, y por eso va primero |

---

## Registro

| Fecha | Etapa | Nota |
|---|---|---|
| 2026-08-17 | — | Plan creado. Fases 1-4 (tiempo real, presencia, toasts) cerradas y sin cobertura de pruebas. |
| 2026-08-17 | E1 | Cerrada. Primera vez que la suite entera pasa en esta máquina. |
| 2026-08-17 | E2 | Cerrada salvo el `apply` de E2.1, que es de infraestructura y va en ventana. E2.6 se cierra por decisión: se documenta como límite (punto 25 de PENDIENTES-BACKEND). |
| 2026-08-17 | E6.7 | Cerrada. Las tres promesas sueltas que quedaban, blindadas. Al retomar, una de ellas estaba a medias en el árbol y **no compilaba**: credentials-service llevaba toda la sesión sin arrancar (ver E1.8). |
| 2026-08-17 | E2 | Regresión completa tras cerrar E6.7: **191 ✅ / 0 ❌** en 23,2 min (158 `api` + 33 `ui`), stack en caliente. Y de paso se corrigió el marcador de E1, que estaba inflado. |
| 2026-08-17 | E2 | **Cerrada entera.** El `apply` de E2.1 fue a producción a las 22:45 UTC con ~7,4 s de corte de Cloud SQL. Con esto las dos mitades del arreglo de la lentitud están puestas: el techo de conexiones arriba y los pools acotados abajo. |
