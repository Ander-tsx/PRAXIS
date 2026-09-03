# Pasar Stripe a modo real

> Escrito el 2026-09-03, al configurar el plan Pro. Hoy **todo apunta al
> sandbox** (`sk_test_…`): no se cobra nada de verdad.
>
> ⚠️ **Los pasos 1, 2 y 4 no los puede hacer un agente**, y no es una limitación
> del proyecto: activar la cuenta exige datos bancarios y fiscales, y las claves
> son credenciales. Van a mano, siempre.

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

### 1. Activar la cuenta 🔴 *solo tú*

Stripe → **Activate account**. Pide razón social, RFC, domicilio y **cuenta
bancaria** para los pagos. Sin esto no existe el modo real: el conmutador de
arriba a la izquierda seguirá diciendo «Sandbox».

Suele tardar de minutos a un par de días según lo que pida verificar.

### 2. Recrear los productos en modo real 🔴 *solo tú, o yo si me lo pides luego*

⚠️ **Los objetos de prueba no existen en modo real.** No se migran, no se copian:
son dos mundos separados. Los `price_…` de hoy son de sandbox y en producción
darían `No such price`.

Hay que crear **tres precios**, uno por plan de autoservicio. Los de hoy, para
copiarlos:

| Plan | Producto | Importe | Recurrencia |
|---|---|---|---|
| Pro | PRAXIS PRO | $60.00 MXN | Mensual, **por asiento** |
| Equipo | PRAXIS Equipo | $90.00 MXN | Mensual, **por asiento** |
| Negocio | PRAXIS Empresa | $150.00 MXN | Mensual, **por asiento** |

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

### 3. El webhook 🔴 *solo tú*

Stripe (ya en modo real) → **Developers → Webhooks → Add endpoint**:

```
https://usepraxis.space/api/webhooks/stripe
```

Eventos: los de `checkout.session.*` y `customer.subscription.*`. Copia el
`whsec_…` que aparece **una sola vez**.

⚠️ **El `whsec_` de sandbox no vale en modo real.** Son endpoints distintos con
secretos distintos. Con el equivocado, el gateway rechaza **todos** los
webhooks: el cobro se hace y el plan no se concede nunca.

### 4. Las cinco variables en Railway 🔴 *solo tú (dos de ellas)*

Servicio **`praxis-api`** → Variables:

| Variable | Valor | ¿Secreto? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` | 🔴 **Sí** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del paso 3 | 🔴 **Sí** |
| `STRIPE_PRICE_PRO` | el `price_…` real de Pro | No |
| `STRIPE_PRICE_TEAM` | el de Equipo | No |
| `STRIPE_PRICE_BUSINESS` | el de Negocio | No |

Servicio **`praxis-web`** → `NEXT_PUBLIC_PRECIO_PRO`, `_TEAM`, `_BUSINESS` con
las cifras sin símbolo (`60`, `90`, `150`).

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
