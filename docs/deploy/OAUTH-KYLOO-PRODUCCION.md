# OAuth con Kyloo Accounts: puesta en producción

> 🕰️ **Historia de la primera puesta.** El secreto compartido, `/organizacion` y `legacy-login` de
> aquí se sustituyeron: ver [KYLOO-PRODUCTO-GENERICO](KYLOO-PRODUCTO-GENERICO.md).

Pasos exactos para desplegar [PLAN-OAUTH-KYLOO](../PLAN-OAUTH-KYLOO.md). El orden importa:
`kyloo-auth-api` **no arranca** si le falta una variable de producción (es lo previsto), y ese
servicio también lo usa Oskel. Por eso las variables y la migración van **antes** de subir el código.

Todo el proyecto de Railway se llama `KYLOO SPACE`. Servicios: `kyloo-auth-api`, `kyloo-auth-accounts`,
`kyloo-auth-db`, `praxis-api` (el monolito), `praxis-web`.

```bash
export PATH="$(npm prefix -g)/bin:$PATH"   # el CLI de Railway quedó instalado ahí
cd ../KYLOO-AUTH && railway link --project "KYLOO SPACE" --environment production
```

## 1. Secreto compartido (una vez)

```bash
openssl rand -base64 48 | tr -d '\n=' | tee /dev/stderr | pbcopy   # queda en el portapapeles
```

Es `PRAXIS_INTERNAL_SECRET` en Kyloo y `KYLOO_INTERNAL_SECRET` en Praxis: **el mismo valor** (mínimo 32).

## 2. KYLOO-AUTH: migración (aditiva, la versión vieja la ignora)

```bash
cd ../KYLOO-AUTH && pnpm --filter @kyloo-auth/api build
DBURL=$(railway variables --service kyloo-auth-db --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
railway run --service kyloo-auth-api -- env DATABASE_URL="$DBURL" pnpm --filter @kyloo-auth/api run db:migrate
```

## 3. KYLOO-AUTH: variables de `kyloo-auth-api`

Comprueba primero con `railway variables --service kyloo-auth-api` cuáles existen ya
(`RESEND_API_KEY` en particular: con la verificación de correo activa, sin correo nadie se registra).

```bash
railway variables --service kyloo-auth-api \
  --set REQUIRE_EMAIL_VERIFICATION=true \
  --set RATE_LIMIT_ENABLED=true \
  --set DCR_ENABLED=true \
  --set MCP_RESOURCES=https://usepraxis.space/api/mcp \
  --set PRAXIS_INTERNAL_URL=https://usepraxis.space \
  --set PRAXIS_INTERNAL_SECRET="$(pbpaste)"
```

Si falta `RESEND_API_KEY`, ponla también. Si el dominio público de Praxis es `www.usepraxis.space`,
úsalo en `MCP_RESOURCES` y `PRAXIS_INTERNAL_URL`: **tiene que ser exactamente el que ve el cliente de IA**
(el `aud` del token se compara carácter a carácter).

## 4. KYLOO-AUTH: subir el código

Rama `fix/endurecimiento-y-mcp` → `main` → push. Railway redepliega `kyloo-auth-api` y
`kyloo-auth-accounts`. Comprueba:

```bash
curl -s https://accounts.kyloo.com.mx/.well-known/openid-configuration | head -c 300
```

## 5. Dar de alta Praxis como cliente (el secreto sale una sola vez)

```bash
railway run --service kyloo-auth-api -- env DATABASE_URL="$DBURL" \
  pnpm --filter @kyloo-auth/api run seed:clients praxis https://usepraxis.space/auth/api/kyloo/callback
```

Anota `client_id` y `client_secret`.

## 6. Praxis: variables

`praxis-api` (el monolito):

```bash
cd ../PRAXIS && railway link --project "KYLOO SPACE" --environment production
railway variables --service praxis-api \
  --set KYLOO_ISSUER=https://accounts.kyloo.com.mx/api/auth \
  --set KYLOO_CLIENT_ID=<client_id> --set KYLOO_CLIENT_SECRET=<client_secret> \
  --set MCP_RESOURCE_URL=https://usepraxis.space/api/mcp \
  --set KYLOO_INTERNAL_SECRET="$(pbpaste)"
```

`praxis-web` (`NEXT_PUBLIC_KYLOO_LOGIN` se incrusta al **compilar**: ponla antes del push):

```bash
railway variables --service praxis-web \
  --set KYLOO_ISSUER=https://accounts.kyloo.com.mx/api/auth \
  --set KYLOO_CLIENT_ID=<client_id> \
  --set MCP_RESOURCE_URL=https://usepraxis.space/api/mcp \
  --set NEXT_PUBLIC_KYLOO_LOGIN=1
```

## 7. Praxis: subir el código

Rama `feature/descripcion-md-legal-oauth` → `main` → push. El pre-deploy (`migrar.sh`) aplica las dos
migraciones de credentials (`kylooSub`, `McpConnection`).

## 8. Prueba final

1. `/auth/login` muestra «Continuar con Kyloo» junto a Google y entra.
2. Descripción de una tarea: editor con barra al enfocar; guardar y reabrir conserva el formato.
3. `/terminos`, `/privacidad` y Configuración → los dos documentos.
4. ChatGPT / Claude web: añadir conector MCP `https://usepraxis.space/api/mcp` → login Kyloo →
   `/organizacion` → `/consentimiento` → herramientas. Cambiar de organización con
   `switch_organization` o desde Integraciones, sin reconectar.
5. Revocar la conexión en Integraciones → la siguiente llamada da 401.

Si el cliente de IA rechaza el `redirect_uri`, es `DCR_REDIRECT_ORIGINS` en `kyloo-auth-api`
(`cursor://` no está soportado).

## Pendiente de la persona responsable

`razonSocial` y `domicilio` en `apps/frontend/web/src/content/legal/entidad.ts`, y los buzones
`privacidad@` y `soporte@usepraxis.space`.
