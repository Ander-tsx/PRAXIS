# Guion de la expo — dejar el sistema listo

> Los pasos, en orden, para vaciar la instalación desplegada y dejarla con el
> proyecto PRAXIS y su historial. Escrito para seguirse sin pensar.
>
> **Este documento no se versiona**: lleva comandos contra producción y una
> contraseña de administración.

## Antes de empezar

| Dato | Valor |
|---|---|
| Sitio | `https://usepraxis.space` |
| VM del backend | `praxis-backend-8tw2` · zona `us-east1-d` |
| Cloud SQL (IP privada) | `10.82.1.3` |
| Proyecto GCP | `project-1a6ad5d0-a98a-4663-93c` |

⚠️ **La VM cambia de nombre cada vez que el grupo rueda.** Si un comando falla
con «instance not found», saca el nombre actual:

```bash
gcloud compute instances list --filter="name~praxis-backend" --format="value(name,zone)"
```

---

## Paso 1 — Vaciar la instalación

🔴 **Esto borra todo: cuentas, proyectos, tareas y suscripciones de Stripe.**
Deja una sola cuenta, la de administración, con la contraseña que le pases.

```bash
VM=praxis-backend-8tw2
ZONA=us-east1-d

gcloud compute ssh "$VM" --tunnel-through-iap --zone "$ZONA" \
  --command "sudo docker exec \
    -e SEED_SUPERADMIN_EMAIL='andres.one.dev@gmail.com' \
    -e SEED_SUPERADMIN_PASSWORD='PON-AQUI-TU-CONTRASEÑA' \
    praxis-backend /app/migrar.sh --arranque-limpio"
```

⚠️ **No uses el correo con el que te vas a registrar después.** Si el
superadministrador ya ocupa `andres.one.dev@gmail.com`, tu registro por la
interfaz chocará con esa cuenta. Dos salidas:

- **Recomendada:** usa `superadmin@usepraxis.space` para el superadministrador y
  regístrate luego con tu correo normal. Así tienes las dos cosas separadas: una
  cuenta de plataforma y tu cuenta de trabajo.
- O usa tu correo aquí y **no** te registres después: entras con esa misma
  cuenta y ya tienes rol de administración.

El arranque limpio deja también un proyecto llamado «Sprint histórico (datos de
demostración)». **Se borra en el paso 4**, no hace falta tocarlo ahora.

---

## Paso 2 — Que se registre el equipo

Cada quien entra en `https://usepraxis.space/auth/signup` y se registra, con
contraseña o con Google — da igual, la cuenta es la misma.

| Persona | Correo |
|---|---|
| Ander | `andres.one.dev@gmail.com` |
| Sebastián | `sebastianjimenezmat@gmail.com` |
| Erick | `erickhumbertotc@gmail.com` |
| César | `20233tn076@utez.edu.mx` |

⚠️ **Registrarse exige confirmar el correo**, y ese mensaje lo manda Resend. Si
no llega —dominio sin verificar, correo en spam, lo que sea—, no os quedéis
atascados: se confirma a mano en el paso 3.

⚠️ **Quien entre con Google no necesita confirmar nada**: Google ya verificó ese
correo. Si alguien tiene prisa, esa es la vía rápida.

---

## Paso 3 — El túnel a la base

Todo lo que queda se hace contra Cloud SQL, que **no tiene IP pública**. El túnel
lo abre IAP y se queda ocupando la terminal: ábrelo en una pestaña aparte y
déjalo corriendo.

```bash
VM=praxis-backend-8tw2
ZONA=us-east1-d

gcloud compute ssh "$VM" --tunnel-through-iap --zone "$ZONA" -- -N -L "5433:10.82.1.3:5432"
```

La contraseña de la base sale de Secret Manager:

```bash
gcloud secrets versions access latest --secret=praxis-password-sql
```

### Si alguien no pudo confirmar su correo

En **otra** terminal, con el túnel abierto:

```bash
PGPASSWORD='<la-de-arriba>' psql -h localhost -p 5433 -U praxis -d praxis \
  -c "UPDATE credentials.credentials SET \"emailVerifiedAt\" = now() WHERE \"emailVerifiedAt\" IS NULL;"
```

Es lo mismo que hacen las pruebas end-to-end, y por el mismo motivo: el token del
enlace se guarda con hash y en claro solo existe dentro del correo.

---

## Paso 4 — Sembrar el proyecto

Con el túnel abierto, desde la raíz del repositorio:

```bash
PRAXIS_DUENO='andres.one.dev@gmail.com' \
PRAXIS_EQUIPO='sebastianjimenezmat@gmail.com,erickhumbertotc@gmail.com,20233tn076@utez.edu.mx' \
PRAXIS_BORRAR_DEMO=1 \
DATABASE_URL='postgresql://praxis:<la-contraseña>@localhost:5433/praxis?schema=tasks' \
pnpm --filter @praxis/tasks-service exec ts-node -r tsconfig-paths/register prisma/seed-praxis.ts
```

Debe terminar con algo así:

```
Equipo: Ander, Sebastián, Erick, César
Borrado el proyecto de demostración: Sprint histórico (datos de demostración)
Proyecto creado: <uuid>
  Ciclo 1 · Cimientos: 28 tareas
  …
  127 tareas, 98 cerradas (77 %).
```

⚠️ **Si dice «No hay ninguna cuenta con el correo …», para.** Significa que esa
persona todavía no se ha registrado, y el seeder no toca nada hasta tenerlos a
todos. Que se registre y vuelve a lanzarlo.

Es **idempotente**: lanzarlo dos veces rehace el historial, no lo duplica.

---

## Paso 5 — Comprobar

1. Entra en `https://usepraxis.space` con tu cuenta.
2. **Proyectos** → PRAXIS. Cuatro espacios, uno por ciclo.
3. **Análisis** → debe haber curva en las 32 semanas, percentiles separados y
   predicción de Monte Carlo. Tú, con más tareas cerradas y el mejor tiempo.
4. **Automatizaciones** → crea una regla de «una tarea está vencida» y pulsa
   «Revisar ahora»: hay tres vencidas y tres sin encargado esperando.
5. **Planes** → compra el PRO con `4242 4242 4242 4242`. Hazlo **después** del
   paso 1, o el reinicio se lo lleva.

---

## Qué enseñar, y en qué orden

1. **Entrar** — con Google, que es un clic y se ve moderno.
2. **El tablero** — arrastrar una tarjeta del ciclo en curso, abrirla, asignar.
3. **Análisis** — la curva de 32 semanas y la predicción. Es lo que ningún
   tablero de la competencia enseña sin configurar nada.
4. **PRAX** — preguntarle por el proyecto y aceptar una propuesta suya.
5. **Automatizaciones** — «Revisar ahora» y que salten los avisos en ámbar.
6. **El plan** — gastar la cuota y enseñar cómo lleva a comprar PRO.

⚠️ **Lo que NO conviene enseñar en vivo:** los correos de invitación (dependen
de Resend) y el borrado de cuentas desde administración (no hay vuelta atrás).
