# Notificaciones push: puesta en producción

Para [PLAN-PUSH](../PLAN-PUSH.md). Orden: variables → migración → código → cron.

## 1. Claves VAPID (una vez)

```bash
npx web-push generate-vapid-keys
```

En `praxis-api` (el monolito):

| Variable | Valor |
|---|---|
| `PUSH_VAPID_PUBLIC_KEY` | la pública |
| `PUSH_VAPID_PRIVATE_KEY` | la privada (**secreto**; si se cambia, todas las suscripciones dejan de valer) |
| `PUSH_VAPID_SUBJECT` | `mailto:<correo de contacto>` |
| `PUSH_CRON_SECRET` | `openssl rand -base64 48 \| tr -d '\n='` (mínimo 32) |

Sin las dos claves el push queda apagado y nada falla.

## 2. Migración

Aditiva (una tabla nueva). `pnpm prisma:deploy` como siempre.

## 3. Cron en Railway

Un servicio nuevo en el proyecto `KYLOO SPACE`, **sin código**: una imagen mínima con `curl`.

- **Cron Schedule:** `0 6,18 * * *` (UTC) = 00:00 y 12:00 de México.
- **Start command:**
  ```bash
  curl -fsS -X POST -H "x-cron-secret: $PUSH_CRON_SECRET" https://<dominio de praxis-web>/api/internal/push/vencimientos
  ```
- **Variable:** `PUSH_CRON_SECRET` con el mismo valor que en `praxis-api`.

Railway solo cobra los segundos que dura. El monolito despierta, responde y se vuelve a dormir tras
`PRAXIS_REPOSO_MS` (5 min).

### Probarlo a mano

```bash
curl -X POST -H "x-cron-secret: $PUSH_CRON_SECRET" "https://<web>/api/internal/push/vencimientos?modo=hoy"
# → {"modo":"hoy","tareas":3,"personas":2,"enviados":2}
```

`401` = secreto distinto · `404` = el monolito no tiene `PUSH_CRON_SECRET`.

## 4. Comprobación en el teléfono

1. iPhone: app instalada (Compartir → Añadir a pantalla de inicio), iOS ≥ 16.4.
2. *Tú* → *Notificaciones* → activar → aceptar el permiso.
3. Desde otra cuenta, escribirte en un chat con la app cerrada → debe llegar.
