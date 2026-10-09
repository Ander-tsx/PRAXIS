# PLAN-AUTH-KYLOO — Kyloo Accounts como único autenticador de Praxis

> **Estado:** en curso (2026-10-09, rama `feature/auth-kyloo` en este repositorio y en `../KYLOO-AUTH`).
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

_(se rellena al cerrar cada fase)_
