# Plan OAuth y Kyloo Accounts — borrador

> **Estado: borrador, por discutir** (2026-10-02). No hay nada decidido ni
> implementado. Es el punto de partida de una conversación pendiente con el
> dueño, que va a enseñar `accounts.kyloo.com.mx` en otra sesión: **este
> documento se reescribe después de verlo**. Es M7 de [PLAN-MCP.md](PLAN-MCP.md)
> y lo que falta para que [PLAN-PRO-INTEGRACIONES.md](PLAN-PRO-INTEGRACIONES.md)
> pueda prometer «conecta tu ChatGPT».

---

## Para qué

Hoy el MCP solo lo pueden usar perfiles técnicos: hay que crear un token y
pegarlo en un archivo de configuración (Claude Code, Codex, Cursor, Claude
Desktop). **ChatGPT y Claude en la web solo aceptan conectores con OAuth**, y ahí
está la gente no técnica: un jefe de proyecto no edita `config.toml`.

Con OAuth, conectar es «Añadir conector» → se abre Praxis → inicias sesión →
eliges organización y permisos → «Permitir». Sin copiar nada, sin un token
largo pegado en un archivo, con accesos que caducan y se renuevan solos.

## Qué es un servidor OAuth, en una frase

El «inicia sesión con Praxis» para aplicaciones de terceros: una pantalla de
login + una de consentimiento, y unas rutas que entregan y renuevan tokens. El
MCP solo tiene que anunciar quién emite sus tokens
(`/.well-known/oauth-protected-resource`) y verificarlos. **La especificación
de MCP separa a propósito el servidor del MCP (Praxis) del servidor de
autorización**: pueden vivir en sitios distintos.

## Dónde puede vivir: tres opciones

| | Dentro de Praxis | En Kyloo Accounts, con las cuentas allí | En Kyloo Accounts, por vinculación |
|---|---|---|---|
| Qué es | credentials-service emite los tokens | Accounts es el único login de todos los productos | Cada producto conserva sus cuentas; Accounts dice «este correo es esta persona en todos» |
| Coste | El menor | El mayor: mover el login de Praxis a Accounts antes | Medio |
| Sirve a otros productos de Kyloo | No | Sí | Sí |
| Riesgo | Bajo | Alto: una caída de Accounts deja fuera a todos los productos | Medio |

**La idea del dueño (2026-10-02), que recogió de otra sesión: vinculación.**
Las cuentas viven en los dos sitios. Los roles, permisos y planes son de cada
producto y se quedan en él; Kyloo Accounts solo acredita la identidad —«este
correo es de esta persona y usa la misma cuenta en todo Kyloo»—. Encaja con
cómo está hecho Praxis: credentials no sabe de organizaciones ni de planes, y no
tendría por qué saberlo Accounts.

## Cómo quedaría con vinculación (a confirmar al ver Accounts)

1. **Accounts es el proveedor de identidad** (como «Iniciar sesión con Google»):
   Praxis añade «Entrar con Kyloo» al lado de Google. La primera vez se vincula
   la cuenta de Praxis con la de Kyloo por el correo **verificado** (nunca por
   un correo sin verificar: es la trampa de heredar cuentas ajenas que ya evita
   `googleSub`).
2. **El servidor OAuth para el MCP puede vivir en Praxis o en Accounts.**
   - En Praxis: la pantalla de consentimiento sabe de organizaciones y
     permisos, que son de Praxis. Es lo natural con vinculación.
   - En Accounts: un solo servidor para todos los productos, pero la pantalla
     de consentimiento tendría que preguntar a cada producto qué organizaciones
     y permisos ofrecer.
3. **Lo que no cambia**: el token del MCP sigue atado a una organización (I2),
   con alcances `read`/`write`/`delete`, y se canjea por el mismo JWT corto de
   M5. OAuth es otra forma de obtener el token, no otro MCP.

## Preguntas para la conversación

1. ¿Qué hay hoy en `accounts.kyloo.com.mx`? Base de datos, stack, si ya emite
   tokens, si guarda contraseñas.
2. ¿Vinculación por correo verificado, o también por un identificador estable
   de Kyloo (como el `sub` de Google)?
3. ¿Qué pasa si una persona cambia el correo en un producto y no en otro?
4. ¿El login de Praxis se mantiene tal cual y «Entrar con Kyloo» es una opción
   más, o con el tiempo se sustituye?
5. ¿El servidor OAuth del MCP vive en Praxis o en Accounts?
6. ¿Prioridad frente a GitHub (P3)? Si el argumento comercial de Pro es
   «conecta tu ChatGPT», OAuth deja de ser opcional.

## Lo que ya se sabe

- El MCP ya mide su uso: una línea `mcp_tool_call` por llamada (M12). Antes de
  invertir aquí, mirar si se usa.
- Claude Desktop ya funciona sin OAuth (`mcp-remote`); ChatGPT y Claude web no.
- Tocar el login es superficie de seguridad nueva: cualquier fallo es una
  puerta a cuentas ajenas, no un error menor.
