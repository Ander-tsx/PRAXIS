# Pasar Stripe a modo real

> Escrito el 2026-09-03 al configurar el plan Pro, y **ejecutado el mismo día**.
> Lo que queda pendiente está al final, en «Lo único que falta».
>
> ⚠️ **Activar la cuenta y las dos claves no los puede hacer un agente**, y no es
> una limitación del proyecto: lo primero exige datos bancarios y fiscales, y las
> segundas son credenciales. Van a mano, siempre.

---

## Lo que ya está listo

Se auditó el código antes de escribir esto:

| Comprobación | Resultado |
|---|---|
| Identificadores de prueba incrustados (`sk_test`, `price_…`, `whsec_`) | ✅ Ninguno. Todo sale del entorno |
| Autenticación del webhook | ✅ Firma verificada con el SDK (tiempo constante, rechaza marcas viejas) |
| Comportamiento sin claves | ✅ Degrada solo: avisa al arrancar y no ofrece ningún botón de compra |
| Precios por asiento | ✅ `quantity: seats` en el checkout |

O sea: **no hay que tocar código para ir a producción.** Lo que cambia son cinco
variables y los objetos de Stripe.

---

## Los cinco pasos

### 1. ✅ Activar la cuenta — **hecho**

Stripe → **Activate account**. Pide razón social, RFC, domicilio y **cuenta
bancaria** para los pagos. Sin esto no existe el modo real: el conmutador de
arriba a la izquierda seguirá diciendo «Sandbox».

Suele tardar de minutos a un par de días según lo que pida verificar.

### 2. ✅ Los productos en modo real — **hecho**

Se resolvió con el «copy to live account» de Stripe, que trae los productos con
**identificadores nuevos** — los de sandbox no existen en modo real y darían
`No such price`. Los tres, ya verificados uno a uno:

| Plan | Producto | Importe | `price_…` de producción |
|---|---|---|---|
| Pro | PRAXIS PRO | $60.00 MXN | `price_1UBfUbRtjrkmFx5tc3B4F5hW` |
| Equipo | PRAXIS Equipo | $90.00 MXN | `price_1UBfUbRtjrkmFx5t5Zry1pqI` |
| Negocio | PRAXIS Empresa | $150.00 MXN | `price_1UBfUbRtjrkmFx5tBRTh6SNP` |

Los tres: recurrentes, mensuales, MXN, «Flat rate» —o sea multiplicados por
`quantity`, que es lo que los hace por asiento— y **sin periodo de prueba**.

Tres detalles que no se pueden equivocar:

- 🔴 **«Standard pricing» / «Flat rate», nunca «tiered» ni tarifa plana.** El
  checkout manda `quantity: <asientos>`; con un precio que no se multiplique,
  cincuenta asientos costarían lo que uno.
- 🔴 **Sin periodo de prueba en el precio.** Los 30 días del plan Equipo los
  aplica el código (`trial_period_days` desde el catálogo). Si además lo pones en
  Stripe, **los dos se suman** y salen dos meses gratis — sin ningún error, y no
  se nota hasta el recibo que no llega.
- **La misma moneda en los tres.** Mezclar MXN y USD parte los informes y obliga
  a Stripe a decidir por su cuenta en el checkout.

### 3. ✅ El webhook — **creado, falta copiar su secreto**

Destino `we_1UBfb0RtjrkmFx5tCdayMkrC`, activo, escuchando los **cuatro** eventos
que el código maneja (`checkout.session.completed` y los tres de
`customer.subscription.*`).

```
https://usepraxis.space/api/webhooks/stripe
```

⚠️ **Va por el dominio de la web, no por el del `api`.** El gateway no tiene
ruta pública: `web/src/app/api/webhooks/stripe/route.ts` recibe y reenvía el
cuerpo **byte a byte** al gateway, porque la firma se calcula sobre esos bytes
exactos. Un `rewrite()` no valdría —Next los resuelve al construir— y
`createGatewayProxy()` tampoco, porque borra `Authorization` para meter la
cookie de sesión, y aquí no hay sesión: la autenticación **es** la firma.

⚠️ **El `whsec_` de sandbox no vale en modo real.** Son endpoints distintos con
secretos distintos. Con el equivocado, el gateway rechaza **todos** los
webhooks: el cobro se hace y el plan no se concede nunca.

### 4. Las variables en Railway — **tres de cinco hechas**

Servicio **`praxis-api`**:

| Variable | Estado |
|---|---|
| `STRIPE_PRICE_PRO` | ✅ puesta, con el `price_…` de producción |
| `STRIPE_PRICE_TEAM` | ✅ ídem |
| `STRIPE_PRICE_BUSINESS` | ✅ ídem |
| `STRIPE_SECRET_KEY` | 🔴 **falta** — `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | 🔴 **falta** — el `whsec_…` del paso 3 |

Servicio **`praxis-web`**: ✅ `NEXT_PUBLIC_PRECIO_PRO=60`, `_TEAM=90`,
`_BUSINESS=150`.

⚠️ **Todo está en cola, sin desplegar.** A propósito: sin las dos claves el
gateway arranca con la facturación desactivada, así que desplegar ahora sería un
reinicio para nada. Se despliega una vez, al final.

⚠️ **`praxis-web` necesita rebuild, no reinicio.** Las `NEXT_PUBLIC_*` se
incrustan al construir; cambiarlas y reiniciar deja las de antes, sin ningún
aviso.

⚠️ **Y son cartelería.** Lo que se cobra es el `price_…` del gateway. Nada
mantiene sincronizadas las dos cosas: si cambias una tarifa, cambia las dos.

### 5. Comprobar

Con una tarjeta de verdad, porque en modo real las de prueba no funcionan:

1. `/main/billing` → los cuatro planes con precio, Pro en segundo lugar.
2. Contratar Pro con 3 asientos → Stripe debe enseñar **$180**, no $60.
3. Pagar → vuelves a `/main/billing?pago=ok` y el plan cambia **en unos
   segundos**, cuando llega el webhook. Si se queda en el plan viejo, es el paso
   3: mira los intentos de webhook en Stripe.
4. Intentar Equipo con 20 asientos → debe rechazarlo («llega hasta 15 asientos»).

---

## Lo único que falta

**Dos claves, y las pega quien tenga acceso a la cuenta.** No las introduce un
agente.

1. Stripe → **Developers → API keys** → copia la **clave secreta** (`sk_live_…`).
2. Stripe → **Workbench → Webhooks →** el destino `PRAXIS produccion` → sección
   **Signing secret** → el icono del ojo para revelarlo (`whsec_…`).
3. Railway → `praxis-api` → **Variables → New Variable**, una por una:
   `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.
4. **Deploy** en `praxis-api`, y **Deploy** en `praxis-web`.

⚠️ **`praxis-web` necesita construir, no reiniciar.** Las `NEXT_PUBLIC_*` se
incrustan al construir; un reinicio dejaría la tabla sin precios y sin decir por
qué.

## Lo que conviene saber antes de abrir la puerta

⚠️ **Las suscripciones de prueba no se migran.** En el sandbox hay 5 activas
sobre el PRO viejo de $120. No existen en modo real y no hay que hacer nada con
ellas; solo no confundirlas con clientes.

⚠️ **El `PRO` de $120 del sandbox es el plan retirado**, no el Pro nuevo. Si
recreas productos en modo real, **no copies ese importe**: era una suscripción
por persona y quedaba por encima de Equipo.

⚠️ **Un solo cliente de Stripe por persona, no por organización.** Quien pague
dos organizaciones verá las dos suscripciones en el mismo portal. No es un
riesgo —todo lo de dentro es suyo— pero el botón no puede prometer «gestiona la
suscripción de este equipo». Está anotado como punto abierto en
`PLAN-ORGANIZACION-ACTIVA.md` (I5).

⚠️ **El plan lo concede el webhook, jamás la vuelta del navegador.** La
`success_url` la puede escribir cualquiera. No se cambia esto nunca (I3).
