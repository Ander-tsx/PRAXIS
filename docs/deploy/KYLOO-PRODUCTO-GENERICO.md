# Kyloo Accounts como proveedor genérico: puesta en producción

Praxis pasa a ser **un producto más** de Kyloo Accounts. Lo que cambia respecto a
[OAUTH-KYLOO-PRODUCCION](OAUTH-KYLOO-PRODUCCION.md) (que queda como historia de la primera puesta):

| Antes | Ahora |
|---|---|
| Kyloo conocía a Praxis y llamaba a sus rutas con un secreto HMAC compartido | Praxis verifica **tokens que Kyloo firma**, con sus claves públicas. No hay secreto compartido |
| La pantalla de organizaciones vivía en Kyloo (`/organizacion`) | Vive aquí: `/auth/kyloo/connect` |
| El token del MCP llevaba `praxis_connection` | Lleva `connection_id`. Praxis acepta las dos mientras vivan los refresh tokens viejos |
| `legacy-login` migraba contraseñas de Praxis | Se elimina. Ver «Cuentas sin vincular» |
| `revoke` | Evento `user.credentials_changed` a `/api/internal/kyloo/events`, con reintentos |

Contrato completo: `docs/integracion/producto-nuevo.md` en el repo de Kyloo Accounts.

## Orden (importa: Praxis primero)

1. **Praxis** (este repo): despliega con `KYLOO_CLIENT_ID` y `KYLOO_CLIENT_SECRET` en `praxis-api`
   —ya existen— y sigue aceptando `praxis_connection`, así que nada se rompe con Kyloo viejo.
2. **Kyloo Accounts**: añade `PRODUCTS` a `kyloo-auth-api` y despliega. Al arrancar se aplican las
   migraciones `0004` (borra `praxis_selection`) y `0005` (`connect_selection`, `event_delivery`).
3. Retira `KYLOO_INTERNAL_SECRET` de `praxis-api` y `PRAXIS_INTERNAL_URL` y `PRAXIS_INTERNAL_SECRET`
   de `kyloo-auth-api`: ya no se usan.

## `PRODUCTS` en `kyloo-auth-api`

Una línea de JSON. `clientId` es el de Praxis (`KYLOO_CLIENT_ID`). Los scopes conservan sus nombres
para que no se invaliden consentimientos ni tokens vivos.

```json
[{"slug":"praxis","name":"Praxis","homeUrl":"https://usepraxis.space","clientId":"<KYLOO_CLIENT_ID>","connectUrl":"https://usepraxis.space/auth/kyloo/connect","webhookUrl":"https://usepraxis.space/api/internal/kyloo/events","heroVideo":"/media/hero-bloom.mp4","heroPoster":"/media/hero-bloom.png","resource":{"identifier":"https://usepraxis.space/api/mcp","scopes":[{"name":"praxis:read","title":"Ver tus proyectos, tareas y documentos","detail":"Solo de las organizaciones que elijas.","required":true},{"name":"praxis:write","title":"Crear y editar tareas, documentos y comentarios","detail":"Lo que haga quedará a tu nombre."},{"name":"praxis:delete","title":"Borrar tareas, documentos y proyectos","detail":"No se puede deshacer.","dangerous":true}]}},{"slug":"oskel","name":"Oskel","homeUrl":"https://oskel-web-production.up.railway.app"}]
```

`MCP_RESOURCES` y `DCR_REDIRECT_ORIGINS` se mantienen. `MCP_RESOURCES` deja de leerse: el recurso
sale de `PRODUCTS`.

## Cuentas sin vincular

Quien nunca entró en Praxis con Kyloo no tiene cuenta en Kyloo, y ya no hay migración de
contraseñas. No pierde nada: se registra en Kyloo con **el mismo correo**, lo verifica y Praxis
vincula su cuenta por correo, con todos sus datos. A 2026-11-01 eran 7 de 16 cuentas, 3 de ellas
con contraseña (las otras 4 solo usan Google).

## Comprobar tras desplegar

- Conectar Claude o ChatGPT al MCP: login → «¿Con qué organizaciones…?» → consentimiento.
- Cambiar una contraseña de prueba en Kyloo y ver, en los logs de `praxis-api`, que llega el evento.
- Un refresh token anterior sigue canjeándose y su access token trae `connection_id`.
