import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * La mitad del lado del navegador de «Entrar con Kyloo»: preparar el intento
 * (PKCE, `state`, `nonce`) y recordarlo hasta que Kyloo Accounts devuelva a la
 * persona.
 *
 * Lo que se guarda va en una **cookie firmada y httpOnly de 10 minutos**, no en
 * el servidor: este flujo no tiene sesión todavía —es justo lo que se está
 * pidiendo—, así que no hay dónde colgar el estado. Firmada para que nadie
 * pueda fabricar un intento con un `nonce` a su gusto; httpOnly porque lleva el
 * verificador PKCE, que es el secreto que ata el código a este navegador.
 */
export const KYLOO_FLOW_COOKIE = 'praxis_kyloo_flow';

/**
 * Se pone al cerrar sesión en Praxis y hace que la **siguiente** entrada con Kyloo cierre
 * antes la sesión de Kyloo (`/salir` en Accounts) y empiece de cero.
 *
 * Cerrar sesión en Praxis no cierra la de Kyloo en el momento —es una cuenta compartida con otros
 * productos—, así que sin esto «Entrar» la reutilizaba sin preguntar: en un equipo compartido,
 * quien se sienta después entraba en la cuenta de la anterior, y nadie podía cambiar de cuenta
 * (Pepe → Juan). Se descartó `prompt=login`: con «Continuar con Google» la autorización volvía a
 * pedir login en bucle. 12 horas: cubre «salí y vuelvo luego», y no se queda para siempre.
 */
export const KYLOO_RELOGIN_COOKIE = 'praxis_kyloo_relogin';
export const KYLOO_RELOGIN_SEGUNDOS = 12 * 60 * 60;
const DURACION_SEG = 10 * 60;

export interface IntentoKyloo {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** A dónde volver tras entrar. Siempre una ruta de esta aplicación. */
  next: string;
}

export interface ConfigKyloo {
  issuer: string;
  clientId: string;
}

/** El cliente OIDC, o `null` si este entorno no tiene Kyloo configurado. */
export function configKyloo(): ConfigKyloo | null {
  const issuer = process.env.KYLOO_ISSUER?.replace(/\/$/, '');
  const clientId = process.env.KYLOO_CLIENT_ID;
  return issuer && clientId ? { issuer, clientId } : null;
}

/**
 * El origen con el que está dado de alta el cliente en Accounts. La `redirect_uri`
 * tiene que coincidir carácter a carácter, y la aplicación responde en
 * `usepraxis.space` y en `www.usepraxis.space`: sin esto, quien entra por el
 * segundo recibe `invalid_redirect` de Accounts. Sale del origen público del MCP,
 * que ya es el canónico; sin esa variable (desarrollo) vale el de la petición.
 */
export function origenCanonico(origenDePeticion: string): string {
  try {
    const canonico = process.env.MCP_RESOURCE_URL;
    return canonico ? new URL(canonico).origin : origenDePeticion;
  } catch {
    return origenDePeticion;
  }
}

/**
 * ¿Kyloo es la única puerta? (`AUTH_MODE=kyloo`, docs/PLAN-AUTH-KYLOO.md). Se lee en cada
 * llamada y no al cargar el módulo: es una variable de ejecución, no de compilación.
 */
export function entradaDelegada(): boolean {
  return process.env.AUTH_MODE === 'kyloo' && configKyloo() !== null;
}

/** A dónde mandar a quien pide una pantalla de acceso propia cuando Kyloo es la única puerta. */
export function rutaDeKyloo(screen: 'login' | 'signup', next?: string | null): string {
  const params = new URLSearchParams();
  if (screen === 'signup') params.set('screen', 'signup');
  if (next) params.set('next', next);
  const query = params.toString();
  return `/auth/api/kyloo/start${query ? `?${query}` : ''}`;
}

/**
 * Solo rutas de esta aplicación: `//evil.com` y `/\evil.com` son rutas
 * «relativas» para un `startsWith('/')` y abrirían una redirección a otro sitio
 * tras autenticarse.
 */
export function rutaSegura(pedida: string | null | undefined, porDefecto = '/projects'): string {
  if (pedida && /^\/(?!\/)/.test(pedida) && !pedida.includes('\\')) return pedida;
  return porDefecto;
}

const aleatorio = (bytes: number) => randomBytes(bytes).toString('base64url');

export function nuevoIntento(next: string): IntentoKyloo {
  return {
    state: aleatorio(24),
    nonce: aleatorio(24),
    // 32 bytes -> 43 caracteres: el mínimo de RFC 7636.
    codeVerifier: aleatorio(32),
    next,
  };
}

export function desafioPkce(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function urlDeAutorizacion(
  config: ConfigKyloo,
  intento: IntentoKyloo,
  redirectUri: string,
  opciones: {
    /** `signup` abre Kyloo en «Crear cuenta» en vez de «Iniciar sesión» (convención `screen_hint`). */
    screenHint?: 'signup';
  } = {},
): string {
  const url = new URL(`${config.issuer}/oauth2/authorize`);
  url.search = new URLSearchParams({
    ...(opciones.screenHint ? { screen_hint: opciones.screenHint } : {}),
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: intento.state,
    nonce: intento.nonce,
    code_challenge: desafioPkce(intento.codeVerifier),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

function clave(): Uint8Array {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) throw new Error('JWT_SECRET no está definido');
  return new TextEncoder().encode(secreto);
}

export async function sellarIntento(intento: IntentoKyloo): Promise<string> {
  return new SignJWT({ ...intento, typ: 'kyloo-flow' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SEG}s`)
    .sign(clave());
}

export async function abrirIntento(valor: string | undefined): Promise<IntentoKyloo | null> {
  if (!valor) return null;
  try {
    const { payload } = await jwtVerify(valor, clave(), { algorithms: ['HS256'] });
    if (payload.typ !== 'kyloo-flow') return null;
    const { state, nonce, codeVerifier, next } = payload as Partial<IntentoKyloo>;
    if (!state || !nonce || !codeVerifier || !next) return null;
    return { state, nonce, codeVerifier, next };
  } catch {
    return null;
  }
}

export const opcionesCookieIntento = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // `lax` y no `strict`: la vuelta desde Kyloo Accounts es una navegación de
  // otro sitio, y con `strict` el navegador no enviaría la cookie.
  sameSite: 'lax' as const,
  path: '/auth/api/kyloo',
  maxAge: DURACION_SEG,
};

/** Mensajes de la pantalla de entrada según `?kyloo_error=`. */
export const ERRORES_KYLOO: Record<string, string> = {
  no_disponible:
    'Kyloo no responde ahora mismo. Entra con tu correo y contraseña de Praxis o con Google.',
  cancelado: 'Cancelaste la entrada con Kyloo.',
  intento_invalido: 'El intento de entrada caducó. Vuelve a pulsar «Continuar con Kyloo».',
  no_verificado: 'Kyloo no pudo verificar tu cuenta. Inténtalo de nuevo.',
  sin_confirmar:
    'Ya existe una cuenta de Praxis con este correo sin confirmar. Confírmala con el enlace que se te envió al registrarla y vuelve a intentarlo.',
  vinculada: 'Esa cuenta de Praxis ya está vinculada a otra cuenta de Kyloo.',
  limite: 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  error:
    'No se pudo iniciar sesión con Kyloo. Puedes entrar con tu correo y contraseña de Praxis o con Google.',
};
