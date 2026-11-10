# Notificaciones push: puesta en producción

Para [PLAN-PUSH](../PLAN-PUSH.md). Orden: variables → migración → código.

> ✂️ **El recordatorio de vencimientos y su cron se retiraron el 2026-11-09** (decisión del dueño del
> producto): ya no existen `praxis-push-cron`, `PUSH_CRON_SECRET` ni `POST /api/internal/push/vencimientos`.
> Quedan las notificaciones push de mensajes, que son instantáneas y no dependen de ningún cron.

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

Sin las dos claves el push queda apagado y nada falla.

## 2. Migración

Aditiva (una tabla nueva). `pnpm prisma:deploy` como siempre.

## 3. Comprobación en el teléfono

1. iPhone: app instalada (Compartir → Añadir a pantalla de inicio), iOS ≥ 16.4.
2. *Tú* → *Notificaciones* → activar → aceptar el permiso.
3. Desde otra cuenta, escribirte en un chat con la app cerrada → debe llegar.
