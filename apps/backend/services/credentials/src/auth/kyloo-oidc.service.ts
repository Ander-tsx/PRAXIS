import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { type JWTPayload, createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';

/** Lo que Praxis lee de la identidad de Kyloo. El resto del id_token no se usa. */
export interface PerfilKyloo {
  sub: string;
  email: string;
  name: string;
}

interface Descubrimiento {
  issuer: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

/**
 * El cliente OIDC de Kyloo Accounts: canjea el `code` y verifica el id_token.
 *
 * Se hace **aquí y no en el servidor web** por una razón: el secreto del cliente
 * (`KYLOO_CLIENT_SECRET`) solo debe existir en el backend, y la verificación del
 * token es la parte que no puede salir mal en silencio.
 *
 * ## Qué se comprueba, y por qué cada cosa
 *
 * - **Firma** contra el JWKS de Accounts: sin ella el token no vale nada.
 * - **`iss`** igual al emisor configurado: un token de otro emisor con claves
 *   propias pasaría la firma de su propio JWKS.
 * - **`aud`** igual a nuestro `client_id`: es lo que impide que el id_token que
 *   Accounts emitió para otra aplicación (Oskel) sirva para entrar en Praxis.
 * - **`nonce`** igual al de nuestro intento: ata el token a esta petición y no
 *   a una anterior que alguien haya capturado.
 * - **`email_verified === true`**: la vinculación decide por el correo, y un
 *   correo sin confirmar no identifica a nadie.
 *
 * ## El correo no viene en el id_token
 *
 * Kyloo Accounts (Better Auth) emite un id_token con `sub`, `aud`, `nonce`… pero
 * **sin `email`, `name` ni `email_verified`**: esos claims solo salen por
 * `userinfo`. Se llama con el access token recién canjeado y se exige que su
 * `sub` sea el del id_token, para que un `userinfo` de otra persona no se
 * mezcle con una identidad ya verificada.
 */
@Injectable()
export class KylooOidcService {
  private readonly log = new Logger(KylooOidcService.name);
  private descubrimiento?: Promise<Descubrimiento>;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  private requerir() {
    const issuer = this.config.get<string>('KYLOO_ISSUER');
    const clientId = this.config.get<string>('KYLOO_CLIENT_ID');
    const clientSecret = this.config.get<string>('KYLOO_CLIENT_SECRET');
    /* Como Google: sin configurar, el resto de la autenticación funciona y solo
       este camino responde 503 diciendo qué falta. */
    if (!issuer || !clientId || !clientSecret) {
      throw new RpcException({
        statusCode: 503,
        message: 'La entrada con Kyloo no está configurada en este entorno',
      });
    }
    return { issuer: issuer.replace(/\/$/, ''), clientId, clientSecret };
  }

  private descubrir(issuer: string): Promise<Descubrimiento> {
    this.descubrimiento ??= (async () => {
      const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`discovery ${res.status}`);
      const doc = (await res.json()) as Descubrimiento;
      /* El documento tiene que declararse del emisor que configuramos: si no,
         quien controle esa respuesta controla hacia dónde enviamos el secreto. */
      if (doc.issuer !== issuer) throw new Error('el emisor del documento no coincide');
      return doc;
    })().catch((e) => {
      this.descubrimiento = undefined; // un fallo no se queda cacheado
      throw e;
    });
    return this.descubrimiento;
  }

  async perfilDesdeCodigo(entrada: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<PerfilKyloo> {
    const { issuer, clientId, clientSecret } = this.requerir();

    let doc: Descubrimiento;
    try {
      doc = await this.descubrir(issuer);
    } catch (e) {
      this.log.error(`No se pudo leer la configuración de Kyloo Accounts: ${String(e)}`);
      throw new RpcException({ statusCode: 502, message: 'Kyloo Accounts no responde' });
    }

    let cuerpo: { id_token?: string; access_token?: string };
    try {
      const res = await fetch(doc.token_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(
            `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: entrada.code,
          redirect_uri: entrada.redirectUri,
          code_verifier: entrada.codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`token ${res.status}`);
      cuerpo = (await res.json()) as { id_token?: string; access_token?: string };
    } catch (e) {
      /* Código caducado, ya usado, verificador distinto o redirect distinta:
         todo significa lo mismo hacia fuera. */
      this.log.warn(`Canje de código rechazado por Kyloo Accounts: ${String(e)}`);
      throw new RpcException({ statusCode: 401, message: 'Kyloo no aceptó el intento de entrada' });
    }
    if (!cuerpo.id_token || !cuerpo.access_token) {
      throw new RpcException({ statusCode: 401, message: 'Kyloo no devolvió identidad' });
    }

    const { sub } = await this.verificar(cuerpo.id_token, doc, {
      issuer,
      clientId,
      nonce: entrada.nonce,
    });
    return this.perfilDeUserinfo(sub, doc.userinfo_endpoint, cuerpo.access_token);
  }

  private async perfilDeUserinfo(
    sub: string,
    endpoint: string,
    accessToken: string,
  ): Promise<PerfilKyloo> {
    let info: unknown;
    try {
      const res = await fetch(endpoint, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`userinfo ${res.status}`);
      info = await res.json();
    } catch (e) {
      this.log.warn(`userinfo de Kyloo Accounts falló: ${String(e)}`);
      throw new RpcException({ statusCode: 502, message: 'Kyloo Accounts no responde' });
    }
    return this.exigirPerfil(sub, info);
  }

  /** Las reglas sobre lo que dice `userinfo`; aparte para poder probarlas sin red. */
  exigirPerfil(sub: string, info: unknown): PerfilKyloo {
    const datos = (info ?? {}) as {
      sub?: unknown;
      email?: unknown;
      email_verified?: unknown;
      name?: unknown;
    };
    if (datos.sub !== sub) {
      throw new RpcException({ statusCode: 401, message: 'La identidad de Kyloo no es coherente' });
    }
    if (typeof datos.email !== 'string' || datos.email_verified !== true) {
      throw new RpcException({
        statusCode: 401,
        message: 'Kyloo no confirma este correo como verificado',
      });
    }
    return {
      sub,
      email: datos.email.toLowerCase(),
      name: typeof datos.name === 'string' ? datos.name : '',
    };
  }

  async verificar(
    idToken: string,
    doc: Pick<Descubrimiento, 'jwks_uri'>,
    esperado: { issuer: string; clientId: string; nonce: string },
    /** Solo las pruebas pasan un conjunto de claves propio. */
    jwks?: ReturnType<typeof createLocalJWKSet>,
  ): Promise<{ sub: string }> {
    let claves = jwks;
    if (!claves) {
      this.jwks ??= createRemoteJWKSet(new URL(doc.jwks_uri));
      claves = this.jwks;
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, claves, {
        issuer: esperado.issuer,
        audience: esperado.clientId,
      }));
    } catch {
      throw new RpcException({ statusCode: 401, message: 'La identidad de Kyloo no es válida' });
    }

    if (payload.nonce !== esperado.nonce) {
      throw new RpcException({
        statusCode: 401,
        message: 'La identidad de Kyloo no es de este intento',
      });
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new RpcException({ statusCode: 401, message: 'La identidad de Kyloo no trae sujeto' });
    }
    return { sub: payload.sub };
  }
}
