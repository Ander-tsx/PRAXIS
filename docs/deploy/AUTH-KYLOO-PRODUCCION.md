# Kyloo como único login: puesta en producción

Pasos de [PLAN-AUTH-KYLOO](../PLAN-AUTH-KYLOO.md). **Ninguna migración nueva** en ninguno de los dos
repositorios, y `AUTH_MODE` es una variable: lo que se despliega primero no cambia nada visible, y
activarlo o volver atrás es poner o quitar esa variable.

Supone hecho [OAUTH-KYLOO-PRODUCCION](OAUTH-KYLOO-PRODUCCION.md): el cliente `praxis` ya existe en
Kyloo, y `PRAXIS_INTERNAL_URL`, `PRAXIS_INTERNAL_SECRET` y `KYLOO_INTERNAL_SECRET` ya están puestos
(los dos últimos, con el mismo valor). La migración perezosa y la revocación usan ese mismo canal firmado.

## 1. Subir el código (en este orden)

1. **KYLOO-AUTH**: rama `feature/auth-kyloo` → `main` → push. Redespliega `kyloo-auth-api` y `kyloo-auth-accounts`.
2. **Praxis**: rama `feature/auth-kyloo` → `main` → push. Redespliega `praxis-api` y `praxis-web`.

Con `AUTH_MODE` sin definir, Praxis se comporta exactamente como antes. Comprueba que se entra con tu
contraseña de siempre.

## 2. Probar la migración antes de activar nada

1. Abre `https://accounts.kyloo.com.mx/entrar` y entra con **tu correo de Praxis y tu contraseña de Praxis**.
   Kyloo no te conoce, pregunta a Praxis, y crea tu cuenta con tu contraseña. (Si ya tenías cuenta en
   Kyloo, entras con la de Kyloo: no se toca.)
2. Si te registraste en Praxis solo con Google, no hay contraseña que migrar: en Kyloo usa
   «Continuar con Google» con el mismo correo.

## 3. Activar

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
cd ../KYLOO-AUTH   # el proyecto de Railway ya está enlazado
railway variable set AUTH_MODE=kyloo --service praxis-api
railway variable set AUTH_MODE=kyloo --service praxis-web
```

Las dos. La web redirige las pantallas; el backend cierra las rutas de contraseña y Google (403
`AUTH_DELEGATED`) por si alguien llama a la API directo.

Comprueba:

- `https://usepraxis.space/auth/login` y `/auth/signup` te llevan a Kyloo («Praxis by Kyloo»).
  `/auth/signup` abre en «Crear cuenta».
- Entras y llegas a Praxis con tu cuenta de siempre (mismos proyectos, mismos roles).
- Cambiar la contraseña en Kyloo cierra tus sesiones de Praxis.
- Una cuenta nueva en Kyloo, al volver a Praxis, nace con su espacio personal.

## 4. Volver atrás

Quitar `AUTH_MODE` (o ponerlo en `local`) en `praxis-api` y `praxis-web`. Las cuentas que ya se vincularon
a Kyloo **perdieron el hash de contraseña de Praxis** (a propósito, decisión D5): si vuelves a `local`,
esas personas entran con «Continuar con Kyloo» o con «¿Olvidaste tu contraseña?» en Praxis.

## Cosas que se esperan

- **Kyloo duerme.** El primer inicio de sesión tras un rato puede tardar unos segundos, y si Railway aún
  está despertando el servicio, un 502 puntual; recargar basta. Si Kyloo se vuelve indispensable, se
  desactiva `sleepApplication` en `kyloo-auth-api` y `kyloo-auth-accounts` (decisión D8).
- Los enlaces de correo viejos de Praxis (confirmar, restablecer) llevan a Kyloo.
- Los correos de verificación y de restablecer contraseña los envía Kyloo con su marca; solo el login se viste de Praxis.
