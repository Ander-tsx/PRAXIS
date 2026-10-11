# PLAN-AUTH-KYLOO — Kyloo Accounts como único autenticador de Praxis

> **Estado:** entregado sin desplegar (2026-10-09, rama `feature/auth-kyloo` en este repositorio y en `../KYLOO-AUTH`).
> Continúa [PLAN-OAUTH-KYLOO](PLAN-OAUTH-KYLOO.md): allí «Continuar con Kyloo» era una opción junto a
> Google; aquí pasa a ser **la única puerta**. Sustituye a las opciones «alta bajo demanda» y
> «entrada única con ticket» que se barajaron al cerrar aquel plan.

## Qué se quiere

Una persona tiene **una sola cuenta en todo el ecosistema Kyloo**. Al registrarse o entrar en Praxis
la mandamos a Kyloo Accounts —con la marca «Praxis by Kyloo», con el diseño del login actual— y
vuelve autenticada. **Kyloo guarda las credenciales** (contraseña, correo verificado, Google, 2FA);
**Praxis conserva al usuario completo** (perfil, roles, organizaciones, planes) y lo identifica por
el `sub` de Kyloo.

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Kyloo autentica; Praxis autoriza.** Praxis deja de ver contraseñas, de verificar correos y de hablar con Google | Una sola puerta: no hay cuentas divergidas ni dos sitios donde olvidar un arreglo de seguridad |
| D2 | **La sesión de Praxis no cambia**: tras el OIDC se emite el mismo JWT de 15 min + refresh de siempre (`emitirSesion`). Praxis no consulta a Kyloo en cada petición | Que Kyloo duerma o caiga no tumba a quien ya está dentro. Roles, MCP, PRAX y e2e no se enteran |
| D3 | **`AUTH_MODE=local\|kyloo`** (por omisión `local`). En `kyloo` se cierran login por contraseña, registro, verificación, recuperación y Google, y las pantallas redirigen a Kyloo. Desarrollo y e2e siguen en `local` | Es la vuelta atrás (cambiar una variable) y evita levantar Kyloo en una máquina de 8 GB para probar Praxis |
| D4 | **Migración perezosa, sin exportar ningún hash.** Si alguien entra en Kyloo con un correo que Kyloo no conoce, Kyloo pregunta a Praxis (llamada firmada) si esa contraseña vale para una cuenta heredada; si vale, crea la cuenta de Kyloo con **su propio hash** y el correo verificado | Nadie tiene que restablecer nada y ninguna contraseña ni hash viaja en bloque. Quien nunca vuelve, nunca migra, y no pasa nada |
| D5 | **Vinculación por `kylooSub` y, la primera vez, por correo verificado por Kyloo.** En modo `kyloo` basta con que **Kyloo** lo haya verificado; el hash heredado se borra al vincular | El 409 de «cuenta sin confirmar» protegía de un correo ocupado por otro; con Kyloo como única puerta, la prueba de posesión es la de Kyloo, y borrar el hash cierra la puerta vieja |
| D6 | **Cambiar o restablecer la contraseña en Kyloo cierra las sesiones de Praxis** (llamada firmada de Kyloo a Praxis que borra sesiones, tokens personales y conexiones OAuth) | Sin esto, el refresh token de 7 días de quien robó la sesión seguiría vivo tras el cambio |
| D7 | **Si el correo cambia en Kyloo, Praxis lo sigue** en la siguiente entrada (solo con correo verificado y sin chocar con otra cuenta) | La identidad es el `sub`; el correo es un dato |
| D8 | **Kyloo sigue con auto-sleep** (decisión del dueño, 2026-10-09). Se habilita always-on si Kyloo crece y se vuelve indispensable | Coste. La consecuencia —el primer login tras un rato tarda unos segundos— es aceptada |
| D9 | **Texto legal:** las credenciales las aloja Kyloo; las contraseñas se guardan con hash irreversible y las comunicaciones viajan cifradas | Es lo que de verdad ocurre. No se afirma cifrado en reposo de la base: no está verificado |

## Invariantes

1. **En modo `kyloo`, Praxis nunca recibe ni verifica una contraseña.** Las rutas responden 403 `AUTH_DELEGATED`.
2. **El modo `local` queda exactamente como estaba**: la suite e2e y el desarrollo no cambian.
3. **El `id_token` se verifica igual que hoy** (firma, `iss`, `aud`, `nonce`) y el correo viene de `userinfo` con `email_verified`.
4. **`legacy-login` solo responde a llamadas firmadas** y no distingue por qué falla (cuenta inexistente, contraseña mala, sin verificar, suspendida).
5. **Nunca se reasigna un `kylooSub` ya vinculado.**
6. **Un cambio de credencial en Kyloo revoca en Praxis** (D6).

## Cómo funciona

```
Praxis /auth/login ─(AUTH_MODE=kyloo)─▶ /auth/api/kyloo/start ─▶ Kyloo /entrar  (Praxis by Kyloo)
                                                                   │ correo + contraseña / Google
                                   cuenta nueva en Kyloo ◀─────────┤ (si no existe: legacy-login ▶ Praxis)
Praxis /auth/api/kyloo/callback ◀── code ──────────────────────────┘
   └▶ gateway POST /auth/kyloo ▶ credentials: canjea, verifica, vincula por sub/correo ▶ sesión de Praxis
```

## Fases

| Fase | Qué | Dónde |
|---|---|---|
| A | `AUTH_MODE`, guard `AUTH_DELEGATED`, verificación heredada, revocación, vinculación D5/D7 | `credentials`, `gateway` |
| B | Gancho de migración perezosa y de revocación en Better Auth; cliente interno hacia Praxis | `KYLOO-AUTH/apps/api` |
| C | `proxy.ts` redirige las pantallas; `start` admite `screen=login\|signup`; sin botón de Google en modo `kyloo` | `web` |
| D | Términos y aviso de privacidad | `web/src/content/legal` |
| E | Pruebas unitarias e integración; flujo completo en local con los dos sistemas reales | ambos |
| F | Runbook de despliegue y lista de qué probar | `docs/deploy` |

## Despliegue (resumen; el detalle, en F)

1. Subir **Kyloo** primero (el gancho solo actúa si `PRAXIS_INTERNAL_URL` existe, que ya existe).
2. Subir **Praxis** con `AUTH_MODE=local` (sin cambio visible) y comprobar.
3. Probar el flujo con una cuenta real **en un entorno con `AUTH_MODE=kyloo`**, o poniéndolo y quitándolo.
4. Dejar `AUTH_MODE=kyloo`. Volver atrás = `AUTH_MODE=local`.
5. Semanas después, si todo va bien: borrar el código de contraseñas de Praxis (no antes).

## Lo que no se hace aquí

- No se borra el código de contraseñas de Praxis: es el `local` que usan e2e y desarrollo, y la vuelta atrás.
- No se migran cuentas en bloque ni se exportan hashes (D4).
- No se pone Kyloo always-on (D8).
- Los correos transaccionales de Kyloo siguen saliendo con su marca; solo el login se viste de Praxis.

## Registro

**2026-10-09 — fases A a F entregadas en `feature/auth-kyloo` (sin desplegar).**

- **A** (`credentials`, `gateway`): `AUTH_MODE`, `ModoLocalGuard` (403 `AUTH_DELEGATED`), vinculación D5/D7,
  `verificarCredencialHeredada` y `revocarTodoDe`, y las rutas internas `legacy-login` y `revoke`.
- **B** (`KYLOO-AUTH/apps/api`): gancho `before` de `/sign-in/email` (migración perezosa), `onPasswordReset`
  y `after` de `/change-password` (revocación), `PraxisClient.entradaHeredada/revocar`.
- **C** (`web`): `proxy.ts` redirige las cinco pantallas; `screen_hint=signup`; en Kyloo, `/entrar` salta a
  `/registro` una vez por intento.
- **D**: términos y aviso de privacidad dicen que Kyloo custodia las credenciales.
- **E**: pruebas unitarias (credentials 58, gateway 178, web, Kyloo 14) e integración (Kyloo 36) en verde, y
  una prueba de punta a punta con **los dos sistemas reales** (sin navegador): cuenta heredada → Kyloo con su
  contraseña de Praxis → OIDC → misma cuenta de Praxis vinculada y hash borrado → persona nueva con su espacio
  personal → cambiar la contraseña en Kyloo tumba el refresh token de Praxis. Y las cuatro rutas propias dan
  403 `AUTH_DELEGATED`.
- **F**: [AUTH-KYLOO-PRODUCCION](deploy/AUTH-KYLOO-PRODUCCION.md).

### Trampas que aparecieron

- 🔴 **Antes de este plan, las cuentas nuevas por Kyloo o Google no recibían espacio personal.** Solo
  `register` lo creaba. Con Kyloo como única puerta, `POST /auth/kyloo` ahora lo pide tras cada entrada
  (`billing_personal_org` es idempotente).
- ⚠️ **Praxis exige correo verificado por Kyloo.** En local Kyloo no pide confirmar el correo (`REQUIRE_EMAIL_VERIFICATION=false`)
  y Praxis rechaza esa cuenta, con razón; en producción la confirmación es obligatoria.
- ⚠️ **Dos instancias de Kyloo contra la misma base chocan** al registrar el mismo recurso OAuth (`oauth_resource_identifier_unique`).
  Solo afecta a las pruebas de integración: el bloque de migración arranca la suya con `MCP_RESOURCES: []`.
- ⚠️ El query de `/oauth2/authorize` va **firmado**: no se puede quitar `screen_hint` al redirigir a `/registro`;
  por eso el salto se recuerda en `sessionStorage` por `sig`.
- 🍎 `pkill -f "monolith/dist/main.js"` no mata nada: el proceso es `node … dist/main.js`. Se mata por `max-old-space-size=512 dist/main.js`.

### Incidente del 2026-10-10 y red de seguridad (D10)

Con `AUTH_MODE=kyloo` en producción **nadie podía entrar**: `ERR_TOO_MANY_REDIRECTS`. Tres causas encadenadas:

1. 🔴 **El canje de código (`/oauth2/token`) tenía 60/min por IP, y todas las entradas salen de la
   misma IP** —el servidor de Praxis—. Unas decenas de logins bastaban para el 429.
2. 🔴 **El fallo del callback volvía a Kyloo en bucle**: `/auth/login?kyloo_error=…` → el proxy
   redirigía a `/auth/api/kyloo/start` → Kyloo → callback falla → … Cada vuelta gastaba otro canje,
   así que se alimentaba sola, y el tráfico acabó bloqueado por el **borde de Railway**
   (`429 rate limited`, `server: railway-hikari`) para todo `accounts.kyloo.com.mx`.
3. Praxis web seguía con la versión anterior (`prompt=login`) porque su deploy de las 15:01 había fallado.

Se volvió atrás con `AUTH_MODE=local` (la vuelta atrás documentada) y se corrigió:
límites de `/oauth2/token` y `/oauth2/userinfo` a 600/min, el proxy ya no redirige con `?kyloo_error`,
y **D10: red de seguridad automática** — con `AUTH_MODE=kyloo`, contraseña y Google siguen abiertos en el
gateway (`ModoLocalORespaldoGuard`; registro, verificación y recuperación, no). La pantalla los muestra
**solo** si Kyloo falla (`?kyloo_error=`) o no responde (`/auth/api/kyloo/start` comprueba el
`openid-configuration` con 4 s de margen), con aviso y sin enlaces de registro. `AUTH_FALLBACK_LOCAL=false` los cierra.
Coste asumido: la contraseña solo existe en cuentas heredadas sin migrar (vincular borra el hash), el resto
entra por Google, y por este camino no hay 2FA de Kyloo.

⚠️ **No se vuelve a `AUTH_MODE=kyloo` hasta que `accounts.kyloo.com.mx` deje de dar 429 en el borde.**

### Pendiente

- Verlo en un navegador (las pantallas de Kyloo con la marca Praxis, la PWA al salir y volver de Kyloo).
- Desplegar según [AUTH-KYLOO-PRODUCCION](deploy/AUTH-KYLOO-PRODUCCION.md).
- Retirar el código de contraseñas de Praxis, semanas después y solo si todo va bien (no antes: es el `local` de e2e).
