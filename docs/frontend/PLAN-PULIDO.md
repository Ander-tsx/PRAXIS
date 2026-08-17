# Plan de pulido y refactorización

> **Documento de trabajo con estado.** Se actualiza al terminar cada tarea. Si
> una sesión se corta, se retoma leyendo «Dónde estamos» y siguiendo por la
> primera tarea sin marcar.

## Dónde estamos

| | |
|---|---|
| **Etapa actual** | E1 — en curso |
| **Última tarea terminada** | E1.5 |
| **Siguiente** | E1.6 |
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

- [ ] **E1.6 — `pnpm e2e:seguridad`**: comprobar que el marcador no ha empeorado.

---

## E2 — Deuda conocida de las fases 1-4

Lista cerrada, ya diagnosticada. Ninguna necesita investigación.

- [ ] **E2.1 — `terraform apply` del pool.** `max_connections = 150` en
      `sql.tf`. ⚠️ **Reinicia la instancia de Cloud SQL**; hay que elegir
      ventana. Es la mitad del arreglo de la lentitud: la otra (`DATABASE_POOL_MAX
      = 5`) ya está en el código y viaja con el despliegue.

- [ ] **E2.2 — Cachear el canal en `PublicadorDeEventos`.**
      Hoy son 2-3 consultas **por evento** (canal, miembros, silenciados). En el
      chat de un equipo grande, por mensaje. Caché en Redis con TTL corto (30 s)
      del canal y sus miembros; los silenciados se leen aparte porque cambian con
      un gesto del usuario.

- [x] **E2.3 — Adelgazar el fan-out de presencia.** (`4c9c9fc`)
      `anunciar` pedía `chat_contacts`, que devuelve por cada contacto todos los
      proyectos en común con nombre, slug y rol —dos `join` y una fila por cada
      par (persona, proyecto)— para usar **una columna**. Ahora hay
      `cmd: 'chat_peer_ids'`, que lo resuelve con `distinct` y sin `join`.
      Verificado contra Redis con un `psubscribe`: el cambio llega a la propia
      cuenta con `mio: true` y a los compañeros con `mio: false`.

- [~] **E2.4 — `usePresencia` en `ProjectMembers`** (projects-front). Era la
      única superficie con esferas de estado que no escuchaba el flujo.
      `ProjectMembers` es de servidor, así que el avatar baja a un componente de
      cliente mínimo (`MemberAvatar`) en vez de convertir la pestaña entera.
      Falta pasar `ui/05-equipo.spec.ts`, que existe justo porque `tsc` no ve un
      error de frontera servidor/cliente: da verde y la pantalla revienta al
      pedirla.

- [ ] **E2.5 — Huecos largos de reconexión.**
      `?after=` trae 50 y **no avisa de que falta más**: una desconexión larga
      pierde mensajes en silencio. Mínimo: devolver `hayMas` y que el panel
      recargue la conversación entera cuando venga `true`. Ideal: Redis Streams
      con `Last-Event-ID` para replay exacto — decisión aparte, más cara.

- [ ] **E2.6 — Acuses por mensaje (o cerrar el tema).**
      El «visto» dentro de un hilo se ha **ocultado** (`mostrarVisto={false}`)
      porque los acuses se guardan por canal. Contestarlo de verdad exige una
      tabla de acuses por mensaje. Decidir: se implementa o se documenta como
      límite del producto.

---

## E3 — Extraer el chat a su propio microfrontend

`chat-front`, puerto **4106**, basePath `/chat`. Sigue el checklist de zona nueva
de ESTADO-ACTUAL §17.7.

> ⚠️ **Después de E1.** Esta etapa mueve todas las rutas del chat; sin pruebas
> detrás, un enlace mal migrado se descubre en producción.

- [ ] **E3.1 — Andamiaje de la zona.** `package.json` (puerto 4106),
      `next.config` con `basePath: '/chat'`, `proxy.ts` con su guard **y `'/'`
      como entrada aparte del matcher** (§17.6: el lookahead negativo no casa la
      raíz), `app/api/gateway/[...path]/route.ts`, `globals.css` importando
      `commons/styles/theme.css` con su `@source` y sus `@font-face` con el
      basePath, `layout.tsx` estampando `data-theme` desde la cookie.

- [ ] **E3.2 — Registrar la zona.** `rewrites()` del web-shell,
      `scripts/dev-cli/config/services.mjs`, `.env.local` con el mismo
      `JWT_SECRET`, y el despliegue (`infra/`).

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

- [~] **E6.7 — Promesas sueltas que pueden tumbar un servicio.**
      Un `void promesa()` que se rechaza es un `unhandledRejection`, y en Node
      **eso mata el proceso**. No lo cubre el `try/catch` que lo rodea: para
      cuando el rechazo ocurre, la función ya salió de él. Lo descubrió la prueba
      de `PublicadorDeEventos`, que tiró el proceso de Jest en seco.

      Barrido de `rg '^\s*void [a-zA-Z_$][a-zA-Z0-9_$.]*\('` sobre `apps/backend`
      — 18 sitios, clasificados:

      - [x] `PublicadorDeEventos.repartir` → el `publish` del bucle (`3821373`).
      - [x] `PresenceService.anunciar` → el `publish` del bucle (`4c9c9fc`).
      - [ ] `ChatService.send` → `void this.touchRead(...)`. Es una escritura de
            Prisma: cualquier tropiezo de la base al mandar un mensaje tumba
            projects-service.
      - [ ] `AuthService.register` → `void this.tokens.enviarVerificacion(...)`.
            `MailService.enviar` sí traga lo suyo, pero `emitir()` es otra
            escritura de Prisma. Una base con hipo durante un alta se lleva por
            delante credentials-service, o sea la autenticación entera.
      - [ ] `NotificationsStreamService` → `void this.conNombre(e).then(...)`.
            `conNombre` no lanza (está documentado), pero el `.then` reparte a
            los oyentes; barato de blindar.
      - [x] El resto —`marcarVivo`, `marcarIdo`, `anunciar`, `elegidaDe`,
            `repartir`, `aUnaPersona`— ya tienen su `try/catch` o su `.catch()`
            **dentro**. Revisados, no hace falta tocarlos.
- [ ] **E6.5 — Revisar el tamaño de los bundles.** `sileo` arrastra `motion`;
      comprobar cuánto pesa en cada zona y si compensa cargarlo diferido.
- [ ] **E6.6 — `pnpm security` / revisión de dependencias.**

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
