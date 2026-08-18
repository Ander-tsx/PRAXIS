# Plan de pulido y refactorización

> **Documento de trabajo con estado.** Se actualiza al terminar cada tarea. Si
> una sesión se corta, se retoma leyendo «Dónde estamos» y siguiendo por la
> primera tarea sin marcar.

## Dónde estamos

| | |
|---|---|
| **Etapa actual** | E1 ✅ · E2 ✅ · E3 ✅ · **E6 casi cerrada** (falta E6.5 y E6.6) |
| **Última tarea terminada** | E6.1 y E6.4 — los dos N+1 que quedaban |
| **Siguiente** | E6.5 y E6.6 para cerrar E6 · luego E4 · luego E5 |
| **Marcador** | 194 ✅ / 0 ❌ · 14 `@security` ✅ · 44 unitarias de gateway ✅ |
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

- [!] **E1.9 — Matar el frontend a lo bruto corrompe `.next`, y el síntoma no
      se parece en nada a la causa.**

      Al reiniciar las zonas durante E3 usé `pkill -f 'next dev'` y
      `pkill -f 'turbo run dev'`. Dos consecuencias, las dos caras:

      1. **Se llevó por delante el backend.** `dev:backend` también corre bajo
         turbo, así que el segundo patrón mató los ocho servicios. No es obvio
         desde el nombre del comando.
      2. **Dejó las cachés de Next a medias.** Después, `POST /api/signup`
         respondía **404 en una ruta cuyo archivo existe y que git no había
         tocado**. Por pantalla eso sale como «Ocurrió un error al crear la
         cuenta», y en la suite como **las 33 pruebas de interfaz en rojo a la
         vez** — incluidas las de sesión, que no tienen nada que ver con lo que
         se estaba tocando.

      ⚠️ **Es exactamente la trampa de E1.1b otra vez**: un rojo masivo y
      uniforme parece una regresión gorda y casi nunca lo es. Y es la misma
      forma que ya está documentada en CLAUDE.md para el backend —regenerar
      Prisma con el vigilante en marcha deja `dist/` a medias—, o sea que el
      repositorio ya sabía esto de la otra mitad del sistema.

      **Cómo se sale:** parar el frontend por su tarea (no con `pkill`), borrar
      `apps/frontend/*/.next` y arrancar en frío. Tras eso, la misma ruta
      respondió 200 sin tocar una línea de código.

      **Cómo se diagnostica rápido:** el log de la zona lo decía en claro
      (`POST /api/signup 404`). Cuatro comprobaciones se gastaron antes en
      teorías —el limitador de login, la confirmación de correo, el
      `JWT_SECRET`— por no haberlo leído primero.

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

- [x] **E3.3 — Mover las pantallas.** Con `git mv`, para no perder el historial:
      las 6 de `dashboard-front/src/app/(private)/chat/`, los 3 organismos y
      `lib/ultimo-chat.ts`. ~2.400 líneas. `dashboard-front` se queda **sin una
      sola referencia** al chat.

      🔴 **Lo que de verdad costó no fue mover archivos: fue que el `basePath`
      recorta la ruta, y media docena de sitios daban por hecho el prefijo
      viejo.** Dentro de la zona, `usePathname()`, `revalidatePath()`,
      `redirect()`, `router.push()` y `<Link href>` trabajan **sin** `/chat`.
      Todo lo que venía escrito como `/chat/…` pasaba a significar
      `/chat/chat/…`. Seis sitios, y **ninguno da error de compilación**:

      | Dónde | Qué habría pasado |
      |---|---|
      | `ultimo-chat.conversacionDeLaRuta` | La cookie no se escribe jamás: «vuelve a donde lo dejaste» deja de existir, en silencio |
      | `page.tsx` → `redirect()` | 404 al volver a Mensajes con conversación recordada |
      | `ChatDirectory.activoDeLaRuta` | Ninguna fila marcada nunca y, en móvil, la lista sin apartarse — el mismo fallo que esas líneas vinieron a arreglar |
      | `<Link href>` de persona y de proyecto | `/chat/chat/<id>` |
      | `revalidatePath` (3) | No refresca nada. **Next no se queja de revalidar una ruta que no existe** |
      | `router.push` al borrar | Lleva a un 404 |

      🔴 **Y una que sí explotó, pero solo en el navegador.** El chat traía su
      `layout.tsx` —`AppHeader` + la columna— pero **no** el
      `(private)/layout.tsx` que lo envolvía en dashboard-front, que es quien
      monta el `AppShell`. `tsc` daba verde en las cinco zonas: un contexto de
      React no es un tipo. La pantalla respondía **500** con «useAppShell solo
      funciona dentro de \<AppShell\>» *después* de pintar media página. Se
      arregla con el layout de zona propio, y por eso las conversaciones cuelgan
      de un grupo `(conversaciones)`: hacen falta dos layouts encadenados y dos
      layouts no caben en el mismo nivel.

      ⚠️ **La lección, otra vez: `tsc` verde no es «funciona».** Es literalmente
      el principio 4 del plan, y aquí se cobró siete sitios de una vez.

- [x] **E3.4 — Reescribir las rutas.** Todas cambian de `/dashboard/chat/…` a
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

      ✅ **Hecho, y `rg 'dashboard/chat'` está a cero en código** (solo queda un
      comentario en el `next.config` del shell, que explica la redirección de
      cortesía). De las 13, cuatro se resolvieron solas al mover el código y las
      nueve de fuera se repuntaron a mano.

      ⚠️ **Antes de tocar cada una hubo que mirar si era `<a>` o `<Link>`,** y
      no es un detalle: las nueve viven en **otras zonas**, así que un `<Link>`
      con `/chat/x` en projects-front daría `/projects/chat/x`. Resultaron ser
      todas URLs absolutas del shell —`<a>` planos o constantes que acaban en
      uno—, que es lo correcto para cruzar de zona, pero la comprobación no era
      opcional: el resultado de equivocarse es una URL con dos prefijos y un
      404.

      Sigue pendiente lo que ya decía la nota: la ruta del chat vive en **tres**
      constantes (`navigation.tsx`, `AppShell.HREF_DE_MENSAJES`, `nav.CHAT_HREF`)
      y convendría dejar una. No se hace aquí para no mezclarlo con la mudanza.

- [x] **E3.5 — Redirecciones de cortesía.** `/dashboard/chat` y
      `/dashboard/chat/:path*` → `/chat/…`, con `permanent: true` (308).

      ⚠️ **Van en el `redirects()` del web-shell, no en dashboard-front**, que
      era el plan inicial. Next evalúa `redirects()` **antes** que `rewrites()`,
      así que el shell las atiende sin mandar nada a la zona del panel.
      Resolverlo en dashboard-front obligaría a que esa zona siguiera sabiendo
      del chat solo para reenviarlo — justo el acoplamiento que E3 viene a
      quitar.

      Verificado con las tres formas, incluida la URL exacta que tenía abierta
      el usuario:

      ```
      /dashboard/chat                     → 308 → /chat
      /dashboard/chat/ee9c4757-…-308310   → 308 → /chat/ee9c4757-…-308310
      /dashboard/chat/proyecto/abc        → 308 → /chat/proyecto/abc
      ```

      La cookie de «último chat» sobrevive sola: va con `path: '/'` y guarda solo
      el sufijo, sin prefijo de zona.

      ⚠️ Un 308 se **cachea con ganas** en el navegador. Es lo correcto —la
      dirección se movió para siempre— pero si algún día se revierte la mudanza,
      esa caché sobrevive al despliegue.

- [x] **E3.6 — Verificar.** Con las siete zonas levantadas, a mano y con una
      prueba nueva: `e2e/tests/ui/06-chat-zona.spec.ts`, **3 en verde**.

      Comprobado a mano, extremo a extremo: se entra por el menú, el directorio
      pinta, se abre una conversación con su historial, el flujo SSE se abre por
      `/chat/api/gateway/me/notifications/stream`, y un mensaje enviado por otra
      cuenta **llega al flujo** con `mio: false`, `peerId` resuelto y
      `actorName` puesto —el camino de `conNombre` que blindó E6.7—.

      🔴 **Y aquí está lo que casi se cuela: la primera versión de la prueba de
      tiempo real no probaba nada.** Enviaba un mensaje y comprobaba que salía
      sin recargar. Pasaba. También pasaba con el `zonePath` puesto a
      `/dashboard`… y **también con uno inventado que no existe**. Al caerse el
      flujo, la reconexión acaba provocando un refresco del árbol de servidor y
      el mensaje entra igual, por el camino de respaldo.

      Lo que sí distingue una cosa de otra es **contra qué URL se abre el
      `EventSource`**, y eso es lo que se afirma ahora. Con `zonePath` malo la
      prueba se pone roja diciendo qué flujos se abrieron.

      ⚠️ **De aquí salen dos cosas que conviene no olvidar:**
      1. **Una prueba que pasa con el sujeto roto es peor que no tenerla**,
         porque da por cubierto lo que no lo está. Verificar la prueba rompiendo
         el código a propósito costó dos minutos y cambió la conclusión entera.
      2. **Un `zonePath` mal puesto no se ve desde el navegador** mientras las
         dos zonas estén detrás del shell: `/dashboard/*` se reescribe a la otra
         zona, que tiene su propio proxy, y todo funciona. Esta zona estaría
         hablando por la puerta de otra — invisible aquí, roto en cuanto las
         zonas se sirvan por separado, que es lo que un multi-zone permite.

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

## E5 — El código en inglés, los comentarios en español

> 🔴 **La regla, y no es un punto medio ni una primera fase: es el destino.**
>
> | Qué | Idioma |
> |---|---|
> | Identificadores: variables, funciones, tipos, props, constantes | **Inglés** |
> | Comentarios y JSDoc | **Español** |
> | Documentos de `docs/` y CLAUDE.md | **Español** |
> | Mensajes de commit | **Español** |
>
> **Los comentarios no se traducen nunca.** No es una concesión temporal ni algo
> «a valorar cuando esté hecho lo demás»: es la convención del proyecto. La prosa
> explicativa de este repositorio —el porqué de cada decisión, las trampas que ya
> mordieron— es la mitad de su valor, y está escrita en español con cuidado.
> Traducirla sería reescribirla, y reescribirla es perder el matiz que la hace
> útil.
>
> ⚠️ *(Corrección del 17-08.* Este documento planteaba «tres niveles de alcance
> por decidir», con los comentarios como nivel 2 opcional. Eso era ambiguo y
> estaba mal: el objetivo siempre fue el código, y los comentarios se quedan como
> están. Queda escrito así para que nadie vuelva a abrir esa decisión.)*

> **Por qué el código sí.** Un identificador es una interfaz: lo lee quien llama,
> a menudo sin abrir el cuerpo. Un comentario es una explicación: lo lee quien ya
> está dentro. Mezclar idiomas en lo primero obliga a traducir mentalmente en
> cada llamada; en lo segundo no estorba a nadie.
>
> **Un ejemplo real, señalado por el usuario (17-08):** `contarSinLeerDeVarios`.
> Hace falta leer el cuerpo para saber qué cuenta, de qué y para quién. En inglés
> sería `countUnreadForChannels`, que se entiende sin abrirlo. No es incomodidad
> estética: es que el nombre no dice lo que hace.

> **Medido (17-08), para que el alcance no sea a ojo.** De **1.233
> identificadores exportados** en `apps/`, unos **160 tienen raíz española** —el
> 13%—. No están repartidos: se concentran en lo más nuevo (`realtime/`, el
> asistente con sus `Propuesta*`, el chat) y el resto del repositorio ya exporta
> en inglés. Es un lote acotado, no «tocar todo».

> **Método, y esto sí es innegociable:** por lotes, con renombrado mecánico, y
> **un commit por lote sin nada más dentro**. Un renombrado que viaja junto a una
> corrección hace imposible revisar ninguna de las dos — es el riesgo que ya
> estaba anotado al final de este documento.
>
> ⚠️ **Y el renombrado toca el comentario de al lado.** Si un comentario dice «lo
> que devuelve `contarSinLeerDeVarios`», ese nombre dentro del texto también
> cambia. Sigue siendo un comentario en español: lo que cambia es el
> identificador que cita, no la prosa.

- [x] **E5.0 — Alcance decidido.** Identificadores a inglés; comentarios,
      documentos y commits en español. Ver la tabla de arriba.

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
- [ ] **E5.8 — Escribir la convención en CLAUDE.md**, en la sección de reglas
      del frontend: **identificadores en inglés, comentarios en español**. Sin
      esto, la mitad en inglés parece un descuido en vez de una regla, y el
      primero que llegue «arreglará» un nombre traduciéndolo al español.

---

## E6 — Optimización y seguridad

- [x] **E6.1 — Repasar el resto de N+1.** Barrido sobre frontend y backend.
      **Quedaban dos**, los dos con la misma forma: pedir por id dentro de un
      `map`.

      - 🔴 `reports-front/(private)/[id]/page.tsx` — `/users/<id>` **uno por
        uno**, y lo irónico es que era el arreglo de otro fallo: se cambió
        `?limit=100` por peticiones individuales para no depender de la primera
        página del directorio. Un proyecto de veinte personas eran veinte
        peticiones por carga, todas con la IP del servidor de Next, así que el
        limitador del gateway las contaba en el mismo cubo que las de todo el
        mundo; al pasarse, el `.catch(() => null)` se tragaba el 429 y la
        pantalla escribía **«Alguien que ya no está» sobre gente que estaba
        perfectamente**. Ahora usa `resolverPerfiles` —el helper que existe justo
        para esto— y `nombreDePersona`, que distingue «no existe» de «no se pudo
        preguntar».
      - `gateway/assistant.controller.miembrosConNombre` — una llamada TCP
        `user_find_one` **por miembro**, cada vez que el asistente necesita saber
        quién es quién. Ahora `user_find_by_ids`, que ya existía y usan el panel
        de administración y alexa-service.

      **No** se tocan dos que lo parecen y no lo son: `plantilla/aplicar.ts`
      (crear N etiquetas exige N POST, no hay ruta por lotes, y su `catch`
      **recoge el motivo** en vez de tragárselo) y `mentionables.tareasDe` (una
      llamada por tablero, y los tableros de un proyecto son pocos).

      ✅ Comprobado que no queda ningún `api.get<UserProfile>` por id suelto en el
      frontend: los dos aciertos del barrido final son el ejemplo malo *dentro de
      un comentario* de `directorio.ts` y una petición del perfil **propio** que
      responde «no se pudo comprobar» en vez de afirmar nada.

- [x] **E6.4 — Repasar los `catch` que se tragan errores.** Hay **105**
      `.catch(() => …)` en el repositorio, y la conclusión del repaso es que la
      cuenta no es la métrica: **casi todos son correctos**.

      La regla que los separa, y que conviene aplicar al escribir el siguiente:

      | Clase | Ejemplo | ¿Correcto? |
      |---|---|---|
      | Degradar una **sección** | «que falle una lista no puede impedir leer la conversación que ya está abierta» | ✅ Sí |
      | Recoger el **motivo** | `plantilla/aplicar.ts`, que apunta el fallo por etiqueta en `fallos[]` | ✅ Sí |
      | Afirmar algo **falso** | tragarse un 429 y escribir «Alguien que ya no está» | 🔴 No |

      Solo la tercera es un fallo, porque convierte «no lo pude preguntar» en «no
      existe» — y esa afirmación llega al usuario con toda la apariencia de un
      dato. Era el caso de `reports-front`, y se cierra en E6.1 con
      `resolverPerfiles` + `nombreDePersona`, que es la pareja que existe para no
      volver a mezclarlas.

      **Barrido de comprobación:** no queda ningún sitio que pida un perfil por
      id y se trague el error. Los `.catch` restantes degradan una sección o
      recogen el motivo, que es lo que deben hacer.
- [x] **E6.2 — El `EXPLAIN` de `contarSinLeerDeVarios`, y lo que destapó.**

      🔴 **No faltaba ningún índice: sobraba un `OR`.** La consulta que cuenta
      los no leídos —la que se ejecuta al abrir la bandeja y al pintar el
      directorio, o sea de las más frecuentes— agrupaba sobre **todos** los
      mensajes de los canales pedidos y filtraba después. O sea que contar «3 sin
      leer» costaba leer el historial entero del canal: el coste no dependía de
      lo que falta por leer, sino de todo lo que se ha hablado ahí desde siempre.
      Es la única consulta del sistema que **empeora sola con el uso**.

      El índice `(channelId, createdAt)` ya existía. Lo que impedía usarlo como
      rango era `OR s."lastReadAt" IS NULL`: con un `OR` ahí, Postgres no puede
      acotar por `createdAt` y solo le queda leerlo todo. Sustituido por
      `COALESCE(..., '-infinity')` y reescrito con `LATERAL` por canal, el plan
      pasa a ser un recorrido de índice acotado.

      **Medido** con 300.000 mensajes en 500 canales y una lectura realista
      —casi todo leído, unos pocos pendientes—, pidiendo 20 canales:

      | | Antes (`GROUP BY`) | Ahora (`LATERAL`) |
      |---|---|---|
      | Filas leídas | 11.700 | **18** |
      | Buffers | 817 | **109** |
      | Tiempo | 3,96 ms | **0,73 ms** |

      Y la diferencia **crece con el historial**: la de antes es O(mensajes del
      canal), esta es O(mensajes sin leer).

      ⚠️ **La primera medición dio lo contrario, y el dato era mío.** Sembré el
      `lastReadAt` a tres días, así que el 85% estaba sin leer y barrerlo todo
      *era* el plan correcto: el `LATERAL` salía peor (12.067 buffers). Con una
      lectura realista se invierte. **Un banco de pruebas mal parametrizado no da
      un resultado ruidoso: da el resultado contrario, con toda la autoridad de
      un `EXPLAIN ANALYZE`.**

      ⚠️ El experimento entero va dentro de una transacción con `ROLLBACK`, así
      que la base de desarrollo queda como estaba.

      Verificado con `api/15-chat.spec.ts` (17 ✅), que incluye la prueba de que
      el contador sube con lo ajeno, no con lo propio, y se pone a cero al marcar
      leído.

      Queda por mirar el resto de lo que pedía la tarea: el historial del chat y
      `misConversaciones`. El historial ya usa `(channelId, createdAt)` con
      cursor, que es la forma correcta; `misConversaciones` hereda la mejora de
      arriba porque llama a esta misma función.
- [x] **E6.3 — Tope de conexiones SSE por cuenta.**
      No había ninguno: cien pestañas eran cien conexiones sostenidas contra el
      gateway, cada una con su latido cada 25 s. Denegación de servicio trivial,
      y sin necesitar mala fe — basta con dejar sesiones abiertas.

      `SSE_MAX_CONEXIONES_POR_CUENTA`, por defecto **10** (una pestaña por zona
      y alguna repetida). El que sobra recibe **429 `TOO_MANY_STREAMS`**.

      ⚠️ **Se rechaza la nueva conexión, no se cierra la vieja**, y la diferencia
      es todo. Desalojar la más antigua parece más amable, pero `EventSource`
      **reconecta solo** cuando un flujo abierto se corta: la pestaña desalojada
      volvería en el acto y echaría a la siguiente. Un tope hecho así es una
      tormenta de reconexiones. Ante una respuesta que **no** es 200 con
      `text/event-stream`, en cambio, el navegador da la conexión por fallida y
      no reintenta — por eso la comprobación vive en el **controlador**, antes de
      abrir nada, y no dentro del `Observable`.

      ⚠️ **El valor se lee por `ConfigService` en el constructor**, no en una
      constante del módulo: es la trampa 17 de CLAUDE.md, donde un
      `process.env.X` arriba del archivo no ve el `.env` y coge el valor por
      defecto **en silencio**.

      Verificado en los dos sentidos contra el gateway real, con el tope a 2: dos
      flujos abiertos y el tercero **429**; al cerrar uno, el siguiente **200**.
      Esa segunda mitad importa tanto como la primera — si el cupo no se liberase
      al cerrar, el tope dejaría de ser un límite de concurrencia y sería uno de
      por vida, y el síntoma sería «a mí no me llegan los mensajes» sin un solo
      error. Fijado además con 3 unitarias
      (`notifications-stream.limite.spec.ts`), incluida que el tope es **por
      cuenta**: uno global dejaría sin tiempo real a toda la plataforma por culpa
      de una sola persona con muchas pestañas.

- [x] **E6.8 — Un canal de Redis por persona, no un patrón global.**
      *(Hallazgo de esta sesión al revisar la escalabilidad. No estaba en el plan.)*

      `NotificationsStreamService` hacía `psubscribe('avisos:*')`, así que **cada
      instancia del gateway recibía cada evento de cada usuario** y descartaba
      los ajenos. Con 3 instancias el tráfico de pub/sub se multiplicaba por 3;
      con 20, por 20. Era el techo de escalado horizontal del tiempo real, y no
      daba ningún síntoma hasta chocar contra él.

      El comentario que lo defendía decía que la alternativa era «un socket a
      Redis por cada pestaña». **Falsa disyuntiva**: una sola conexión
      suscriptora admite miles de canales. Lo que cambia no es el número de
      sockets —sigue siendo uno— sino a qué se suscribe.

      Ahora se hace `SUBSCRIBE avisos:<userId>` al abrir la **primera** pestaña
      de esa persona y `UNSUBSCRIBE` al cerrar la **última** — los mismos dos
      puntos donde ya se marcaba la presencia.

      ⚠️ **Las dos formas de equivocarse aquí son mudas**, y por eso van con
      prueba: suscribir en cada pestaña (en vez de solo la primera) empareja con
      un `UNSUBSCRIBE` al cerrar cualquiera y deja **sordas a las demás**, que
      siguen abiertas; y no cancelar al cerrar la última devuelve poco a poco al
      problema original. Ninguna da error: salen como «a veces no me llegan los
      mensajes».

      ⚠️ Se resuscribe también en el `ready` de Redis. ioredis ya reemite sus
      suscripciones al reconectar, pero no cubre las conexiones abiertas
      **mientras Redis estaba caído**: con `enableOfflineQueue: false` esos
      `SUBSCRIBE` fallan y nadie los reintentaría.

      **Verificado contra Redis real**, que es lo que convierte esto en un hecho:

      | Momento | `PUBSUB CHANNELS 'avisos:*'` | `PUBSUB NUMPAT` |
      |---|---|---|
      | Antes (patrón global) | — | **1** |
      | Ahora, con una persona conectada | 1 canal | **0** |
      | Al conectarse otra | 2 canales | 0 |
      | Al cerrar esa | vuelve a 1 canal | 0 |

      Y los eventos siguen llegando: `ui/06-chat-zona` en verde, incluida la que
      afirma contra qué URL se abre el flujo.

      ⚠️ **Al medir aparecieron dos conexiones zombis** con `psubscribe` de 5,8 y
      7,8 horas — procesos que maté antes y cuyos sockets Redis aún no había
      soltado. Daban `NUMPAT = 1` y habrían hecho parecer que el cambio no
      funcionaba. Un `CLIENT KILL` y a cero.

      A favor de lo que había: el descarte ocurría **antes** del `JSON.parse` (se
      mira `oyentes.get` primero), así que el coste por evento ajeno era una
      búsqueda en un `Map`. Por eso a la escala de hoy no se notaba, y por eso
      esto era deuda de escalado y no un fallo.

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
| Alguien traduce los comentarios «por coherencia» | La regla está en E5 y va a CLAUDE.md (E5.8): el código en inglés, la prosa en español, **a propósito** |
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
| 2026-08-17 | E3 | **Cerrada, con la suite en verde: 194 ✅ / 0 ❌ (26,3 min) + 14 `@security` ✅.** El chat vive en `chat-front` (4106, `basePath: '/chat'`). `rg 'dashboard/chat'` a cero, redirección 308 para las direcciones viejas, y `ui/06-chat-zona.spec.ts` (3 ✅) fijando la zona y **la URL contra la que se abre el flujo en vivo**. Lo que costó no fue mover archivos: fue que el `basePath` recorta la ruta y siete sitios daban por hecho el prefijo viejo, ninguno con error de compilación. |
